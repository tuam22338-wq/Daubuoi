
import { ModelConfig, SafetyThreshold, AppConfig, WriterMode } from './types';

export const MAX_FILE_SIZE_MB = 100;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const EMBEDDING_MODEL_ID = 'text-embedding-004';
export const TTS_MODEL_ID = 'gemini-2.5-flash-preview-tts';

export const GEMINI_VOICES = [
  { name: 'Kore (Nữ - Trầm ấm)', value: 'Kore' },
  { name: 'Puck (Nam - Tự nhiên)', value: 'Puck' },
  { name: 'Charon (Nam - Trầm)', value: 'Charon' },
  { name: 'Fenrir (Nam - Mạnh mẽ)', value: 'Fenrir' },
  { name: 'Zephyr (Nữ - Nhẹ nhàng)', value: 'Zephyr' },
];

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Nhanh, tiết kiệm, cửa sổ ngữ cảnh 1M',
    isThinking: false
  },
  {
    id: 'gemini-2.5-flash-thinking', 
    name: 'Gemini 2.5 Flash (Thinking)',
    description: 'Tăng cường khả năng suy luận cốt truyện',
    isThinking: true
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro (Yêu cầu trả phí)',
    description: 'Cân bằng hiệu suất và chi phí',
    isThinking: true
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3.0 Pro (Yêu cầu trả phí)',
    description: 'Tốt nhất cho sáng tạo, ngữ cảnh 2M',
    isThinking: true
  }
];

// System Instruction optimized (Vietnamese Localized & Flexible)
export const NOVELIST_SYSTEM_INSTRUCTION = `Bạn là một trợ lý AI thông minh, linh hoạt và là một đồng tác giả tài năng.

NGUYÊN TẮC CỐT LÕI:
1. **Phản hồi linh hoạt**:
   - Nếu người dùng hỏi thông tin, tra cứu, hoặc trò chuyện bình thường: Hãy trả lời **ngắn gọn, súc tích, đi thẳng vào vấn đề**. Không văn vẻ dài dòng.
   - Nếu người dùng yêu cầu **viết truyện, sáng tác, mô tả cảnh, hoặc nhập vai**: Kích hoạt chế độ **TIỂU THUYẾT GIA**.

2. **CHẾ ĐỘ TIỂU THUYẾT GIA (Khi được yêu cầu sáng tác)**:
   - **Độ dài & Chi tiết**: Viết càng chi tiết càng tốt. Mở rộng các ý tưởng thành những phân cảnh đầy đủ.
   - **Show, Don't Tell (Tả, đừng kể)**: Đừng nói "Anh ấy giận dữ". Hãy tả "Cơ hàm anh bạnh ra, gân cổ nổi lên, nắm tay siết chặt đến trắng bệch".
   - **Giác quan**: Khai thác triệt để 5 giác quan (Mùi vị, Âm thanh, Ánh sáng, Xúc giác).
   - **Deep POV**: Đi sâu vào nội tâm nhân vật.
   - **Nhất quán**: Tuân thủ tuyệt đối các thông tin trong <story_bible_fragment> và <memory_bank> nếu có.

Hãy luôn giữ thái độ hỗ trợ, tôn trọng và sáng tạo.`;

export const LOGIC_ANALYSIS_PROMPT = `
[INSTRUCTION]: Before generating your response, you MUST perform a deep logic analysis. 
Identify potential plot holes, character inconsistencies, or structural weaknesses in the request.
Plan your response structure.
Output this analysis inside <thought>...</thought> XML tags. 
The analysis should be concise and analytical.
After the </thought> tag, provide your final response as normal.
`;

export const CRITIC_PROMPT = `
[CRITIC AGENT ACTIVATED]
Review the draft above. Identify:
1. Clichés or overused phrases.
2. Instances of "Telling" instead of "Showing".
3. Weak verbs or passive voice.
4. Inconsistencies with character traits.

[REFINEMENT INSTRUCTION]
Rewrite the draft completely to address these issues. 
- Elevate the prose quality. 
- Ensure deep emotional resonance. 
- REMOVE any banned words if found.
Output ONLY the final polished story.
`;

export const BRANCHING_PROMPT = `Based on the current story context, brainstorm 3 distinct plot directions for what could happen next.
1. **Action/Conflict**: A direction focused on tension, fight, or argument.
2. **Character/Emotion**: A direction focused on internal reflection or relationship building.
3. **Twist/Unexpected**: A direction that introduces a surprise element.

Format the output strictly as JSON in the following format (do not use Markdown code blocks, just raw JSON):
[
  { "label": "Hành động", "description": "Short description of the event...", "prompt": "Viết tiếp cảnh: [Description]" },
  { "label": "Cảm xúc", "description": "Short description...", "prompt": "Viết tiếp cảnh: [Description]" },
  { "label": "Bất ngờ", "description": "Short description...", "prompt": "Viết tiếp cảnh: [Description]" }
]`;

export const DEFAULT_BANNED_WORDS = `shivered down his spine, released a breath he didn't know he was holding, emerald orbs, cerulean eyes, piercing gaze, smirked, chuckled darkly, testament to, a mixture of`;

export const SENSORY_PROMPTS = [
    "Focus intensely on OLFACTORY (Smell) details in this scene.",
    "Focus intensely on TACTILE (Touch/Texture) details in this scene.",
    "Focus intensely on AUDITORY (Sound) details in this scene.",
    "Focus intensely on GUSTATORY (Taste) details in this scene.",
    "Focus intensely on VISUAL (Light/Shadow/Color) details in this scene.",
    "Focus intensely on INTERNAL BODILY SENSATIONS (Heartbeat, adrenaline, pain) in this scene."
];

export const STYLE_ANALYSIS_PROMPT = `Analyze the following writing sample. Extract the "Writing DNA" into a concise style guide.
Focus on:
1. Sentence Structure (Length, complexity, rhythm).
2. Tone & Atmosphere (Dark, humorous, clinical, lyrical?).
3. Vocabulary Choice (Simple, archaic, technical, flowery?).
4. POV & Narrative Distance (Deep POV, Omniscient, Detached?).
5. Dialogue Style.

Output ONLY the style analysis as a set of rules. Do not output anything else.`;

export const MEMORY_EXTRACTION_PROMPT = `Analyze the recent conversation provided below.
Extract key facts, significant plot events, character developments, or world-building details.
Output ONLY the facts as a bulleted list.
If there are no new important facts, return "NO_UPDATE".`;

export const CHARACTER_EXTRACTION_PROMPT = `Analyze the conversation text below to identify characters and their current states.
For each major character mentioned, extract:
1. Name
2. Brief description/traits (visuals, personality)
3. Current Status (Location, emotional state, or key relationship update)

Format the output strictly as follows for each character (one per line):
Name | Description | Current Status

Example:
John Doe | Tall, scar on left eye, grumpy | Angry at Jane, currently in the tavern
Jane Smith | Healer, wears white | Trying to heal John, exhausted

If no character updates are found, return "NO_UPDATE".`;

export const DEFAULT_GENERATION_CONFIG = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192, // Max for most models to allow 3000+ words
  stopSequences: [],
  thinkingBudget: 1024, // Default budget for thinking models
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  apiKeys: [], // Initialize empty
  model: AVAILABLE_MODELS[0].id, // Default to Gemini 2.5 Flash
  systemInstruction: NOVELIST_SYSTEM_INSTRUCTION,
  generationConfig: DEFAULT_GENERATION_CONFIG,
  safetyThreshold: SafetyThreshold.BLOCK_NONE, // Writers often need fewer restrictions
  enableGoogleSearch: false,
  knowledgeFiles: [],
  memories: [],
  characterProfiles: [], // Initialize empty
  writerMode: WriterMode.DRAFTING,
  targetWordCount: 3000,
  uiScale: 1.0, // Default 100% zoom
  fontSize: 15, // Default font size
  ttsVoice: 'Kore', // Default Gemini Voice
  ttsRate: 1.0, // Default speed
  writingStyle: "", // Default empty style
  enableThinking: true, // Enable thinking by default for supported models
  enableLogicAnalysis: false,
  ttsProvider: 'gemini',
  enableAutoRefine: false, // Default off
  bannedWords: DEFAULT_BANNED_WORDS,
  enableSensoryRoulette: false
};

export const SAFETY_SETTINGS_OPTIONS = [
  { value: SafetyThreshold.BLOCK_NONE, label: 'Không chặn (Block None)' },
  { value: SafetyThreshold.BLOCK_ONLY_HIGH, label: 'Chặn ít (Block Few)' },
  { value: SafetyThreshold.BLOCK_MEDIUM_AND_ABOVE, label: 'Chặn vừa (Block Some)' },
  { value: SafetyThreshold.BLOCK_LOW_AND_ABOVE, label: 'Chặn hầu hết (Block Most)' },
];

export const WRITER_PRESETS = {
  [WriterMode.BRAINSTORM]: {
    label: "Brainstorm (Lên ý tưởng)",
    temp: 1.6,
    topP: 0.99,
    topK: 64,
    desc: "Sáng tạo cao"
  },
  [WriterMode.DRAFTING]: {
    label: "Drafting (Viết nháp)",
    temp: 1.0,
    topP: 0.95,
    topK: 40,
    desc: "Cân bằng mạch văn"
  },
  [WriterMode.POLISHING]: {
    label: "Polishing (Biên tập)",
    temp: 0.3,
    topP: 0.8,
    topK: 20,
    desc: "Chỉnh sửa chính xác"
  }
};
export const APP_CONFIG_STORAGE_KEY = 'ai_studio_clone_config_v2';
