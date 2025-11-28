
import { GoogleGenAI, Chat, GenerateContentResponse, Content } from "@google/genai";
import { AppConfig, KnowledgeFile, MemoryItem, VectorChunk } from "../types";
import { MEMORY_EXTRACTION_PROMPT, EMBEDDING_MODEL_ID } from "../constants";

export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve({
        inlineData: {
          data: base64String,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const CHUNK_SIZE_CHARS = 1000; // Smaller chunks for embedding

const chunkText = (text: string, size: number): string[] => {
    const chunks = [];
    for (let i = 0; i < text.length; i += size) {
        chunks.push(text.slice(i, i + size));
    }
    return chunks;
};

// --- Token Counting Utils (Heuristic) ---
// Approximate: 1 token ~= 4 chars for English, but often more for code/unicode.
// Images are fixed cost in some models (258) but standardizing to ~258 for calculation.
export const estimateTokens = (text: string): number => {
    return Math.ceil(text.length / 4);
};

export const estimateImageTokens = (): number => {
    return 258;
};

// --- Vector Math Utils ---

const dotProduct = (a: number[], b: number[]) => {
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result += a[i] * b[i];
    }
    return result;
};

const magnitude = (a: number[]) => {
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result += a[i] * a[i];
    }
    return Math.sqrt(result);
};

const cosineSimilarity = (a: number[], b: number[]) => {
    if (!a || !b || a.length !== b.length) return 0;
    const magA = magnitude(a);
    const magB = magnitude(b);
    if (magA === 0 || magB === 0) return 0;
    return dotProduct(a, b) / (magA * magB);
};

export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private chatSession: Chat | null = null;
  private currentConfig: AppConfig | null = null;
  private apiKeys: string[] = [];
  private currentKeyIndex = 0;
  private currentChatConfig: any = {};

  constructor() {
    // Initialized without keys, will receive them in startChat
  }

  // Helper to get a client on demand (for embedding tasks outside active chat)
  private getClient(overrideKey?: string): GoogleGenAI | null {
      const key = overrideKey || (this.apiKeys.length > 0 ? this.apiKeys[0] : null);
      if (key) return new GoogleGenAI({ apiKey: key });
      if (this.ai) return this.ai;
      return null;
  }

  public async embedText(text: string, apiKey?: string): Promise<number[] | null> {
      const client = this.getClient(apiKey);
      if (!client) return null;
      try {
          const response = await client.models.embedContent({
              model: EMBEDDING_MODEL_ID,
              content: text
          });
          return response.embedding?.values || null;
      } catch (e) {
          console.warn("Embedding error (possibly rate limited):", e);
          return null;
      }
  }

  // Main function to process a file: Chunk -> Embed -> Return KnowledgeFile structure
  public async vectorizeFile(fileObj: {name: string, content: string, type: string, size: number}, apiKey: string): Promise<KnowledgeFile> {
      const chunks = chunkText(fileObj.content, CHUNK_SIZE_CHARS);
      const vectorChunks: VectorChunk[] = [];

      // Process sequentially to avoid hitting rate limits too hard
      for (const chunk of chunks) {
          // If chunk is too short, skip
          if (chunk.trim().length < 50) continue;

          const vector = await this.embedText(chunk, apiKey);
          if (vector) {
              vectorChunks.push({ text: chunk, vector });
          }
          // Small delay to be gentle on the API
          await new Promise(r => setTimeout(r, 200));
      }

      return {
          id: Date.now() + Math.random().toString(),
          name: fileObj.name,
          content: fileObj.content,
          chunks: vectorChunks,
          type: fileObj.type,
          size: fileObj.size
      };
  }

  private async getRelevantContext(query: string, files: KnowledgeFile[]): Promise<string> {
      // Filter files that have vectors
      const vectorizedFiles = files.filter(f => f.chunks && f.chunks.length > 0);
      
      // If no vectorized files, return empty (or fallback to old logic if you wanted hybrid)
      if (vectorizedFiles.length === 0) return "";

      // Embed the query
      const queryVector = await this.embedText(query);
      if (!queryVector) return ""; // Cannot search without query vector

      const allChunks: { content: string; score: number; source: string }[] = [];

      for (const file of vectorizedFiles) {
          if (!file.chunks) continue;
          for (const chunk of file.chunks) {
              const score = cosineSimilarity(queryVector, chunk.vector);
              allChunks.push({
                  content: chunk.text,
                  score,
                  source: file.name
              });
          }
      }

      // Sort by relevance
      allChunks.sort((a, b) => b.score - a.score);

      // Select top K chunks
      const selectedChunks = [];
      let currentChars = 0;
      // Increased context limit because we have large models
      const MAX_RAG_CHARS = 150000; 

      for (const chunk of allChunks) {
          // Threshold for relevance (0.5 is usually decent for embeddings)
          if (chunk.score > 0.4) {
             if (currentChars + chunk.content.length < MAX_RAG_CHARS) {
                 selectedChunks.push(chunk);
                 currentChars += chunk.content.length;
             }
          }
          // Hard limit on chunk count
          if (selectedChunks.length >= 20) break;
      }

      if (selectedChunks.length === 0) return "";

      return selectedChunks.map(c => `
<story_bible_fragment source="${c.source}" relevance="${c.score.toFixed(2)}">
${c.content}
</story_bible_fragment>`).join('\n');
  }

  private formatMemories(memories: MemoryItem[]): string {
      if (!memories || memories.length === 0) return "";
      return memories.map(m => `- ${m.content}`).join('\n');
  }

  public async extractMemories(conversationHistory: string): Promise<string[]> {
      try {
          if (this.apiKeys.length === 0) return [];
          const flashAI = new GoogleGenAI({ apiKey: this.apiKeys[this.currentKeyIndex] });
          const response = await flashAI.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: `${MEMORY_EXTRACTION_PROMPT}\n\nCONVERSATION:\n${conversationHistory}`
          });
          
          const text = response.text;
          if (!text || text.includes("NO_UPDATE")) return [];
          
          return text.split('\n')
              .map(line => line.replace(/^[•\-\*]\s*/, '').trim())
              .filter(line => line.length > 5);
      } catch (e) {
          console.error("Memory extraction failed:", e);
          return [];
      }
  }

  public startChat(appConfig: AppConfig) {
    this.currentConfig = appConfig;
    
    // Fallback to env variable if no keys in config
    const envKey = process.env.API_KEY || '';
    if (appConfig.apiKeys && appConfig.apiKeys.length > 0) {
        this.apiKeys = appConfig.apiKeys;
    } else if (envKey) {
        this.apiKeys = [envKey];
    } else {
        this.apiKeys = [];
    }
    
    this.currentKeyIndex = 0;
    this.initializeSession();
  }

  private initializeSession(history: Content[] = []) {
    if (this.apiKeys.length === 0) {
        console.warn("No API keys available.");
        return;
    }

    const appConfig = this.currentConfig;
    if (!appConfig) return;

    this.ai = new GoogleGenAI({ apiKey: this.apiKeys[this.currentKeyIndex] });

    let actualModel = appConfig.model;
    let thinkingBudget = appConfig.generationConfig.thinkingBudget || 0;

    if (appConfig.model === 'gemini-2.5-flash-thinking') {
       actualModel = 'gemini-2.5-flash';
       if (thinkingBudget === 0) thinkingBudget = 1024;
    }

    const config: any = {
      systemInstruction: appConfig.systemInstruction,
      temperature: appConfig.generationConfig.temperature,
      topP: appConfig.generationConfig.topP,
      topK: appConfig.generationConfig.topK,
      maxOutputTokens: appConfig.generationConfig.maxOutputTokens,
      stopSequences: appConfig.generationConfig.stopSequences,
    };

    if (thinkingBudget > 0) config.thinkingConfig = { thinkingBudget };

    const tools = [];
    if (appConfig.enableGoogleSearch) tools.push({ googleSearch: {} });
    if (tools.length > 0) config.tools = tools;

    if (appConfig.safetyThreshold) {
      const categories = [
        'HARM_CATEGORY_HATE_SPEECH',
        'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        'HARM_CATEGORY_HARASSMENT',
        'HARM_CATEGORY_DANGEROUS_CONTENT'
      ];
      config.safetySettings = categories.map(category => ({
        category,
        threshold: appConfig.safetyThreshold
      }));
    }

    this.currentChatConfig = {
      model: actualModel,
      config: config,
      history: history
    };

    this.chatSession = this.ai.chats.create(this.currentChatConfig);
  }

  private rotateKey() {
      if (this.currentKeyIndex < this.apiKeys.length - 1) {
          this.currentKeyIndex++;
          console.log(`Rotating to API Key #${this.currentKeyIndex + 1}`);
          return true;
      }
      return false;
  }

  public async *sendMessageStream(text: string, files: File[]) {
    if (!this.currentConfig) throw new Error("Chat session not initialized");

    // Prepare Prompt
    let finalPrompt = text;
    let contextParts = [];

    // Token Tracking for Input
    let inputTokens = estimateTokens(text);

    // 1. Memory Injection
    if (this.currentConfig.memories.length > 0) {
        const memoryText = this.formatMemories(this.currentConfig.memories);
        contextParts.push(`
LONG-TERM MEMORY:
<memory_bank>
${memoryText}
</memory_bank>
`);
        inputTokens += estimateTokens(memoryText);
    }

    // 2. Knowledge Base RAG (Semantic Search)
    if (this.currentConfig.knowledgeFiles.length > 0) {
        // Now Async call
        const relevantContext = await this.getRelevantContext(text, this.currentConfig.knowledgeFiles);
        if (relevantContext) {
             contextParts.push(`
STORY BIBLE CONTEXT (RELEVANT EXCERPTS):
<active_story_context>
${relevantContext}
</active_story_context>
`);
             inputTokens += estimateTokens(relevantContext);
        }
    }

    // 3. Length Constraint Injection
    if (this.currentConfig.targetWordCount && this.currentConfig.targetWordCount > 500) {
        const target = this.currentConfig.targetWordCount;
        const constraintPrompt = `
[SYSTEM MANDATE: LENGTH CONSTRAINT]
You MUST generate a response of approximately ${target} words.
- Do NOT summarize.
- Expand every scene description, internal thought, and dialogue.
- Use multiple paragraphs for single actions to increase length and depth.
- If the user asks for a chapter, it MUST be a full chapter (${target} words), not a snippet.
`;
        contextParts.push(constraintPrompt);
        inputTokens += estimateTokens(constraintPrompt);
    }

    if (contextParts.length > 0) {
        finalPrompt = `${contextParts.join('\n')}\n\nUSER INPUT: ${text}`;
    }

    let messageInput: any = finalPrompt;

    if (files.length > 0) {
      const parts = [];
      for (const file of files) {
        const part = await fileToGenerativePart(file);
        parts.push(part);
        inputTokens += estimateImageTokens(); // Add heuristic for image
      }
      if (finalPrompt.trim()) parts.push({ text: finalPrompt });
      messageInput = parts;
    }

    // Attempt Loop for Key Rotation
    let attempt = 0;
    const maxAttempts = Math.max(1, this.apiKeys.length);

    while (attempt < maxAttempts) {
        try {
            if (!this.chatSession) {
                this.initializeSession([]);
                if (!this.chatSession) throw new Error("Failed to initialize chat session");
            }

            const result = await this.chatSession.sendMessageStream({ message: messageInput });
            let fullOutputText = "";

            for await (const chunk of result) {
                const c = chunk as GenerateContentResponse;
                const textChunk = c.text || "";
                fullOutputText += textChunk;

                if (textChunk || c.candidates?.[0]?.groundingMetadata) {
                    yield {
                        text: textChunk,
                        groundingMetadata: c.candidates?.[0]?.groundingMetadata,
                        // Yield usage stats if we want to update live, but normally we update at end.
                        // For simplicity, we just stream text.
                    };
                }
            }
            
            // Calculate final tokens
            const outputTokens = estimateTokens(fullOutputText);
            const totalTurnTokens = inputTokens + outputTokens;

            yield {
                usageMetadata: {
                    inputTokens,
                    outputTokens,
                    totalTokens: totalTurnTokens
                }
            };

            return; // Success

        } catch (error: any) {
            console.error(`Attempt ${attempt + 1} failed:`, error);
            
            const isQuotaError = error.message?.includes('429') || 
                                 error.status === 429 || 
                                 error.message?.includes('Quota') ||
                                 error.message?.includes('403');

            if (isQuotaError && this.rotateKey()) {
                let history: Content[] = [];
                try {
                    history = await this.chatSession?.getHistory() || [];
                } catch (hErr) {
                    console.warn("Could not retrieve history", hErr);
                }
                this.initializeSession(history);
                attempt++;
            } else {
                throw error;
            }
        }
    }
  }
}

export const createGeminiService = () => {
    return new GeminiService();
};
