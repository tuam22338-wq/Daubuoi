
import React, { useState, useRef, useEffect } from 'react';
import { AVAILABLE_MODELS, SAFETY_SETTINGS_OPTIONS, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, WRITER_PRESETS, NOVELIST_SYSTEM_INSTRUCTION, GEMINI_VOICES } from '../constants';
import { AppConfig, KnowledgeFile, WriterMode, MemoryItem } from '../types';
import { GeminiService } from '../services/geminiService';

interface SettingsPanelProps {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  isCollapsed: boolean;
  geminiService: GeminiService;
  onClose?: () => void;
}

// Declare process to avoid TypeScript errors during build
declare const process: any;

declare global {
    interface Window {
        pdfjsLib: any;
    }
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  config,
  setConfig,
  isCollapsed,
  geminiService,
  onClose
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [systemInstOpen, setSystemInstOpen] = useState(true);
  const [knowledgeOpen, setKnowledgeOpen] = useState(true);
  const [apiKeysOpen, setApiKeysOpen] = useState(false);
  const [interfaceOpen, setInterfaceOpen] = useState(true);
  const [ttsOpen, setTtsOpen] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [newStopSequence, setNewStopSequence] = useState('');
  const knowledgeInputRef = useRef<HTMLInputElement>(null);
  
  // No longer fetching browser voices, we use GEMINI_VOICES

  if (isCollapsed) return null;

  const handleChange = (field: keyof AppConfig, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleGenConfigChange = (field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      generationConfig: {
        ...prev.generationConfig,
        [field]: value
      }
    }));
  };

  const handleWriterModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const mode = e.target.value as WriterMode;
      if (mode === WriterMode.CUSTOM) {
          handleChange('writerMode', mode);
          return;
      }
      const preset = WRITER_PRESETS[mode];
      setConfig(prev => ({
          ...prev,
          writerMode: mode,
          generationConfig: {
              ...prev.generationConfig,
              temperature: preset.temp,
              topP: preset.topP,
              topK: preset.topK
          }
      }));
  };

  const handleApiKeysChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      const keys = text.split('\n').map(k => k.trim()).filter(k => k.length > 0);
      handleChange('apiKeys', keys);
  };

  const extractTextFromPdf = async (file: File): Promise<string> => {
      if (!window.pdfjsLib) throw new Error("Thư viện PDF chưa được tải");
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += `--- Page ${i} ---\n${pageText}\n\n`;
      }
      return fullText;
  };

  const handleKnowledgeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          // Check for API Keys first
          const apiKey = config.apiKeys.length > 0 ? config.apiKeys[0] : (process.env.API_KEY || '');
          if (!apiKey) {
              alert("Bạn cần nhập API Key trong phần cài đặt trước để huấn luyện/vector hóa tệp tin.");
              return;
          }

          setIsProcessing(true);
          const newFiles: KnowledgeFile[] = [];
          
          for (let i = 0; i < e.target.files.length; i++) {
              const file = e.target.files[i];
              setProcessingStatus(`Đang xử lý ${file.name}...`);
              
              if (file.size > MAX_FILE_SIZE_BYTES) {
                  alert(`File ${file.name} quá lớn.`);
                  continue;
              }
              try {
                  let text = '';
                  if (file.type === 'application/pdf') {
                      try { text = await extractTextFromPdf(file); } catch { continue; }
                  } else {
                      try { text = await file.text(); } catch { text = ""; }
                  }
                  
                  if (text) {
                    setProcessingStatus(`Đang vector hóa ${file.name}... (Training)`);
                    const vectorizedFile = await geminiService.vectorizeFile({
                        name: file.name,
                        content: text,
                        type: file.type,
                        size: file.size
                    }, apiKey);
                    
                    newFiles.push(vectorizedFile);
                  }
              } catch (err) { 
                  console.error(err);
                  alert(`Thất bại khi xử lý ${file.name}`);
              }
          }
          if (newFiles.length > 0) {
              setConfig(prev => ({ ...prev, knowledgeFiles: [...prev.knowledgeFiles, ...newFiles] }));
          }
          setIsProcessing(false);
          setProcessingStatus('');
          e.target.value = '';
      }
  };

  const addStopSequence = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newStopSequence.trim()) {
      e.preventDefault();
      const current = config.generationConfig.stopSequences || [];
      if (current.length < 5 && !current.includes(newStopSequence.trim())) {
        handleGenConfigChange('stopSequences', [...current, newStopSequence.trim()]);
        setNewStopSequence('');
      }
    }
  };

  const removeStopSequence = (seq: string) => {
    const current = config.generationConfig.stopSequences || [];
    handleGenConfigChange('stopSequences', current.filter(s => s !== seq));
  };

  return (
    <div className={`
        bg-white dark:bg-[#1e1f20] border-l border-[#dadce0] dark:border-[#444746] 
        text-[#1f1f1f] dark:text-[#e3e3e3] font-roboto text-[13px]
        md:w-[360px] md:relative md:flex flex-col h-full overflow-y-auto flex-shrink-0
        fixed inset-0 z-50 w-full animate-in slide-in-from-right duration-200
        ${isCollapsed ? 'hidden' : 'flex'}
    `}>
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-[#dadce0] dark:border-[#444746] bg-white dark:bg-[#1e1f20]">
          <h2 className="font-medium text-lg">Cài đặt</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
              <span className="material-symbols-outlined">close</span>
          </button>
      </div>
      
      {/* API Key Input */}
      <div className="p-4 border-b border-[#dadce0] dark:border-[#444746] bg-blue-50 dark:bg-[#1a2e47]/30">
          <div 
              className="flex justify-between items-center cursor-pointer mb-1"
              onClick={() => setApiKeysOpen(!apiKeysOpen)}
          >
              <label className="block font-medium text-[#3c4043] dark:text-[#8ab4f8]">API Keys</label>
              <span className={`material-symbols-outlined text-[#5f6368] dark:text-[#c4c7c5] text-lg transform transition-transform ${apiKeysOpen ? 'rotate-180' : ''}`}>expand_more</span>
          </div>
          {apiKeysOpen && (
              <>
                <p className="text-[10px] text-[#5f6368] dark:text-[#9aa0a6] mb-2">
                    Nhập mỗi key một dòng. Hệ thống sẽ tự động xoay vòng khi lỗi.
                </p>
                <textarea
                    value={config.apiKeys ? config.apiKeys.join('\n') : ''}
                    onChange={handleApiKeysChange}
                    placeholder="AIzaSy...&#10;AIzaSy..."
                    className="w-full bg-white dark:bg-[#2d2e30] border border-[#dadce0] dark:border-[#5e5e5e] rounded p-2 text-xs focus:ring-1 focus:ring-[#1a73e8] font-mono h-24 resize-y text-[#3c4043] dark:text-[#e3e3e3]"
                />
              </>
          )}
           {!apiKeysOpen && config.apiKeys.length === 0 && (
             <p className="text-[10px] text-red-500 mt-1">Chưa có API Key nào.</p>
           )}
           {!apiKeysOpen && config.apiKeys.length > 0 && (
             <p className="text-[10px] text-[#5f6368] dark:text-[#9aa0a6] mt-1">Đã tải {config.apiKeys.length} key</p>
           )}
      </div>

      {/* Model Selection */}
      <div className="p-4 border-b border-[#dadce0] dark:border-[#444746]">
        <label className="block font-medium text-[#3c4043] dark:text-[#c4c7c5] mb-2">Mô hình (Model)</label>
        <div className="relative">
          <select
            value={config.model}
            onChange={(e) => handleChange('model', e.target.value)}
            className="w-full appearance-none bg-white dark:bg-[#1e1f20] border border-[#dadce0] dark:border-[#5e5e5e] hover:border-[#3c4043] dark:hover:border-[#c4c7c5] text-[#3c4043] dark:text-[#e3e3e3] py-2 px-3 pr-8 rounded focus:outline-none focus:ring-2 focus:ring-[#1a73e8] focus:border-transparent transition-colors"
          >
            {AVAILABLE_MODELS.map((model) => (
              <option key={model.id} value={model.id}>{model.name}</option>
            ))}
          </select>
          <span className="material-symbols-outlined absolute right-2 top-2.5 text-[#5f6368] dark:text-[#c4c7c5] pointer-events-none text-lg">arrow_drop_down</span>
        </div>
      </div>

       {/* Interface / Appearance Settings */}
       <div className="p-4 border-b border-[#dadce0] dark:border-[#444746]">
            <div 
                className="flex justify-between items-center cursor-pointer py-1"
                onClick={() => setInterfaceOpen(!interfaceOpen)}
            >
                <h3 className="font-medium text-[#3c4043] dark:text-[#c4c7c5]">Giao diện (Interface)</h3>
                <span className={`material-symbols-outlined text-[#5f6368] dark:text-[#c4c7c5] text-lg transform transition-transform ${interfaceOpen ? 'rotate-180' : ''}`}>expand_more</span>
            </div>
            {interfaceOpen && (
                <div className="mt-4">
                    <div className="flex justify-between mb-1">
                        <span className="text-[#5f6368] dark:text-[#c4c7c5]">Thu phóng (Zoom)</span>
                        <span className="text-[#3c4043] dark:text-[#e3e3e3]">{Math.round((config.uiScale || 1) * 100)}%</span>
                    </div>
                    <input
                        type="range" min="0.75" max="1.5" step="0.05"
                        value={config.uiScale || 1}
                        onChange={(e) => handleChange('uiScale', parseFloat(e.target.value))}
                        className="w-full h-1 bg-[#dadce0] dark:bg-[#444746] rounded-lg appearance-none cursor-pointer accent-[#1a73e8]"
                    />
                </div>
            )}
       </div>

        {/* Text-to-Speech Settings */}
        <div className="p-4 border-b border-[#dadce0] dark:border-[#444746]">
            <div 
                className="flex justify-between items-center cursor-pointer py-1"
                onClick={() => setTtsOpen(!ttsOpen)}
            >
                <h3 className="font-medium text-[#3c4043] dark:text-[#c4c7c5]">Gemini Text-to-Speech</h3>
                <span className={`material-symbols-outlined text-[#5f6368] dark:text-[#c4c7c5] text-lg transform transition-transform ${ttsOpen ? 'rotate-180' : ''}`}>expand_more</span>
            </div>
            {ttsOpen && (
                <div className="mt-4 space-y-4">
                    <div>
                        <label className="block text-[#5f6368] dark:text-[#c4c7c5] mb-1">Giọng nói (Voice)</label>
                        <div className="relative">
                            <select
                                value={config.ttsVoice || 'Kore'}
                                onChange={(e) => handleChange('ttsVoice', e.target.value)}
                                className="w-full bg-[#f1f3f4] dark:bg-[#2d2e30] border-none text-[#3c4043] dark:text-[#e3e3e3] py-1.5 px-3 pr-8 rounded text-xs focus:ring-0 cursor-pointer"
                            >
                                {GEMINI_VOICES.map((voice) => (
                                    <option key={voice.value} value={voice.value}>
                                        {voice.name}
                                    </option>
                                ))}
                            </select>
                             <span className="material-symbols-outlined absolute right-2 top-1.5 text-[#5f6368] dark:text-[#c4c7c5] pointer-events-none text-sm">arrow_drop_down</span>
                        </div>
                    </div>
                </div>
            )}
        </div>

      {/* Run Settings */}
      <div className="p-4 border-b border-[#dadce0] dark:border-[#444746]">
        <h3 className="font-medium text-[#3c4043] dark:text-[#c4c7c5] mb-4">Cấu hình chạy (Run settings)</h3>
        
        {/* Writer Mode Preset */}
        <div className="mb-4">
             <label className="block text-[#5f6368] dark:text-[#c4c7c5] mb-1">Chế độ viết</label>
             <div className="relative">
                <select 
                    value={config.writerMode}
                    onChange={handleWriterModeChange}
                    className="w-full bg-[#f1f3f4] dark:bg-[#2d2e30] border-none text-[#3c4043] dark:text-[#e3e3e3] py-1.5 px-3 rounded text-xs focus:ring-0 cursor-pointer"
                >
                    <option value={WriterMode.BRAINSTORM}>{WRITER_PRESETS[WriterMode.BRAINSTORM].label}</option>
                    <option value={WriterMode.DRAFTING}>{WRITER_PRESETS[WriterMode.DRAFTING].label}</option>
                    <option value={WriterMode.POLISHING}>{WRITER_PRESETS[WriterMode.POLISHING].label}</option>
                    <option value={WriterMode.CUSTOM}>Tùy chỉnh (Custom)</option>
                </select>
                <span className="material-symbols-outlined absolute right-2 top-1.5 text-[#5f6368] dark:text-[#c4c7c5] pointer-events-none text-sm">arrow_drop_down</span>
             </div>
        </div>

        {/* System Instructions */}
        <div className="mb-4">
             <div 
                className="flex justify-between items-center cursor-pointer mb-2"
                onClick={() => setSystemInstOpen(!systemInstOpen)}
             >
                 <label className="font-medium text-[#3c4043] dark:text-[#c4c7c5] select-none">System Instructions</label>
                 <span className={`material-symbols-outlined text-[#5f6368] dark:text-[#c4c7c5] text-lg transform transition-transform ${systemInstOpen ? 'rotate-180' : ''}`}>expand_more</span>
             </div>
             {systemInstOpen && (
                 <textarea
                    value={config.systemInstruction}
                    onChange={(e) => handleChange('systemInstruction', e.target.value)}
                    className="w-full bg-[#f8f9fa] dark:bg-[#2d2e30] border border-[#dadce0] dark:border-[#5e5e5e] rounded p-2 text-xs focus:bg-white dark:focus:bg-[#1e1f20] focus:ring-2 focus:ring-[#1a73e8] focus:border-transparent resize-y min-h-[100px] font-mono text-[#3c4043] dark:text-[#e3e3e3]"
                    placeholder="Enter system instructions..."
                 />
             )}
        </div>

        {/* Temperature */}
        <div className="mb-4">
           <div className="flex justify-between mb-1">
              <span className="text-[#5f6368] dark:text-[#c4c7c5]" title="Độ sáng tạo">Temperature</span>
              <span className="text-[#3c4043] dark:text-[#e3e3e3]">{config.generationConfig.temperature}</span>
           </div>
           <input
              type="range" min="0" max="2" step="0.1"
              value={config.generationConfig.temperature}
              onChange={(e) => {
                  handleGenConfigChange('temperature', parseFloat(e.target.value));
                  handleChange('writerMode', WriterMode.CUSTOM);
              }}
              className="w-full h-1 bg-[#dadce0] dark:bg-[#444746] rounded-lg appearance-none cursor-pointer accent-[#1a73e8]"
            />
        </div>

        {/* Token Limit */}
        <div className="mb-4">
           <div className="flex justify-between mb-1">
              <span className="text-[#5f6368] dark:text-[#c4c7c5]" title="Độ dài tối đa">Độ dài Output (Tokens)</span>
              <span className="text-[#3c4043] dark:text-[#e3e3e3]">{config.generationConfig.maxOutputTokens}</span>
           </div>
           <input
              type="range" min="100" max="8192" step="100"
              value={config.generationConfig.maxOutputTokens}
              onChange={(e) => handleGenConfigChange('maxOutputTokens', parseInt(e.target.value))}
              className="w-full h-1 bg-[#dadce0] dark:bg-[#444746] rounded-lg appearance-none cursor-pointer accent-[#1a73e8]"
            />
        </div>

        {/* Safety Settings */}
        <div className="mb-2">
            <div 
                className="flex justify-between items-center cursor-pointer py-1"
                onClick={() => setSafetyOpen(!safetyOpen)}
            >
                <span className="text-[#5f6368] dark:text-[#c4c7c5]">Cài đặt an toàn (Safety)</span>
                <span className={`material-symbols-outlined text-[#5f6368] dark:text-[#c4c7c5] text-lg transform transition-transform ${safetyOpen ? 'rotate-180' : ''}`}>expand_more</span>
            </div>
            {safetyOpen && (
                <div className="mt-2">
                    <select
                        value={config.safetyThreshold}
                        onChange={(e) => handleChange('safetyThreshold', e.target.value)}
                        className="w-full bg-white dark:bg-[#2d2e30] border border-[#dadce0] dark:border-[#5e5e5e] text-[#3c4043] dark:text-[#e3e3e3] py-1.5 px-2 rounded text-xs focus:ring-1 focus:ring-[#1a73e8]"
                    >
                        {SAFETY_SETTINGS_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
            )}
        </div>

        {/* Advanced Settings */}
        <div className="mb-2">
            <div 
                className="flex justify-between items-center cursor-pointer py-1"
                onClick={() => setAdvancedOpen(!advancedOpen)}
            >
                <span className="text-[#5f6368] dark:text-[#c4c7c5]">Cài đặt nâng cao</span>
                <span className={`material-symbols-outlined text-[#5f6368] dark:text-[#c4c7c5] text-lg transform transition-transform ${advancedOpen ? 'rotate-180' : ''}`}>expand_more</span>
            </div>
            {advancedOpen && (
                <div className="space-y-4 mt-2 pl-1">
                     <div>
                        <div className="flex justify-between mb-1">
                            <span className="text-[#5f6368] dark:text-[#c4c7c5]">Top K</span>
                            <span className="text-[#3c4043] dark:text-[#e3e3e3]">{config.generationConfig.topK}</span>
                        </div>
                        <input
                            type="range" min="1" max="100" step="1"
                            value={config.generationConfig.topK}
                            onChange={(e) => handleGenConfigChange('topK', parseInt(e.target.value))}
                            className="w-full h-1 bg-[#dadce0] dark:bg-[#444746] rounded-lg appearance-none cursor-pointer accent-[#1a73e8]"
                        />
                    </div>
                    <div>
                        <div className="flex justify-between mb-1">
                            <span className="text-[#5f6368] dark:text-[#c4c7c5]">Top P</span>
                            <span className="text-[#3c4043] dark:text-[#e3e3e3]">{config.generationConfig.topP}</span>
                        </div>
                        <input
                            type="range" min="0" max="1" step="0.01"
                            value={config.generationConfig.topP}
                            onChange={(e) => handleGenConfigChange('topP', parseFloat(e.target.value))}
                            className="w-full h-1 bg-[#dadce0] dark:bg-[#444746] rounded-lg appearance-none cursor-pointer accent-[#1a73e8]"
                        />
                    </div>

                    {/* Target Word Count (Forced) moved here */}
                    <div className="p-2 bg-blue-50 dark:bg-[#1e2a3b] rounded border border-blue-100 dark:border-[#0b57d0]">
                        <div className="flex justify-between mb-1">
                            <span className="text-blue-800 dark:text-blue-300 font-medium" title="Ép AI viết đủ số lượng từ này">Độ dài tối thiểu (Minimum Length)</span>
                            <span className="text-blue-800 dark:text-blue-300 font-bold">{config.targetWordCount}</span>
                        </div>
                        <input
                            type="range" min="500" max="4000" step="100"
                            value={config.targetWordCount}
                            onChange={(e) => handleChange('targetWordCount', parseInt(e.target.value))}
                            className="w-full h-1 bg-blue-200 dark:bg-blue-900 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                            <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1">
                                Mục tiêu số từ trong phản hồi của AI.
                            </p>
                    </div>
                    
                    {/* Stop Sequences */}
                    <div>
                         <label className="block text-[#5f6368] dark:text-[#c4c7c5] mb-1">Stop sequences</label>
                         <div className="flex flex-wrap gap-1 mb-1">
                             {config.generationConfig.stopSequences.map((seq, idx) => (
                                 <span key={idx} className="bg-[#e8f0fe] dark:bg-[#1a2e47] text-[#1967d2] dark:text-[#8ab4f8] px-2 py-0.5 rounded-full text-xs flex items-center">
                                     {seq}
                                     <button onClick={() => removeStopSequence(seq)} className="ml-1 hover:text-[#1a73e8] dark:hover:text-[#a8c7fa]">×</button>
                                 </span>
                             ))}
                         </div>
                         <input
                            type="text"
                            value={newStopSequence}
                            onChange={(e) => setNewStopSequence(e.target.value)}
                            onKeyDown={addStopSequence}
                            placeholder="Thêm chuỗi dừng..."
                            className="w-full bg-white dark:bg-[#2d2e30] border border-[#dadce0] dark:border-[#5e5e5e] rounded px-2 py-1 text-xs focus:ring-1 focus:ring-[#1a73e8] focus:border-transparent dark:text-[#e3e3e3]"
                         />
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* Data / Knowledge */}
      <div className="p-4 border-b border-[#dadce0] dark:border-[#444746]">
           <div 
                className="flex justify-between items-center cursor-pointer mb-2"
                onClick={() => setKnowledgeOpen(!knowledgeOpen)}
           >
               <h3 className="font-medium text-[#3c4043] dark:text-[#c4c7c5]">Kho kiến thức (Knowledge)</h3>
               <span className={`material-symbols-outlined text-[#5f6368] dark:text-[#c4c7c5] text-lg transform transition-transform ${knowledgeOpen ? 'rotate-180' : ''}`}>expand_more</span>
           </div>
           
           {knowledgeOpen && (
               <>
                <div className="flex flex-col gap-2 mb-3">
                    <button 
                        onClick={() => knowledgeInputRef.current?.click()}
                        disabled={isProcessing}
                        className={`flex-1 ${isProcessing ? 'bg-gray-400' : 'bg-[#1a73e8] hover:bg-[#155db1]'} text-white py-1.5 px-3 rounded transition-colors flex items-center justify-center gap-2 text-xs font-medium`}
                    >
                        <span className="material-symbols-outlined text-sm">upload_file</span>
                        {isProcessing ? 'Đang xử lý...' : 'Tải lên & Training'}
                    </button>
                    {isProcessing && (
                         <div className="text-[10px] text-[#1a73e8] dark:text-[#8ab4f8] animate-pulse text-center">
                             {processingStatus || 'Đang vector hóa...'}
                         </div>
                    )}
                </div>
                <input 
                    type="file" 
                    ref={knowledgeInputRef}
                    className="hidden" 
                    multiple
                    accept=".txt,.md,.json,.csv,.pdf,.doc,.docx"
                    onChange={handleKnowledgeUpload}
                />
                
                <div className="space-y-1 max-h-40 overflow-y-auto">
                    {config.knowledgeFiles.map(file => (
                        <div key={file.id} className="flex items-center justify-between bg-[#f8f9fa] dark:bg-[#2d2e30] p-2 rounded border border-[#dadce0] dark:border-[#5e5e5e] group hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043]">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <span className="material-symbols-outlined text-[#5f6368] dark:text-[#c4c7c5] text-sm">
                                    {file.chunks && file.chunks.length > 0 ? 'psychology' : 'description'}
                                </span>
                                <div className="flex flex-col truncate max-w-[160px]">
                                    <span className="text-xs text-[#3c4043] dark:text-[#e3e3e3] truncate">{file.name}</span>
                                    {file.chunks && (
                                        <span className="text-[9px] text-green-600 dark:text-green-400">
                                            Vectorized ({file.chunks.length} chunks)
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button 
                                onClick={() => {
                                    setConfig(prev => ({
                                        ...prev,
                                        knowledgeFiles: prev.knowledgeFiles.filter(f => f.id !== file.id)
                                    }));
                                }}
                                className="text-[#5f6368] dark:text-[#9aa0a6] hover:text-[#d93025] dark:hover:text-[#f28b82] opacity-0 group-hover:opacity-100"
                            >
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>
                    ))}
                    {config.knowledgeFiles.length === 0 && (
                        <p className="text-xs text-[#5f6368] dark:text-[#9aa0a6] italic text-center">Chưa có tệp tin nào</p>
                    )}
                </div>
               </>
           )}
      </div>

      {/* Memory View (Simplified) */}
      <div className="p-4">
           <div className="flex justify-between items-center mb-2">
               <h3 className="font-medium text-[#3c4043] dark:text-[#c4c7c5]">Bộ nhớ (Memory)</h3>
               <span className="bg-[#e8f0fe] dark:bg-[#1a2e47] text-[#1967d2] dark:text-[#8ab4f8] text-[10px] px-1.5 py-0.5 rounded">{config.memories.length}</span>
           </div>
           <div className="max-h-32 overflow-y-auto space-y-1">
               {config.memories.map(m => (
                   <div key={m.id} className="text-[11px] text-[#5f6368] dark:text-[#c4c7c5] border-b border-[#f1f3f4] dark:border-[#444746] pb-1">
                       • {m.content}
                   </div>
               ))}
               {config.memories.length === 0 && <p className="text-[11px] text-[#9aa0a6]">Chưa có ký ức được tạo.</p>}
           </div>
      </div>

    </div>
  );
};

export default SettingsPanel;
