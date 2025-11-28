export enum Role {
  USER = 'user',
  MODEL = 'model'
}

export interface Attachment {
  file: File;
  previewUrl: string;
  mimeType: string;
  name: string;
  base64Data?: string;
}

export interface KnowledgeFile {
  id: string;
  name: string;
  content: string; // Text content extracted from file
  type: string;
  size: number;
}

export interface MemoryItem {
  id: string;
  content: string; // The fact or event (e.g., "John lost his sword in Chapter 3")
  timestamp: number;
  type: 'auto' | 'manual';
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  attachments?: Attachment[];
  timestamp: number;
  isError?: boolean;
  groundingMetadata?: {
    groundingChunks: GroundingChunk[];
  };
}

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    updatedAt: number;
}

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  isThinking?: boolean;
}

export enum SafetyThreshold {
  BLOCK_NONE = 'BLOCK_NONE',
  BLOCK_ONLY_HIGH = 'BLOCK_ONLY_HIGH',
  BLOCK_MEDIUM_AND_ABOVE = 'BLOCK_MEDIUM_AND_ABOVE',
  BLOCK_LOW_AND_ABOVE = 'BLOCK_LOW_AND_ABOVE',
}

export interface GenerationConfig {
  temperature: number;
  topP: number;
  topK: number;
  maxOutputTokens: number;
  stopSequences: string[];
  thinkingBudget?: number;
  responseMimeType?: string;
}

export enum WriterMode {
  BRAINSTORM = 'brainstorm',
  DRAFTING = 'drafting',
  POLISHING = 'polishing',
  CUSTOM = 'custom'
}

export interface AppConfig {
  model: string;
  systemInstruction: string;
  generationConfig: GenerationConfig;
  safetyThreshold: SafetyThreshold;
  enableGoogleSearch: boolean;
  knowledgeFiles: KnowledgeFile[];
  memories: MemoryItem[]; // Active Long-term memory
  writerMode: WriterMode;
  targetWordCount: number; // New: Force specific length
}