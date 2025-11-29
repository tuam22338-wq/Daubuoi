
import { GoogleGenAI, Chat, GenerateContentResponse, Content, Modality } from "@google/genai";
import { AppConfig, KnowledgeFile, MemoryItem, VectorChunk, ChatMessage } from "../types";
import { MEMORY_EXTRACTION_PROMPT, EMBEDDING_MODEL_ID, TTS_MODEL_ID } from "../constants";

// Declare process to avoid TypeScript errors during build
declare const process: any;

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
  
  // Cache for TTS to prevent re-fetching and speed up playback
  private ttsCache = new Map<string, ArrayBuffer>();

  constructor() {
    // Initialized without keys, will receive them in startChat
  }

  // Helper to get a client on demand
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
              contents: text 
          });
          return response.embeddings?.[0]?.values || null;
      } catch (e) {
          console.warn("Embedding error (possibly rate limited):", e);
          return null;
      }
  }

  public async generateSpeech(text: string, voiceName: string): Promise<ArrayBuffer | null> {
    const cacheKey = `${voiceName}:${text}`;
    if (this.ttsCache.has(cacheKey)) {
        console.log("Serving TTS from cache");
        return this.ttsCache.get(cacheKey)!;
    }

    const client = this.getClient();
    if (!client) throw new Error("API Key required for TTS");

    try {
        const response = await client.models.generateContent({
            model: TTS_MODEL_ID,
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName }
                    }
                }
            }
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) return null;

        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Cache the result
        this.ttsCache.set(cacheKey, bytes.buffer);

        return bytes.buffer;

    } catch (e) {
        console.error("Gemini TTS Error:", e);
        return null;
    }
  }

  public async vectorizeFile(fileObj: {name: string, content: string, type: string, size: number}, apiKey: string): Promise<KnowledgeFile> {
      const chunks = chunkText(fileObj.content, CHUNK_SIZE_CHARS);
      const vectorChunks: VectorChunk[] = [];

      for (const chunk of chunks) {
          if (chunk.trim().length < 50) continue;
          const vector = await this.embedText(chunk, apiKey);
          if (vector) {
              vectorChunks.push({ text: chunk, vector });
          }
          await new Promise(r => setTimeout(r, 200));
      }

      return {
          id: Date.now() + Math.random().toString(),
          name: fileObj.name,
          content: fileObj.content,
          chunks: vectorChunks,
          type: fileObj.type,
          size: fileObj.size,
          isActive: true // Default to active
      };
  }

  private async getRelevantContext(query: string, files: KnowledgeFile[]): Promise<string> {
      // Filter out inactive files
      const activeFiles = files.filter(f => f.isActive !== false);
      const vectorizedFiles = activeFiles.filter(f => f.chunks && f.chunks.length > 0);
      
      if (vectorizedFiles.length === 0) return "";

      const queryVector = await this.embedText(query);
      if (!queryVector) return ""; 

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

      allChunks.sort((a, b) => b.score - a.score);

      const selectedChunks = [];
      let currentChars = 0;
      const MAX_RAG_CHARS = 150000; 

      for (const chunk of allChunks) {
          if (chunk.score > 0.4) {
             if (currentChars + chunk.content.length < MAX_RAG_CHARS) {
                 selectedChunks.push(chunk);
                 currentChars += chunk.content.length;
             }
          }
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
    
    const envKey = process.env.API_KEY || '';
    if (appConfig.apiKeys && appConfig.apiKeys.length > 0) {
        this.apiKeys = appConfig.apiKeys;
    } else if (envKey) {
        this.apiKeys = [envKey];
    } else {
        this.apiKeys = [];
    }
    
    this.currentKeyIndex = 0;
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
    if (appConfig.enableGoogleSearch) {
        tools.push({ googleSearch: {} });
    }
    
    if (tools.length > 0) config.tools = tools;

    const threshold = appConfig.safetyThreshold || 'BLOCK_NONE';
    const categories = [
      'HARM_CATEGORY_HATE_SPEECH',
      'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      'HARM_CATEGORY_HARASSMENT',
      'HARM_CATEGORY_DANGEROUS_CONTENT'
    ];
    config.safetySettings = categories.map(category => ({
      category,
      threshold: threshold
    }));

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

  public async *sendMessageStream(text: string, files: File[], previousHistory: ChatMessage[]) {
    if (!this.currentConfig) throw new Error("Chat session not initialized. Please ensure API Key is set.");

    if (this.apiKeys.length === 0) {
        throw new Error("No API Key provided. Please add one in Settings.");
    }

    // --- REBUILD HISTORY (OPTIMIZED) ---
    // Only send the last 20 messages to keep request payload light and TTFT fast.
    // The older context is handled by "Memory" and "RAG" which are injected below.
    const recentHistory = previousHistory
        .filter(m => !m.isError && m.text)
        .slice(-20); // optimization: Limit history

    const sdkHistory: Content[] = recentHistory
        .map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }] 
        }));
    
    // -------------------------------

    let finalPrompt = text;
    let contextParts = [];
    let inputTokens = estimateTokens(text);

    // Inject Long Term Memory
    if (this.currentConfig.memories.length > 0) {
        const memoryText = this.formatMemories(this.currentConfig.memories);
        contextParts.push(`\nLONG-TERM MEMORY:\n<memory_bank>\n${memoryText}\n</memory_bank>`);
        inputTokens += estimateTokens(memoryText);
    }

    // Inject Knowledge Base (RAG)
    if (this.currentConfig.knowledgeFiles.length > 0) {
        const relevantContext = await this.getRelevantContext(text, this.currentConfig.knowledgeFiles);
        if (relevantContext) {
             contextParts.push(`\nSTORY BIBLE CONTEXT:\n<active_story_context>\n${relevantContext}\n</active_story_context>`);
             inputTokens += estimateTokens(relevantContext);
        }
    }

    // Inject Length Constraints
    if (this.currentConfig.targetWordCount && this.currentConfig.targetWordCount > 500) {
        const target = this.currentConfig.targetWordCount;
        const constraintPrompt = `\n[SYSTEM MANDATE]\nGenerate approx ${target} words. Expand every detail.`;
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
        inputTokens += estimateImageTokens();
      }
      if (finalPrompt.trim()) parts.push({ text: finalPrompt });
      messageInput = parts;
    }

    let attempt = 0;
    const maxAttempts = Math.max(1, this.apiKeys.length);

    while (attempt < maxAttempts) {
        try {
            // Re-initialize session with recent history for every request
            this.initializeSession(sdkHistory);
            
            if (!this.chatSession) throw new Error("Could not initialize chat session");

            const result = await this.chatSession.sendMessageStream({ message: messageInput });
            let fullOutputText = "";

            for await (const chunk of result) {
                const c = chunk as GenerateContentResponse;
                const textChunk = c.text || "";
                fullOutputText += textChunk;
                
                const groundingMetadata = c.candidates?.[0]?.groundingMetadata;

                if (textChunk || groundingMetadata) {
                    yield {
                        text: textChunk,
                        groundingMetadata: groundingMetadata,
                        // If thoughts are available in parts (for some thinking models), they would be handled here
                        // For now we rely on standard text output or metadata
                    };
                }
            }
            
            const outputTokens = estimateTokens(fullOutputText);
            const totalTurnTokens = inputTokens + outputTokens;

            yield {
                usageMetadata: {
                    inputTokens,
                    outputTokens,
                    totalTokens: totalTurnTokens
                }
            };
            return; 

        } catch (error: any) {
            console.error(`Attempt ${attempt + 1} failed:`, error);
            
            const isQuotaError = error.message?.includes('429') || 
                                 error.status === 429 || 
                                 error.message?.includes('Quota') ||
                                 error.message?.includes('403');
            
            const isSafetyError = error.message?.includes('SAFETY') || 
                                  error.message?.includes('blocked');

            if (isSafetyError) {
                throw new Error("Content blocked by Safety Settings. Try lowering sensitivity in Settings.");
            }

            if (isQuotaError && this.rotateKey()) {
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
