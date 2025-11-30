
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

export interface VectorChunk {
  text: string;
  vector: number[];
}

export interface KnowledgeFile {
  id: string;
  name: string;
  content: string; // Keep raw text for reference
  chunks?: VectorChunk[]; // Vectorized chunks for RAG
  type: string;
  size: number;
  isActive?: boolean; // Toggle state for RAG usage
}

export interface MemoryItem {
  id: string;
  content: string; // The fact or event (e.g., "John lost his sword in Chapter 3")
  timestamp: number;
  type: 'auto' | 'manual';
}

export interface CharacterProfile {
  id: string;
  name: string;
  description: string; // Appearance, traits
  currentStatus: string; // Current location, emotion, or relationship status
  updatedAt: number;
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
  thought?: string; // For Thinking models
  attachments?: Attachment[];
  timestamp: number;
  isError?: boolean;
  groundingMetadata?: {
    groundingChunks: GroundingChunk[];
    searchEntryPoint?: any;
  };
  tokenCount?: number; // Estimated tokens for this message
}

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    updatedAt: number;
    totalTokens?: number; // Aggregate count
    storySummary?: string; // The "Story So Far" context
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

export interface PlotBranch {
    label: string; // e.g., "Twist", "Action"
    description: string; // "A sudden explosion happens..."
    prompt: string; // The actual prompt to send
}

export interface AppConfig {
  apiKeys: string[]; // List of API keys for rotation
  model: string;
  systemInstruction: string;
  generationConfig: GenerationConfig;
  safetyThreshold: SafetyThreshold;
  enableGoogleSearch: boolean;
  knowledgeFiles: KnowledgeFile[];
  memories: MemoryItem[]; // Active Long-term memory
  characterProfiles: CharacterProfile[]; // Active Character tracking
  writerMode: WriterMode;
  targetWordCount: number; // Force specific length
  uiScale: number; // UI Zoom level (0.8 - 1.5)
  fontSize: number; // Font size in px (12-20)
  ttsVoice: string; // Voice URI or Name
  ttsRate: number; // Speaking rate 0.5 - 2.0
  writingStyle: string; // Analyzed style DNA
  
  // Thinking Features
  enableThinking: boolean;
  enableLogicAnalysis: boolean; // Simulated thinking prompt

  // TTS Provider
  ttsProvider: 'gemini' | 'browser';

  // Quality Control
  enableAutoRefine: boolean; // Critic Loop
  bannedWords: string; // Negative constraints
  enableSensoryRoulette: boolean; // Random sensory injection
}
