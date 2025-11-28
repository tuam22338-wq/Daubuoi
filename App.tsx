import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Role, ChatMessage, Attachment, AppConfig, MemoryItem, ChatSession } from './types';
import { createGeminiService } from './services/geminiService';
import { DEFAULT_APP_CONFIG, MAX_FILE_SIZE_BYTES } from './constants';
import SettingsPanel from './components/SettingsPanel';
import MarkdownView from './components/MarkdownView';

const geminiService = createGeminiService();

export default function App() {
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);

  // Persistence State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const turnCountRef = useRef(0);
  const MEMORY_UPDATE_INTERVAL = 4; 

  // --- Theme Effect ---
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // --- Persistence Logic ---

  // Load sessions from LocalStorage on mount
  useEffect(() => {
    try {
      const savedSessions = localStorage.getItem('chat_sessions');
      if (savedSessions) {
        const parsed = JSON.parse(savedSessions);
        setSessions(parsed);
      }
    } catch (e) {
      console.error("Failed to load sessions", e);
    }
  }, []);

  // Save sessions to LocalStorage whenever they change
  useEffect(() => {
      localStorage.setItem('chat_sessions', JSON.stringify(sessions));
  }, [sessions]);

  // Auto-save current messages to the active session
  useEffect(() => {
      if (currentSessionId && messages.length > 0) {
          setSessions(prev => prev.map(session => {
              if (session.id === currentSessionId) {
                  return {
                      ...session,
                      messages: messages,
                      updatedAt: Date.now(),
                      // Update title based on first user message if it's "Untitled"
                      title: session.title === 'Untitled Chat' && messages[0].role === Role.USER 
                             ? (messages[0].text.slice(0, 30) + (messages[0].text.length > 30 ? '...' : '')) 
                             : session.title
                  };
              }
              return session;
          }));
      }
  }, [messages, currentSessionId]);

  const createNewSession = useCallback(() => {
      const newId = Date.now().toString();
      const newSession: ChatSession = {
          id: newId,
          title: 'Untitled Chat',
          messages: [],
          updatedAt: Date.now()
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newId);
      setMessages([]);
      setAttachments([]);
      turnCountRef.current = 0;
      geminiService.startChat(appConfig); // Reset gemini chat
      return newId;
  }, [appConfig]);

  const loadSession = (sessionId: string) => {
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
          setCurrentSessionId(sessionId);
          setMessages(session.messages);
          setAttachments([]);
          // We need to restart the chat service with context from history if we wanted to be perfect, 
          // but for now, we just reset the service and let it build context from new messages or potentially 
          // re-inject history if we implemented history injection in startChat. 
          // For this clone, restarting is safer to avoid state mixup.
          geminiService.startChat(appConfig); 
          // Note: In a real app, we'd feed `session.messages` into `geminiService` history.
      }
  };

  const deleteSession = (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation();
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId) {
          setMessages([]);
          setCurrentSessionId(null);
      }
  };

  // Initialize first session if none exists
  useEffect(() => {
     if (sessions.length === 0 && !currentSessionId) {
         // Don't create automatically to avoid hydration mismatch, wait for user action or create mostly empty
         // But for UX, let's just leave it blank until they type or click new
     }
  }, [sessions.length, currentSessionId]);

  const initChat = useCallback(() => {
    geminiService.startChat(appConfig);
  }, [appConfig]);

  useEffect(() => {
    initChat();
  }, [initChat]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [input]);

  // Memory Extraction Logic
  useEffect(() => {
      const runExtraction = async () => {
          if (messages.length > 0 && turnCountRef.current > 0 && turnCountRef.current % MEMORY_UPDATE_INTERVAL === 0) {
              setIsSummarizing(true);
              try {
                  const recentContext = messages.slice(-5).map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
                  const newFacts = await geminiService.extractMemories(recentContext);
                  if (newFacts.length > 0) {
                      const newMemories: MemoryItem[] = newFacts.map(fact => ({
                          id: Date.now() + Math.random().toString(),
                          content: fact,
                          timestamp: Date.now(),
                          type: 'auto'
                      }));
                      setAppConfig(prev => ({
                          ...prev,
                          memories: [...prev.memories, ...newMemories]
                      }));
                  }
              } catch (e) {
                  console.error("Memory auto-update failed", e);
              } finally {
                  setIsSummarizing(false);
              }
          }
      };
      runExtraction();
  }, [messages]);

  const handleSendMessage = async (overrideText?: string) => {
    const textToSend = overrideText || input;
    if ((!textToSend.trim() && attachments.length === 0) || isLoading) return;

    // If no session exists, create one
    if (!currentSessionId) {
        createNewSession();
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: Role.USER,
      text: textToSend,
      attachments: [...attachments],
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    if (!overrideText) setInput('');
    setAttachments([]);
    setIsLoading(true);
    
    turnCountRef.current += 1;

    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const filesToSend = userMessage.attachments?.map(a => a.file) || [];
    const modelMessageId = (Date.now() + 1).toString();
    const modelMessage: ChatMessage = {
      id: modelMessageId,
      role: Role.MODEL,
      text: '',
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, modelMessage]);

    try {
      const stream = geminiService.sendMessageStream(userMessage.text, filesToSend);
      let fullText = '';
      for await (const chunk of stream) {
        const { text, groundingMetadata } = chunk;
        if (text) fullText += text;
        setMessages(prev => 
          prev.map(msg => 
            msg.id === modelMessageId ? { 
                ...msg, 
                text: fullText,
                groundingMetadata: groundingMetadata || msg.groundingMetadata 
            } : msg
          )
        );
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => 
        prev.map(msg => 
          msg.id === modelMessageId ? { ...msg, text: "Error: " + (error as any).message, isError: true } : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleQuickAction = (action: string) => {
      if (!input.trim()) {
          alert("Please enter a concept first.");
          return;
      }
      let prompt = "";
      switch (action) {
          case 'expand': prompt = `Expand this into a full scene with sensory details:\n\n${input}`; break;
          case 'describe': prompt = `Write a vivid, atmospheric description:\n\n${input}`; break;
          case 'dialogue': prompt = `Write a realistic dialogue based on:\n\n${input}`; break;
          case 'rewrite': prompt = `Rewrite to be more literary and impactful:\n\n${input}`; break;
      }
      handleSendMessage(prompt);
      setInput('');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newAttachments: Attachment[] = [];
      for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        if (file.size > MAX_FILE_SIZE_BYTES) {
            alert(`File "${file.name}" too large.`);
            continue;
        }
        const reader = new FileReader();
        reader.readAsDataURL(file);
        await new Promise<void>((resolve) => {
          reader.onload = () => {
            newAttachments.push({
              file,
              mimeType: file.type,
              name: file.name,
              previewUrl: reader.result as string
            });
            resolve();
          };
        });
      }
      setAttachments(prev => [...prev, ...newAttachments]);
      e.target.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const renderAttachment = (att: Attachment, index: number, isPreview = false) => {
    const isImage = att.mimeType.startsWith('image/');
    return (
        <div key={index} className="relative group">
             {isImage ? (
                <img 
                    src={att.previewUrl} 
                    className={`${isPreview ? 'h-14 w-14' : 'h-32 w-auto'} rounded-md object-cover border border-gray-300 dark:border-gray-600`} 
                    alt={att.name} 
                />
             ) : (
                <div className={`${isPreview ? 'h-14 w-14' : 'h-32 w-32'} bg-gray-100 dark:bg-[#1e1f20] border border-gray-300 dark:border-gray-600 rounded-md flex flex-col items-center justify-center p-2 text-center`}>
                    <span className="material-symbols-outlined text-gray-500 text-xl mb-1">description</span>
                    {!isPreview && <span className="text-xs text-gray-600 dark:text-gray-300 truncate w-full px-1">{att.name}</span>}
                </div>
             )}
             {isPreview && (
                 <button 
                    onClick={() => removeAttachment(index)}
                    className="absolute -top-2 -right-2 bg-gray-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                 >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                 </button>
             )}
        </div>
    );
  };

  return (
    <div className="flex h-screen w-full bg-white dark:bg-[#131314] text-[#1f1f1f] dark:text-[#e3e3e3] font-sans transition-colors duration-200">
      {/* Sidebar - Prompts/History */}
      {!focusMode && (
          <div className="w-[260px] bg-[#f0f4f9] dark:bg-[#1e1f20] flex flex-col py-3 border-r border-[#dadce0] dark:border-[#444746] flex-shrink-0 hidden lg:flex">
             <div className="px-4 mb-4">
                 <button 
                    onClick={() => createNewSession()}
                    className="flex items-center gap-3 bg-[#dde3ea] dark:bg-[#2d2e30] hover:bg-[#c4c7c5] dark:hover:bg-[#444746] w-full py-3 px-4 rounded-xl transition-colors text-sm font-medium text-[#1f1f1f] dark:text-[#e3e3e3]"
                 >
                     <span className="material-symbols-outlined text-xl">add</span>
                     Create new
                 </button>
             </div>
             <div className="flex-1 overflow-y-auto px-2 space-y-1">
                 <div className="px-3 py-2 text-xs font-medium text-[#5f6368] dark:text-[#9aa0a6]">Recent Chats</div>
                 {sessions.map(session => (
                     <div 
                        key={session.id}
                        onClick={() => loadSession(session.id)}
                        className={`mx-2 px-3 py-2 rounded-full text-sm truncate cursor-pointer flex justify-between items-center group
                            ${currentSessionId === session.id 
                                ? 'bg-[#d3e3fd] dark:bg-[#004a77] text-[#001d35] dark:text-[#c2e7ff]' 
                                : 'text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e1e3e1] dark:hover:bg-[#2d2e30]'}`}
                     >
                         <span className="truncate flex-1">{session.title}</span>
                         <button 
                            onClick={(e) => deleteSession(e, session.id)}
                            className="opacity-0 group-hover:opacity-100 text-[#5f6368] hover:text-[#d93025] dark:hover:text-[#f28b82] ml-2"
                         >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                         </button>
                     </div>
                 ))}
                 {sessions.length === 0 && (
                     <div className="px-5 text-xs text-[#5f6368] dark:text-[#80868b] italic">No saved chats</div>
                 )}
             </div>
             
             {/* Bottom Sidebar Action */}
             <div className="px-4 py-2 border-t border-[#dadce0] dark:border-[#444746]">
                 <button 
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className="flex items-center gap-2 text-sm text-[#5f6368] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-[#e3e3e3] py-2 w-full"
                 >
                     <span className="material-symbols-outlined text-lg">
                         {isDarkMode ? 'light_mode' : 'dark_mode'}
                     </span>
                     {isDarkMode ? 'Light Mode' : 'Dark Mode'}
                 </button>
             </div>
          </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative max-w-full bg-white dark:bg-[#131314]">
        {/* Header */}
        <header className="h-14 border-b border-[#dadce0] dark:border-[#444746] flex items-center justify-between px-4 bg-white dark:bg-[#131314] z-10">
          <div className="flex items-center space-x-3">
            {focusMode && (
                <button onClick={() => setFocusMode(false)} className="text-[#5f6368] dark:text-[#c4c7c5] hover:text-[#1a73e8] dark:hover:text-[#8ab4f8]">
                    <span className="material-symbols-outlined">fullscreen_exit</span>
                </button>
            )}
            <h1 className="text-lg font-medium text-[#444746] dark:text-[#e3e3e3]">
                {currentSessionId ? sessions.find(s => s.id === currentSessionId)?.title : 'Untitled Prompt'}
            </h1>
            {isSummarizing && (
                <span className="text-xs text-[#1a73e8] dark:text-[#8ab4f8] flex items-center gap-1 ml-4 animate-pulse">
                    <span className="material-symbols-outlined text-[14px]">psychology</span>
                    Updating memory...
                </span>
            )}
          </div>
          <div className="flex items-center gap-2">
             <button onClick={() => setFocusMode(!focusMode)} className="p-2 text-[#5f6368] dark:text-[#c4c7c5] hover:bg-[#f1f3f4] dark:hover:bg-[#2d2e30] rounded-full" title="Focus Mode">
                 <span className="material-symbols-outlined">fullscreen</span>
             </button>
             <button 
                onClick={() => setSettingsCollapsed(!settingsCollapsed)}
                className={`p-2 rounded-full text-[#5f6368] dark:text-[#c4c7c5] hover:bg-[#f1f3f4] dark:hover:bg-[#2d2e30] ${!settingsCollapsed ? 'bg-[#e8f0fe] dark:bg-[#1a2e47] text-[#1a73e8] dark:text-[#8ab4f8]' : ''}`}
                title="Model Settings"
             >
                <span className="material-symbols-outlined">tune</span>
             </button>
             <button className="bg-[#1a73e8] dark:bg-[#0b57d0] text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-[#155db1] dark:hover:bg-[#0842a0]">
                 Run
             </button>
          </div>
        </header>

        {/* Messages */}
        <div className={`flex-1 overflow-y-auto px-4 ${focusMode ? 'md:px-48' : 'md:px-16'} py-6 scroll-smooth bg-white dark:bg-[#131314]`}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center select-none">
              <div className="w-16 h-16 bg-gradient-to-br from-[#4285f4] to-[#9b72cb] rounded-xl mb-4 opacity-20"></div>
              <p className="text-2xl text-[#444746] dark:text-[#e3e3e3] font-normal mb-2">Hello there</p>
              <p className="text-[#444746] dark:text-[#c4c7c5] text-lg">How can I help you today?</p>
            </div>
          ) : (
            <div className="flex flex-col space-y-8 pb-40">
              {messages.map((msg) => (
                <div key={msg.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 mb-1">
                      {msg.role === Role.MODEL ? (
                           <span className="material-symbols-outlined text-[#1a73e8] dark:text-[#8ab4f8] text-lg">auto_awesome</span>
                      ) : (
                           <span className="material-symbols-outlined text-[#5f6368] dark:text-[#c4c7c5] text-lg">person</span>
                      )}
                      <span className="text-sm font-medium text-[#444746] dark:text-[#c4c7c5] uppercase">{msg.role}</span>
                  </div>

                  <div className={`pl-7 ${msg.role === Role.USER ? 'text-[#1f1f1f] dark:text-[#e3e3e3]' : 'text-[#3c4043] dark:text-[#c4c7c5]'}`}>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {msg.attachments.map((att, idx) => renderAttachment(att, idx, false))}
                      </div>
                    )}
                    
                    {msg.text === '' && !msg.isError ? (
                       <div className="h-6 w-24 bg-[#f1f3f4] dark:bg-[#2d2e30] rounded shimmer"></div>
                    ) : (
                       <MarkdownView content={msg.text} className={msg.role === Role.MODEL ? 'font-serif text-[16px]' : ''} />
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className={`absolute bottom-0 left-0 right-0 bg-white dark:bg-[#131314] p-4 z-20 ${focusMode ? 'md:px-40' : 'md:px-16'}`}>
           <div className="max-w-4xl mx-auto">
                <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
                    {['Expand', 'Describe', 'Dialogue', 'Rewrite'].map(action => (
                        <button 
                            key={action}
                            onClick={() => handleQuickAction(action.toLowerCase())} 
                            className="px-3 py-1 bg-[#f1f3f4] dark:bg-[#2d2e30] text-[#444746] dark:text-[#e3e3e3] rounded-lg text-xs font-medium hover:bg-[#e3e3e3] dark:hover:bg-[#444746] border border-transparent"
                        >
                            {action}
                        </button>
                    ))}
                </div>

                <div className="bg-[#f0f4f9] dark:bg-[#1e1f20] rounded-2xl border border-transparent focus-within:bg-white dark:focus-within:bg-[#2d2e30] focus-within:border-[#dadce0] dark:focus-within:border-[#5e5e5e] focus-within:shadow-sm transition-all">
                    {attachments.length > 0 && (
                        <div className="px-4 pt-3 flex gap-3 overflow-x-auto">
                            {attachments.map((att, i) => renderAttachment(att, i, true))}
                        </div>
                    )}
                    <div className="flex items-end p-2">
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e3e3e3] dark:hover:bg-[#444746] rounded-full transition-colors"
                        >
                            <span className="material-symbols-outlined text-[20px]">add_circle</span>
                        </button>
                        <input 
                            type="file" 
                            multiple 
                            ref={fileInputRef} 
                            className="hidden" 
                            onChange={handleFileSelect}
                        />

                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Type something..."
                            rows={1}
                            className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-3 px-2 max-h-64 text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-[#5f6368] dark:placeholder-[#80868b] text-[16px]"
                            style={{ minHeight: '48px' }}
                        />

                        <button
                            onClick={() => handleSendMessage()}
                            disabled={!input.trim() && attachments.length === 0}
                            className={`p-2 rounded-full transition-all duration-200 ${
                                (input.trim() || attachments.length > 0) && !isLoading
                                ? 'text-[#0b57d0] dark:text-[#8ab4f8] hover:bg-[#e8f0fe] dark:hover:bg-[#1a2e47]'
                                : 'text-[#c4c7c5] dark:text-[#5e5e5e] cursor-not-allowed'
                            }`}
                        >
                            <span className="material-symbols-outlined text-[24px]">send</span>
                        </button>
                    </div>
                </div>
                <div className="text-center mt-2 flex justify-center gap-4 text-xs text-[#5f6368] dark:text-[#80868b]">
                    <span>{messages.length} turns</span>
                    <span>{input.length} chars</span>
                </div>
           </div>
        </div>
      </div>

      {/* Settings Panel */}
      <SettingsPanel 
        config={appConfig}
        setConfig={setAppConfig}
        isCollapsed={focusMode || settingsCollapsed}
      />
    </div>
  );
}