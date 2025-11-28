import { ModelConfig, SafetyThreshold, AppConfig, WriterMode } from './types';

export const MAX_FILE_SIZE_MB = 100;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Fast, cost-efficient, 1M context',
    isThinking: true
  },
  {
    id: 'gemini-2.5-flash-thinking', 
    name: 'Gemini 2.5 Flash (Thinking)',
    description: 'Enhanced reasoning for plot logic',
    isThinking: true
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3.0 Pro',
    description: 'Best for creative writing, 2M context',
    isThinking: true
  }
];

// System Instruction optimized for EXTREME LENGTH and DETAIL
export const NOVELIST_SYSTEM_INSTRUCTION = `You are an expert novelist and co-author designed to write EXTENSIVE, HIGH-QUALITY fiction.

CORE DIRECTIVE: WRITE LENGTHY, DETAILED RESPONSES.
- When asked to write a scene or chapter, your goal is to maximize detail.
- Target Length: Aim to be as verbose as possible while maintaining quality.
- "Show, Don't Tell" is mandatory. Do not say "He was angry." Describe the tightening of his jaw, the flush of his skin, the tremor in his hands.
- Expand on sensory details: Smell, Sound, Texture, Light.
- Dive deep into internal monologue (Deep POV).
- Pace the story slowly to allow for character development.

STORY BIBLE & MEMORY:
- Strictly adhere to the provided <story_bible_fragment> and <memory_bank>.
- Maintain absolute consistency with established facts.`;

export const MEMORY_EXTRACTION_PROMPT = `Analyze the recent conversation provided below.
Extract key facts, significant plot events, character developments, or world-building details.
Output ONLY the facts as a bulleted list.
If there are no new important facts, return "NO_UPDATE".`;

export const DEFAULT_GENERATION_CONFIG = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192, // Max for most models to allow 3000+ words
  stopSequences: [],
  thinkingBudget: 0,
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  model: AVAILABLE_MODELS[2].id, 
  systemInstruction: NOVELIST_SYSTEM_INSTRUCTION,
  generationConfig: DEFAULT_GENERATION_CONFIG,
  safetyThreshold: SafetyThreshold.BLOCK_NONE, // Writers often need fewer restrictions
  enableGoogleSearch: false,
  knowledgeFiles: [],
  memories: [],
  writerMode: WriterMode.DRAFTING,
  targetWordCount: 3000 // Default target
};

export const SAFETY_SETTINGS_OPTIONS = [
  { value: SafetyThreshold.BLOCK_NONE, label: 'Block None' },
  { value: SafetyThreshold.BLOCK_ONLY_HIGH, label: 'Block Few' },
  { value: SafetyThreshold.BLOCK_MEDIUM_AND_ABOVE, label: 'Block Some' },
  { value: SafetyThreshold.BLOCK_LOW_AND_ABOVE, label: 'Block Most' },
];

export const WRITER_PRESETS = {
  [WriterMode.BRAINSTORM]: {
    label: "Brainstorm",
    temp: 1.6,
    topP: 0.99,
    topK: 64,
    desc: "High creativity"
  },
  [WriterMode.DRAFTING]: {
    label: "Drafting",
    temp: 1.0,
    topP: 0.95,
    topK: 40,
    desc: "Balanced flow"
  },
  [WriterMode.POLISHING]: {
    label: "Polishing",
    temp: 0.3,
    topP: 0.8,
    topK: 20,
    desc: "Precision editing"
  }
};