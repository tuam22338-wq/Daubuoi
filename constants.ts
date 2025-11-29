
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
    name: 'Gemini 2.5 Pro',
    description: 'Cân bằng hiệu suất và chi phí',
    isThinking: true
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3.0 Pro',
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
  apiKeys: [], // Initialize empty
  model: AVAILABLE_MODELS[3].id, // Default to Gemini 3.0 Pro
  systemInstruction: NOVELIST_SYSTEM_INSTRUCTION,
  generationConfig: DEFAULT_GENERATION_CONFIG,
  safetyThreshold: SafetyThreshold.BLOCK_NONE, // Writers often need fewer restrictions
  enableGoogleSearch: false,
  knowledgeFiles: [],
  memories: [],
  writerMode: WriterMode.DRAFTING,
  targetWordCount: 3000,
  uiScale: 1.0, // Default 100% zoom
  fontSize: 15, // Default font size
  ttsVoice: 'Kore', // Default Gemini Voice
  ttsRate: 1.0 // Default speed
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
