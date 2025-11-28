
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Role, ChatMessage, Attachment, AppConfig, MemoryItem, ChatSession } from './types';
import { createGeminiService, estimateTokens, estimateImageTokens } from './services/geminiService';
import { DEFAULT_APP_CONFIG, MAX_FILE_SIZE_BYTES } from './constants';
import SettingsPanel from './components/SettingsPanel';
import MarkdownView from './components/MarkdownView';
import { saveSession, getSessions, deleteSessionFromDB, saveAppConfig, getAppConfig } from './db';

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
  
  // TTS State
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Edit Mode State
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Settings Visibility
  const [settingsCollapsed, setSettingsCollapsed] = useState(true); 
  
  const [focusMode, setFocusMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Config State
  const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Persistence State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Stats State
  const [sessionTokenCount, setSessionTokenCount] = useState(0);

  // PWA / Fullscreen State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null); // Ref for the scroll container
  const isUserAtBottomRef = useRef(true); // Track if user is currently at the bottom
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

  // --- TTS Logic ---
  const stopAudio = () => {
    if (audioSourceRef.current) {
        audioSourceRef.current.stop();
        audioSourceRef.current = null;
    }
    setSpeakingMessageId(null);
  };

  const handleSpeak = async (text: string, id: string) => {
    // Stop current playback if any
    if (speakingMessageId === id) {
        stopAudio();
        return;
    }
    stopAudio();

    // Check API Key first
    if (appConfig.apiKeys.length === 0) {
        alert("Vui lòng nhập API Key để sử dụng tính năng Text-to-Speech của Gemini.");
        return;
    }

    setSpeakingMessageId(id); // Set loading/active state

    try {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        // Ensure AudioContext is resumed (browser policy)
        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }

        const audioBuffer = await geminiService.generateSpeech(text, appConfig.ttsVoice || 'Kore');
        
        if (!audioBuffer) {
            alert("Không thể tạo giọng đọc. Vui lòng thử lại.");
            setSpeakingMessageId(null);
            return;
        }

        // Decode audio data
        const decodedBuffer = await audioContextRef.current.decodeAudioData(audioBuffer);
        
        const source = audioContextRef.current.createBufferSource();
        source.buffer = decodedBuffer;
        source.connect(audioContextRef.current.destination);
        
        source.onended = () => {
            setSpeakingMessageId(null);
            audioSourceRef.current = null;
        };
        
        audioSourceRef.current = source;
        source.start(0);

    } catch (error) {
        console.error("Audio Playback Error:", error);
        alert("Lỗi khi phát âm thanh.");
        setSpeakingMessageId(null);
    }
  };

  // --- PWA / Fullscreen Logic ---
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        }
        setDeferredPrompt(null);
      });
    }
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
            setIsFullScreen(true);
        }).catch(err => {
            console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
            setIsFullScreen(false);
        }
    }
  };

  useEffect(() => {
      const handleFullScreenChange = () => {
          setIsFullScreen(!!document.fullscreenElement);
      };
      document.addEventListener('fullscreenchange', handleFullScreenChange);
      return () => document.removeEventListener('fullscreenchange', handleFullScreenChange);
  }, []);

  // --- Config Persistence (IndexedDB) ---
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const savedConfig = await getAppConfig();
        if (savedConfig) {
             // Merge with default to ensure new keys exist if schema changes
             setAppConfig(prev => ({
                 ...DEFAULT_APP_CONFIG,
                 ...savedConfig,
                 generationConfig: {
                     ...DEFAULT_APP_CONFIG.generationConfig,
                     ...(savedConfig.generationConfig || {})
                 }
             }));
        } else {
            // First time load, open settings on desktop
            if (window.innerWidth > 768) {
                setSettingsCollapsed(false);
            }
        }
      } catch (e) {
        console.error("Failed to load app config from DB", e);
      } finally {
        setConfigLoaded(true);
      }
    };
    loadConfig();
  }, []);

  useEffect(() => {
    if (!configLoaded) return;
    
    // Debounce save to avoid slamming DB
    const timeout = setTimeout(() => {
        saveAppConfig(appConfig).catch(e => console.error("Failed to save config to DB", e));
    }, 1000);
    return () => clearTimeout(timeout);
  }, [appConfig, configLoaded]);

  // --- Persistence Logic (Sessions) ---

  // Load sessions from DB on mount
  useEffect(() => {
    const loadSessions = async () => {
        try {
            const savedSessions = await getSessions();
            setSessions(savedSessions);
        } catch (e) {
            console.error("Failed to load sessions from DB", e);
        }
    };
    loadSessions();
  }, []);

  // Save current session to DB whenever messages update
  useEffect(() => {
      const saveCurrent = async () => {
          if (currentSessionId && messages.length > 0) {
              const currentTitle = sessions.find(s => s.id === currentSessionId)?.title || 'Đoạn chat chưa đặt tên';
              const newTitle = currentTitle === 'Đoạn chat chưa đặt tên' && messages[0].role === Role.USER 
                               ? (messages[0].text.slice(0, 30) + (messages[0].text.length > 30 ? '...' : '')) 
                               : currentTitle;
              
              const sessionToSave: ChatSession = {
                  id: currentSessionId,
                  title: newTitle,
                  messages: messages,
                  updatedAt: Date.now(),
                  totalTokens: sessionTokenCount
              };

              await saveSession(sessionToSave);
              
              // Update local state list to reflect title change or timestamp
              setSessions(prev => {
                  const exists = prev.find(s => s.id === currentSessionId);
                  if (exists) {
                      return prev.map(s => s.id === currentSessionId ? sessionToSave : s);
                  }
                  return [sessionToSave, ...prev];
              });
          }
      };
      // Debounce slightly to avoid slamming DB
      const timeout = setTimeout(saveCurrent, 500);
      return () => clearTimeout(timeout);
  }, [messages, currentSessionId, sessionTokenCount]);

  const createNewSession = useCallback(() => {
      const newId = Date.now().toString();
      const newSession: ChatSession = {
          id: newId,
          title: 'Đoạn chat chưa đặt tên',
          messages: [],
          updatedAt: Date.now(),
          totalTokens: 0
      };
      // Optimistically add to list
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newId);
      setMessages([]);
      setAttachments([]);
      setSessionTokenCount(0);
      turnCountRef.current = 0;
      geminiService.startChat(appConfig); 
      setMobileMenuOpen(false); // Close menu on mobile
      isUserAtBottomRef.current = true; // Reset scroll state
      return newId;
  }, [appConfig]);

  const loadSession = (sessionId: string) => {
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
          setCurrentSessionId(sessionId);
          setMessages(session.messages);
          setAttachments([]);
          setSessionTokenCount(session.totalTokens || 0);
          geminiService.startChat(appConfig); 
          setMobileMenuOpen(false); // Close menu on mobile
          isUserAtBottomRef.current = true; // Reset scroll state
      }
  };

  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation();
      try {
          await deleteSessionFromDB(sessionId);
          setSessions(prev => prev.filter(s => s.id !== sessionId));
          if (currentSessionId === sessionId) {
              setMessages([]);
              setCurrentSessionId(null);
              setSessionTokenCount(0);
          }
      } catch (err) {
          console.error("Failed to delete session", err);
      }
  };

  const initChat = useCallback(() => {
    geminiService.startChat(appConfig);
  }, [appConfig]);

  useEffect(() => {
    if (configLoaded) {
        initChat();
    }
  }, [initChat, configLoaded]);

  // --- Scroll Logic ---
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Check user scroll position to toggle auto-scroll
  const handleScroll = () => {
      if (chatContainerRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
          // If within 50px of the bottom, we consider the user "at the bottom"
          const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
          isUserAtBottomRef.current = isAtBottom;
      }
  };

  // Only auto-scroll if the user was already at the bottom
  useEffect(() => {
    if (isUserAtBottomRef.current) {
        scrollToBottom();
    }
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

    // Force scroll to bottom when user explicitly sends a message
    isUserAtBottomRef.current = true;
    setTimeout(scrollToBottom, 0);

    if (!currentSessionId) {
        createNewSession();
    }

    // Estimate user tokens instantly for UI
    const estimatedUserTokens = estimateTokens(textToSend) + (attachments.length * estimateImageTokens());
    
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: Role.USER,
      text: textToSend,
      attachments: [...attachments],
      timestamp: Date.now(),
      tokenCount: estimatedUserTokens
    };

    setMessages(prev => [...prev, userMessage]);
    setSessionTokenCount(prev => prev + estimatedUserTokens);
    
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
        const { text, groundingMetadata, usageMetadata } = chunk as any;
        
        if (text) {
             fullText += text;
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

        if (usageMetadata) {
             const totalTurnTokens = usageMetadata.totalTokens;
             setMessages(prev => 
                prev.map(msg => 
                  msg.id === modelMessageId ? { ...msg, tokenCount: usageMetadata.outputTokens } : msg
                )
             );
             setSessionTokenCount(prev => prev + usageMetadata.outputTokens);
        }
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => 
        prev.map(msg => 
          msg.id === modelMessageId ? { 
              ...msg, 
              text: "Lỗi hệ thống: " + (error as any).message, 
              isError: true 
          } : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = async (messageId: string) => {
      const errorMsgIndex = messages.findIndex(m => m.id === messageId);
      if (errorMsgIndex <= 0) return;

      const userMsg = messages[errorMsgIndex - 1];
      if (userMsg.role !== Role.USER) return;
      
      setMessages(prev => prev.filter(m => m.id !== messageId));
      handleSendMessage(userMsg.text); 
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Check if on mobile (rough heuristic) or specifically use checking window width
    const isMobile = window.innerWidth < 768;

    if (e.key === 'Enter') {
        if (!e.shiftKey && !isMobile) {
            // Desktop: Enter sends
            e.preventDefault();
            handleSendMessage();
        } 
        // Mobile: Enter does default (newline), Shift+Enter (if avail) does newline
    }
  };

  // --- Edit & Branch Logic ---
  const handleEditClick = (msg: ChatMessage) => {
      setEditingMessageId(msg.id);
      setEditText(msg.text);
  };

  const handleEditCancel = () => {
      setEditingMessageId(null);
      setEditText('');
  };

  const handleEditSubmit = async (originalMsgId: string) => {
      if (!editText.trim()) return;
      
      const index = messages.findIndex(m => m.id === originalMsgId);
      if (index === -1) return;

      const previousMessages = messages.slice(0, index);
      setMessages(previousMessages);
      
      setEditingMessageId(null);
      handleSendMessage(editText);
  };

  const handleQuickAction = (action: string) => {
      if (!input.trim()) {
          alert("Vui lòng nhập nội dung trước.");
          return;
      }
      let prompt = "";
      switch (action) {
          case 'expand': prompt = `Mở rộng ý này thành một cảnh đầy đủ với các chi tiết cảm giác:\n\n${input}`; break;
          case 'describe': prompt = `Viết một đoạn mô tả sống động, giàu không khí:\n\n${input}`; break;
          case 'dialogue': prompt = `Viết một đoạn hội thoại thực tế dựa trên:\n\n${input}`; break;
          case 'rewrite': prompt = `Viết lại đoạn này văn học hơn và ấn tượng hơn:\n\n${input}`; break;
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
            alert(`File "${file.name}" quá lớn.`);
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

  // UI Scale Wrapper Style
  const appStyle = {
      zoom: appConfig.uiScale || 1
  } as React.CSSProperties;

  return (
    <div className="flex h-screen w-full bg-white dark:bg-[#131314] text-[#1f1f1f] dark:text-[#e3e3e3] font-sans transition-colors duration-200 overflow-hidden" style={appStyle}>
      
      {/* Sidebar - Prompts/History (Responsive: Overlay on mobile) */}
      {!focusMode && (
          <>
            {/* Backdrop for mobile */}
            {mobileMenuOpen && (
                <div 
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}
            
            <div className={`
                w-[260px] bg-[#f0f4f9] dark:bg-[#1e1f20] flex flex-col py-3 border-r border-[#dadce0] dark:border-[#444746] flex-shrink-0 
                transition-transform duration-300 ease-in-out z-50
                fixed inset-y-0 left-0 lg:static lg:transform-none
                ${mobileMenuOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full lg:translate-x-0'}
            `}>
                <div className="px-4 mb-4 flex justify-between items-center lg:block">
                     <button 
                        onClick={() => createNewSession()}
                        className="flex items-center gap-3 bg-[#dde3ea] dark:bg-[#2d2e30] hover:bg-[#c4c7c5] dark:hover:bg-[#444746] w-full py-3 px-4 rounded-xl transition-colors text-sm font-medium text-[#1f1f1f] dark:text-[#e3e3e3]"
                     >
                         <span className="material-symbols-outlined text-xl">add</span>
                         Tạo mới
                     </button>
                </div>
                
                {/* Mobile Specific Controls */}
                <div className="lg:hidden px-4 mb-2 flex gap-2">
                    {deferredPrompt && (
                        <button 
                            onClick={handleInstallClick}
                            className="flex-1 flex items-center justify-center gap-2 bg-[#1a73e8] text-white py-2 rounded-lg text-xs font-medium"
                        >
                            <span className="material-symbols-outlined text-sm">download</span>
                            Cài đặt App
                        </button>
                    )}
                    <button 
                         onClick={toggleFullScreen}
                         className="flex items-center justify-center p-2 bg-[#f1f3f4] dark:bg-[#3c4043] rounded-lg text-[#5f6368] dark:text-[#e3e3e3]"
                         title="Toàn màn hình"
                    >
                         <span className="material-symbols-outlined text-lg">
                             {isFullScreen ? 'fullscreen_exit' : 'fullscreen'}
                         </span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-2 space-y-1">
                     <div className="px-3 py-2 text-xs font-medium text-[#5f6368] dark:text-[#9aa0a6]">Đoạn chat gần đây</div>
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
                         <div className="px-5 text-xs text-[#5f6368] dark:text-[#80868b] italic">Chưa có đoạn chat nào</div>
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
                         {isDarkMode ? 'Chế độ Sáng' : 'Chế độ Tối'}
                     </button>
                </div>
            </div>
          </>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative max-w-full bg-white dark:bg-[#131314] overflow-hidden">
        {/* Header */}
        <header className="h-14 border-b border-[#dadce0] dark:border-[#444746] flex items-center justify-between px-4 bg-white dark:bg-[#131314] z-20 flex-shrink-0">
          <div className="flex items-center space-x-3 truncate">
            {/* Hamburger for Mobile */}
            {!focusMode && (
                <button 
                    className="lg:hidden p-1 text-[#5f6368] dark:text-[#c4c7c5]"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                    <span className="material-symbols-outlined">menu</span>
                </button>
            )}
            
            {focusMode && (
                <button onClick={() => setFocusMode(false)} className="text-[#5f6368] dark:text-[#c4c7c5] hover:text-[#1a73e8] dark:hover:text-[#8ab4f8]">
                    <span className="material-symbols-outlined">fullscreen_exit</span>
                </button>
            )}
            <h1 className="text-lg font-medium text-[#444746] dark:text-[#e3e3e3] truncate max-w-[150px] md:max-w-xs">
                {currentSessionId ? sessions.find(s => s.id === currentSessionId)?.title : 'Đoạn chat mới'}
            </h1>
            {isSummarizing && (
                <span className="text-xs text-[#1a73e8] dark:text-[#8ab4f8] flex items-center gap-1 ml-2 animate-pulse hidden sm:flex">
                    <span className="material-symbols-outlined text-[14px]">psychology</span>
                    Đang lưu ký ức...
                </span>
            )}
          </div>
          <div className="flex items-center gap-1 md:gap-2">
             <div className="px-3 py-1 rounded bg-[#f1f3f4] dark:bg-[#2d2e30] text-xs font-mono text-[#5f6368] dark:text-[#9aa0a6] hidden md:block" title="Tổng token ước tính">
                 {sessionTokenCount.toLocaleString()} tokens
             </div>
             <button onClick={() => setFocusMode(!focusMode)} className="p-2 text-[#5f6368] dark:text-[#c4c7c5] hover:bg-[#f1f3f4] dark:hover:bg-[#2d2e30] rounded-full hidden sm:block" title="Chế độ tập trung">
                 <span className="material-symbols-outlined">fullscreen</span>
             </button>
             <button 
                onClick={() => setSettingsCollapsed(!settingsCollapsed)}
                className={`p-2 rounded-full text-[#5f6368] dark:text-[#c4c7c5] hover:bg-[#f1f3f4] dark:hover:bg-[#2d2e30] ${!settingsCollapsed ? 'bg-[#e8f0fe] dark:bg-[#1a2e47] text-[#1a73e8] dark:text-[#8ab4f8]' : ''}`}
                title="Cài đặt Mô hình"
             >
                <span className="material-symbols-outlined">tune</span>
             </button>
             <button 
                onClick={() => handleSendMessage()}
                className="bg-[#1a73e8] dark:bg-[#0b57d0] text-white px-3 md:px-4 py-1.5 rounded-full text-sm font-medium hover:bg-[#155db1] dark:hover:bg-[#0842a0] flex-shrink-0"
             >
                 <span className="hidden md:inline">Chạy</span>
                 <span className="material-symbols-outlined text-sm md:hidden">play_arrow</span>
             </button>
          </div>
        </header>

        {/* Messages */}
        <div 
          ref={chatContainerRef}
          onScroll={handleScroll}
          className={`flex-1 overflow-y-auto px-4 ${focusMode ? 'md:px-48' : 'md:px-16'} py-6 scroll-smooth bg-white dark:bg-[#131314]`}
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center select-none p-4 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-[#4285f4] to-[#9b72cb] rounded-xl mb-4 opacity-20"></div>
              <p className="text-2xl text-[#444746] dark:text-[#e3e3e3] font-normal mb-2">Xin chào</p>
              <p className="text-[#444746] dark:text-[#c4c7c5] text-lg">Tôi có thể giúp gì cho bạn hôm nay?</p>
            </div>
          ) : (
            <div className="flex flex-col space-y-8 pb-40">
              {messages.map((msg) => (
                <div key={msg.id} className="flex flex-col gap-1 group">
                  <div className="flex items-center gap-2 mb-1 justify-between">
                      <div className="flex items-center gap-2">
                          {msg.role === Role.MODEL ? (
                              <span className="material-symbols-outlined text-[#1a73e8] dark:text-[#8ab4f8] text-lg">auto_awesome</span>
                          ) : (
                              <span className="material-symbols-outlined text-[#5f6368] dark:text-[#c4c7c5] text-lg">person</span>
                          )}
                          <span className="text-sm font-medium text-[#444746] dark:text-[#c4c7c5] uppercase">{msg.role === Role.USER ? 'BẠN' : 'AI'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                          {msg.tokenCount && (
                              <span className="text-[10px] text-[#5f6368] dark:text-[#5e5e5e] font-mono">
                                  {msg.tokenCount} tok
                              </span>
                          )}
                          
                          {/* TTS Button for AI */}
                          {msg.role === Role.MODEL && !msg.isError && msg.text && (
                              <button 
                                onClick={() => handleSpeak(msg.text, msg.id)}
                                className={`text-[#5f6368] dark:text-[#c4c7c5] hover:text-[#1a73e8] dark:hover:text-[#8ab4f8] transition-opacity ${speakingMessageId === msg.id ? 'opacity-100 animate-pulse text-[#1a73e8]' : 'opacity-0 group-hover:opacity-100'}`}
                                title={speakingMessageId === msg.id ? "Dừng đọc" : "Đọc văn bản (Gemini TTS)"}
                              >
                                  <span className="material-symbols-outlined text-[18px]">
                                      {speakingMessageId === msg.id ? 'stop_circle' : 'volume_up'}
                                  </span>
                              </button>
                          )}

                          {/* Edit Button for User Messages */}
                          {msg.role === Role.USER && !isLoading && editingMessageId !== msg.id && (
                              <button 
                                onClick={() => handleEditClick(msg)}
                                className="opacity-0 group-hover:opacity-100 text-[#5f6368] dark:text-[#c4c7c5] hover:text-[#1a73e8] dark:hover:text-[#8ab4f8] transition-opacity"
                                title="Chỉnh sửa & Chạy lại"
                              >
                                  <span className="material-symbols-outlined text-[16px]">edit</span>
                              </button>
                          )}
                      </div>
                  </div>

                  <div className={`pl-7 ${msg.role === Role.USER ? 'text-[#1f1f1f] dark:text-[#e3e3e3]' : 'text-[#3c4043] dark:text-[#c4c7c5]'}`}>
                    {/* Render Edit Mode or Normal Mode */}
                    {editingMessageId === msg.id ? (
                        <div className="bg-[#f0f4f9] dark:bg-[#1e1f20] p-3 rounded-lg border border-[#dadce0] dark:border-[#444746]">
                            <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="w-full bg-transparent border-none focus:ring-0 resize-none text-[#1f1f1f] dark:text-[#e3e3e3] text-[15px]"
                                rows={3}
                            />
                            <div className="flex justify-end gap-2 mt-2">
                                <button 
                                    onClick={handleEditCancel}
                                    className="px-3 py-1 text-xs font-medium text-[#5f6368] hover:bg-[#e3e3e3] dark:hover:bg-[#3c4043] rounded"
                                >
                                    Hủy
                                </button>
                                <button 
                                    onClick={() => handleEditSubmit(msg.id)}
                                    className="px-3 py-1 text-xs font-medium bg-[#1a73e8] text-white rounded hover:bg-[#155db1]"
                                >
                                    Lưu & Chạy
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {msg.attachments && msg.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                                {msg.attachments.map((att, idx) => renderAttachment(att, idx, false))}
                            </div>
                            )}
                            
                            {msg.text === '' && !msg.isError ? (
                            <div className="h-6 w-24 bg-[#f1f3f4] dark:bg-[#2d2e30] rounded shimmer"></div>
                            ) : msg.isError ? (
                            <div className="flex flex-col gap-2 items-start">
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-600 dark:text-red-300 text-sm">
                                    <span className="flex items-center gap-2 font-medium">
                                        <span className="material-symbols-outlined">error</span>
                                        Tạo nội dung thất bại
                                    </span>
                                    <p className="mt-1 opacity-90">{msg.text.replace('System Error: ', '')}</p>
                                </div>
                                <button 
                                        onClick={() => handleRetry(msg.id)}
                                        className="flex items-center gap-1 text-xs text-[#1a73e8] dark:text-[#8ab4f8] hover:underline"
                                >
                                    <span className="material-symbols-outlined text-sm">refresh</span>
                                    Thử lại
                                </button>
                            </div>
                            ) : (
                            <MarkdownView content={msg.text} className={msg.role === Role.MODEL ? 'font-serif text-[15px] md:text-[16px]' : 'text-[15px]'} />
                            )}
                        </>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className={`absolute bottom-0 left-0 right-0 bg-white dark:bg-[#131314] p-2 md:p-4 z-20 ${focusMode ? 'md:px-40' : 'md:px-16'}`}>
           <div className="max-w-4xl mx-auto">
                <div className="flex gap-2 mb-2 overflow-x-auto pb-1 no-scrollbar">
                    {['Expand', 'Describe', 'Dialogue', 'Rewrite'].map(action => (
                        <button 
                            key={action}
                            onClick={() => handleQuickAction(action.toLowerCase())} 
                            className="px-3 py-1 bg-[#f1f3f4] dark:bg-[#2d2e30] text-[#444746] dark:text-[#e3e3e3] rounded-lg text-xs font-medium hover:bg-[#e3e3e3] dark:hover:bg-[#444746] border border-transparent whitespace-nowrap"
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
                            placeholder="Nhập nội dung..."
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
                <div className="text-center mt-2 flex justify-center gap-4 text-[10px] md:text-xs text-[#5f6368] dark:text-[#80868b]">
                    <span>{messages.length} lượt</span>
                    <span>{input.length} ký tự</span>
                </div>
           </div>
        </div>
      </div>

      {/* Settings Panel (Responsive Prop) */}
      <SettingsPanel 
        config={appConfig}
        setConfig={setAppConfig}
        isCollapsed={focusMode || settingsCollapsed}
        geminiService={geminiService}
        onClose={() => setSettingsCollapsed(true)}
      />
    </div>
  );
}
