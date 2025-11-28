import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { AppConfig, KnowledgeFile, MemoryItem } from "../types";
import { MEMORY_EXTRACTION_PROMPT } from "../constants";

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

interface ScoredChunk {
    content: string;
    score: number;
    source: string;
}

const CHUNK_SIZE = 4000;
const MAX_CONTEXT_TOKENS = 100000;
const CHARS_PER_TOKEN_EST = 4;

const chunkText = (text: string, size: number): string[] => {
    const chunks = [];
    for (let i = 0; i < text.length; i += size) {
        chunks.push(text.slice(i, i + size));
    }
    return chunks;
};

const calculateRelevance = (query: string, chunk: string): number => {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (queryTerms.length === 0) return 0;
    const chunkLower = chunk.toLowerCase();
    let score = 0;
    queryTerms.forEach(term => {
        const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        const count = (chunkLower.match(regex) || []).length;
        if (count > 0) {
            score += count * 10;
            score += (count / chunk.length) * 1000;
        }
    });
    return score;
};

export class GeminiService {
  private ai: GoogleGenAI;
  private chatSession: Chat | null = null;
  private currentConfig: AppConfig | null = null;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.ai = new GoogleGenAI({ apiKey });
  }

  private getRelevantContext(query: string, files: KnowledgeFile[]): string {
      if (!files || files.length === 0) return "";
      const allChunks: ScoredChunk[] = [];

      files.forEach(file => {
          const chunks = chunkText(file.content, CHUNK_SIZE);
          chunks.forEach(chunk => {
              const score = calculateRelevance(query, chunk);
              allChunks.push({
                  content: chunk,
                  score: score,
                  source: file.name
              });
          });
      });

      allChunks.sort((a, b) => b.score - a.score);

      let currentChars = 0;
      const selectedChunks = [];
      const maxChars = MAX_CONTEXT_TOKENS * CHARS_PER_TOKEN_EST;
      
      for (const chunk of allChunks) {
          if (chunk.score > 0 || selectedChunks.length < 5) { 
             if (currentChars + chunk.content.length < maxChars) {
                 selectedChunks.push(chunk);
                 currentChars += chunk.content.length;
             }
          }
      }

      if (selectedChunks.length === 0 && files.length > 0) return "";

      return selectedChunks.map(c => `
<story_bible_fragment source="${c.source}">
${c.content}
</story_bible_fragment>`).join('\n');
  }

  private formatMemories(memories: MemoryItem[]): string {
      if (!memories || memories.length === 0) return "";
      return memories.map(m => `- ${m.content}`).join('\n');
  }

  public async extractMemories(conversationHistory: string): Promise<string[]> {
      try {
          const flashAI = new GoogleGenAI({ apiKey: this.apiKey });
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

    this.chatSession = this.ai.chats.create({
      model: actualModel,
      config: config
    });
  }

  public async *sendMessageStream(text: string, files: File[]) {
    if (!this.chatSession || !this.currentConfig) throw new Error("Chat session not initialized");

    let finalPrompt = text;
    let contextParts = [];

    // 1. Memory Injection
    if (this.currentConfig.memories.length > 0) {
        const memoryText = this.formatMemories(this.currentConfig.memories);
        contextParts.push(`
LONG-TERM MEMORY:
<memory_bank>
${memoryText}
</memory_bank>
`);
    }

    // 2. Knowledge Base RAG
    if (this.currentConfig.knowledgeFiles.length > 0) {
        const relevantContext = this.getRelevantContext(text, this.currentConfig.knowledgeFiles);
        if (relevantContext) {
             contextParts.push(`
STORY BIBLE CONTEXT:
<active_story_context>
${relevantContext}
</active_story_context>
`);
        }
    }

    // 3. Length Constraint Injection
    if (this.currentConfig.targetWordCount && this.currentConfig.targetWordCount > 500) {
        const target = this.currentConfig.targetWordCount;
        contextParts.push(`
[SYSTEM MANDATE: LENGTH CONSTRAINT]
You MUST generate a response of approximately ${target} words.
- Do NOT summarize.
- Expand every scene description, internal thought, and dialogue.
- Use multiple paragraphs for single actions to increase length and depth.
- If the user asks for a chapter, it MUST be a full chapter (${target} words), not a snippet.
`);
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
      }
      if (finalPrompt.trim()) parts.push({ text: finalPrompt });
      messageInput = parts;
    }

    try {
      const result = await this.chatSession.sendMessageStream({ message: messageInput });
      for await (const chunk of result) {
        const c = chunk as GenerateContentResponse;
        if (c.text || c.candidates?.[0]?.groundingMetadata) {
          yield {
            text: c.text,
            groundingMetadata: c.candidates?.[0]?.groundingMetadata
          };
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      throw error;
    }
  }
}

export const createGeminiService = () => {
    const apiKey = process.env.API_KEY || ''; 
    return new GeminiService(apiKey);
};