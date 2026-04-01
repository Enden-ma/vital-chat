'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

// The detector: checks if a string contains any Hebrew characters
const isHebrew = (text: string) => /[\u0590-\u05FF]/.test(text);

// Typewriter component for new AI messages


export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: string, content: string, isNew?: boolean }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scrolling is entirely disabled. Nothing moves unless the user scrolls manually.

  // Passcode verification state
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [isEntering, setIsEntering] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState('');

  // Saved messages state
  const [savedMessages, setSavedMessages] = useState<string[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Ref for the auto-resizing textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Check passcode on mount
    const verifyToken = async () => {
      const savedCode = localStorage.getItem('vital-passcode');
      if (savedCode) {
        try {
          const res = await fetch('/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passcode: savedCode }),
          });
          const data = await res.json();
          setIsVerified(Boolean(data.valid));
          if (!data.valid) localStorage.removeItem('vital-passcode');
        } catch {
          setIsVerified(false);
        }
      } else {
        setIsVerified(false);
      }
    };
    verifyToken();

    // Load saved messages on mount
    const stored = localStorage.getItem('vital-saved-messages');
    if (stored) {
      try {
        setSavedMessages(JSON.parse(stored));
      } catch (e) {
        console.error("Could not parse saved messages", e);
      }
    }
  }, []);

  const toggleSaveMessage = (content: string) => {
    setSavedMessages(prev => {
      const isSaved = prev.includes(content);
      const newSaved = isSaved
        ? prev.filter(msg => msg !== content)
        : [...prev, content];

      localStorage.setItem('vital-saved-messages', JSON.stringify(newSaved));
      return newSaved;
    });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input;
    const newChatHistory = [...messages, { role: 'user', content: userText }];

    setMessages(newChatHistory);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          history: newChatHistory,
          passcode: localStorage.getItem('vital-passcode')
        }),
      });

      const data = await response.json();

      if (data.text) {
        setMessages(prev => [...prev, { role: 'ai', content: data.text, isNew: true }]);
      } else if (data.error) {
        setMessages(prev => [...prev, { role: 'ai', content: `[System Error: ${data.error}]`, isNew: true }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', content: "[System: Received an empty response from the brain.]", isNew: true }]);
      }
    } catch (error) {
      console.error("Connection error:", error);
      setMessages(prev => [...prev, { role: 'ai', content: "[System: Front-end connection failed.]" }]);
    } finally {
      setIsLoading(false);
      // Reset textarea height after sending
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);

    // Auto-resize logic
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Only submit if taking a valid action, simulating form submission
      if (input.trim() && !isLoading) {
        handleSend(e as unknown as React.FormEvent);
      }
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcodeInput.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcodeInput }),
      });
      const data = await res.json();
      if (data.valid) {
        localStorage.setItem('vital-passcode', passcodeInput);
        setPasscodeError('');
        setIsEntering(true);
        setTimeout(() => {
          setIsVerified(true);
          setIsEntering(false);
        }, 700);
      } else {
        setPasscodeError('Invalid Code.');
        setIsLoading(false);
      }
    } catch {
      setPasscodeError('Connection error.');
      setIsLoading(false);
    }
  };

  const isRtlInput = !input.trim() || isHebrew(input);

  if (isVerified === null) {
    // Blank state while we check localStorage on first load
    return (
      <main 
        className="h-[100dvh] w-full relative overflow-hidden bg-cover bg-center bg-no-repeat bg-fixed flex items-center justify-center"
        style={{ backgroundImage: "url('/bg.jpg')" }}
      >
        <div className="absolute inset-0 bg-[#F5F9FD]/50 pointer-events-none z-0" />
      </main>
    );
  }

  if (isVerified === false) {
    return (
      <main 
        className="h-[100dvh] w-full text-[#2C3E50] flex flex-col items-center justify-center p-6 sm:p-12 font-sans selection:bg-[#B3D4F0] selection:text-[#1A252F] relative overflow-hidden bg-cover bg-center bg-no-repeat bg-fixed"
        style={{ backgroundImage: "url('/bg.jpg')" }}
      >
        <div className={`absolute inset-0 bg-[#F5F9FD]/50 pointer-events-none z-0 transition-opacity duration-700 ease-in-out ${isEntering ? 'opacity-0' : 'opacity-100'}`} />
        
        <div className={`relative z-10 w-full max-w-sm sm:max-w-md bg-white/60 backdrop-blur-md p-8 sm:p-10 rounded-3xl shadow-lg border border-white/50 text-center transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] ${isEntering ? 'opacity-0 blur-md scale-110 -translate-y-4' : 'opacity-100 blur-0 scale-100 translate-y-0'} fade-in-slow`}>
          <h1 className="text-2xl font-medium tracking-[0.5px] text-[#5D7A94] drop-shadow-sm mb-6" dir="rtl">חיכינו לך :)</h1>
          
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <input
                type="text"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                placeholder="Access Code"
                className="w-full bg-white/50 border border-[#A7C7E7] focus:border-[#5D7A94] outline-none px-4 py-3 rounded-xl text-center text-[#2C3E50] text-[16px] tracking-[2px] transition-all placeholder:tracking-[1px]"
                disabled={isLoading}
              />
              {passcodeError && (
                <p className="text-red-400 text-sm mt-3 font-medium">{passcodeError}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={isLoading || !passcodeInput.trim()}
              className="w-full bg-[#7AA1C4] hover:bg-[#5D7A94] text-white py-3 rounded-xl font-medium tracking-[1px] transition-all disabled:opacity-50 flex justify-center items-center cursor-pointer"
            >
              {isLoading ? (
                <div className="relative flex items-center justify-center w-6 h-6">
                  <div className="absolute w-2 h-2 bg-white rounded-full opacity-90 animate-pulse" style={{ animationDuration: '2s' }}></div>
                  <div className="absolute w-2.5 h-2.5 border-[1.5px] border-white rounded-full animate-ping opacity-100" style={{ animationDuration: '2s' }}></div>
                  <div className="absolute w-2.5 h-2.5 border-[1.5px] border-white rounded-full animate-ping opacity-80" style={{ animationDelay: '0.6s', animationDuration: '2s' }}></div>
                  <div className="absolute w-2.5 h-2.5 border border-white/50 rounded-full animate-ping opacity-50" style={{ animationDelay: '1.2s', animationDuration: '2s' }}></div>
                </div>
              ) : (
                <svg className="w-6 h-6 ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              )}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main 
      className="h-[100dvh] w-full text-[#2C3E50] flex flex-col items-center p-6 sm:p-12 font-sans selection:bg-[#B3D4F0] selection:text-[#1A252F] relative overflow-hidden bg-cover bg-center bg-no-repeat bg-fixed"
      style={{ backgroundImage: "url('/bg.jpg')" }}
    >
      {/* Overlay to ensure text readability while keeping the image completely sharp */}
      <div className="absolute inset-0 bg-[#F5F9FD]/50 pointer-events-none z-0" />


      {/* Saved Messages Sidebar Header/Trigger */}
      <div className="absolute top-6 right-6 sm:top-8 sm:right-8 z-20">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 backdrop-blur-sm border border-[#A7C7E7] text-[#5D7A94] hover:bg-white hover:text-[#2C3E50] hover:border-[#5D7A94] transition-all duration-300 shadow-sm cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={savedMessages.length > 0 ? "currentColor" : "none"} fillOpacity={savedMessages.length > 0 ? 0.3 : 1} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={savedMessages.length > 0 ? "text-[#5D7A94]" : ""}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span className="text-sm font-medium">Saved ({savedMessages.length})</span>
        </button>
      </div>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="absolute inset-0 z-30 flex justify-end">
          <div className="absolute inset-0 bg-[#1A252F]/20 backdrop-blur-[2px] transition-opacity" onClick={() => setIsSidebarOpen(false)} />
          <div className="w-full sm:w-[450px] bg-[#F5F9FD] h-full shadow-2xl relative z-40 flex flex-col transform transition-transform duration-500 border-l border-[#A7C7E7]/50">
            <div className="p-6 border-b border-[#A7C7E7]/30 flex justify-between items-center">
              <h2 className="text-xl font-light text-[#2C3E50] tracking-[1px]">Saved Messages</h2>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-2 text-[#7AA1C4] hover:text-[#2C3E50] transition-colors rounded-full hover:bg-white cursor-pointer"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-grow overflow-y-auto p-6 space-y-6">
              {savedMessages.length === 0 ? (
                <div className="text-center text-[#7AA1C4] font-light mt-10">
                  No messages saved yet. <br /> Star a message to see it here!
                </div>
              ) : (
                [...savedMessages].reverse().map((content, idx) => (
                  <div key={idx} className="bg-white p-5 rounded-2xl shadow-sm border border-[#A7C7E7]/30 relative group">
                    <button
                      onClick={() => toggleSaveMessage(content)}
                      className="absolute top-4 right-4 text-[#5D7A94] opacity-50 hover:opacity-100 hover:text-red-500 transition-all cursor-pointer"
                      title="Remove"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
                      </svg>
                    </button>
                    <div className="text-[14px] font-light leading-relaxed text-[#2C3E50] pr-8" dir={isHebrew(content) ? "rtl" : "ltr"}>
                      <ReactMarkdown
                        components={{
                          // eslint-disable-next-line @typescript-eslint/no-unused-vars
                          strong: ({ node: _node, ...props }) => <span className="font-medium text-[#1A252F]" {...props} />,
                          // eslint-disable-next-line @typescript-eslint/no-unused-vars
                          ul: ({ node: _node, ...props }) => <ul className="list-disc pl-5 space-y-1 my-2" {...props} />,
                        }}
                      >
                        {content}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-3xl flex-grow flex flex-col pb-8 pt-16 overflow-y-auto relative z-10 scroll-smooth no-scrollbar" style={{ overflowAnchor: 'none' }}>
        {messages.length === 0 ? (
          <div className="fade-in-slow text-center mb-12 w-full" dir="rtl">
            <h1 className="text-xl font-medium tracking-[1px] text-[#5D7A94] drop-shadow-sm bg-white/40 inline-block px-6 py-3 rounded-2xl border border-white/50">
              היי, איך אפשר לעזור?
            </h1>
          </div>
        ) : (
          <div className="flex flex-col gap-6 w-full">
            {messages.map((msg, idx) => {
              const isRtl = isHebrew(msg.content);

              return (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} fade-in-slow w-full`}>
                  <div
                    dir={isRtl ? "rtl" : "ltr"}
                    className={`max-w-[85%] p-4 rounded-3xl text-[15px] font-light tracking-[0.5px] leading-relaxed shadow-sm backdrop-blur-md border border-white/40 ${isRtl ? 'text-right' : 'text-left'
                      } ${msg.role === 'user'
                        ? 'bg-[#D1E6F7]/30 text-[#1A252F] rounded-br-[8px]'
                        : 'bg-white/30 text-[#2C3E50] rounded-bl-[8px]'
                      }`}
                  >
                    {msg.role === 'ai' ? (
                      <div className="relative group/msg">
                        <div className="space-y-4 pb-5">
                          <ReactMarkdown
                            components={{
                              // eslint-disable-next-line @typescript-eslint/no-unused-vars
                              strong: ({ node: _node, ...props }: any) => <span className="font-medium text-[#1A252F]" {...props} />,
                              // eslint-disable-next-line @typescript-eslint/no-unused-vars
                              ul: ({ node: _node, ...props }: any) => <ul className={`list-disc ${isRtl ? 'pr-5' : 'pl-5'} space-y-2`} {...props} />,
                              // eslint-disable-next-line @typescript-eslint/no-unused-vars
                              ol: ({ node: _node, ...props }: any) => <ol className={`list-decimal ${isRtl ? 'pr-5' : 'pl-5'} space-y-2`} {...props} />,
                              // eslint-disable-next-line @typescript-eslint/no-unused-vars
                              li: ({ node: _node, ...props }: any) => <li className={isRtl ? 'pr-1' : 'pl-1'} {...props} />
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>

                        {/* Star Button */}
                        <div className={`absolute bottom-0 ${isRtl ? 'left-0' : 'right-0'} bg-white/50 backdrop-blur-sm rounded-full md:bg-transparent md:opacity-0 group-hover/msg:opacity-100 transition-opacity duration-300`}>
                          <button
                            onClick={() => toggleSaveMessage(msg.content)}
                            className={`p-1 rounded-full hover:bg-[#E5F1FC] transition-colors cursor-pointer ${savedMessages.includes(msg.content) ? 'text-[#5D7A94]' : 'text-[#7AA1C4] hover:text-[#5D7A94]'}`}
                            title={savedMessages.includes(msg.content) ? "Unsave message" : "Save message"}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill={savedMessages.includes(msg.content) ? "currentColor" : "none"} fillOpacity={savedMessages.includes(msg.content) ? 0.3 : 1} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex justify-start fade-in-slow w-full">
                <div className="max-w-[80%] px-4 py-3 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/40 rounded-bl-[8px] flex items-center justify-center min-w-[60px] min-h-[40px]">
                  {/* Organic Water Ripples Animation */}
                  <div className="relative flex items-center justify-center w-8 h-8">
                    <div className="absolute w-2.5 h-2.5 bg-[#5D7A94] rounded-full animate-pulse opacity-80" style={{ animationDuration: '2s' }}></div>
                    <div className="absolute w-3 h-3 border-[1.5px] border-[#7AA1C4] rounded-full animate-ping" style={{ animationDuration: '2s' }}></div>
                    <div className="absolute w-3 h-3 border-[1.5px] border-[#A7C7E7] rounded-full animate-ping opacity-75" style={{ animationDelay: '0.6s', animationDuration: '2s' }}></div>
                    <div className="absolute w-3 h-3 border border-white rounded-full animate-ping opacity-50" style={{ animationDelay: '1.2s', animationDuration: '2s' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} className="h-4 w-full flex-shrink-0" />
          </div>
        )}
      </div>

      <div className="w-full max-w-3xl relative mb-10 z-50">
        <form onSubmit={handleSend} className={`relative flex items-end bg-white/20 backdrop-blur-sm border border-white/40 rounded-[24px] shadow-sm focus-within:bg-white/30 focus-within:shadow-[0_4px_20px_rgba(255,255,255,0.05)] transition-all duration-500 p-1.5 ${isRtlInput ? 'flex-row-reverse' : 'flex-row'}`}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            dir={isRtlInput ? "rtl" : "ltr"}
            rows={1}
            placeholder=""
            className={`flex-grow bg-transparent outline-none py-2 px-3 text-[15px] font-medium tracking-[0.5px] text-[#2C3E50] placeholder:text-[#5D7A94]/70 transition-colors duration-300 disabled:opacity-50 resize-none overflow-y-auto block no-scrollbar ${isRtlInput ? 'text-right' : 'text-left'}`}
            style={{ minHeight: '38px', maxHeight: '160px' }}
          />
          <button type="submit" disabled={isLoading || !input.trim()} className="flex-shrink-0 mb-[2px] mx-1 text-[#7AA1C4] hover:text-[#5D7A94] focus:outline-none transition-all duration-300 cursor-pointer disabled:opacity-40 p-2 rounded-full hover:bg-white/40 active:scale-95 flex items-center justify-center">
            {/* Tight but natural feather icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z" />
              <path d="M16 8 2 22" />
              <path d="M17.5 15H9" />
            </svg>
          </button>
        </form>
      </div>
    </main>
  );
}