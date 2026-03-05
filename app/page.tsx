'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

// The detector: checks if a string contains any Hebrew characters
const isHebrew = (text: string) => /[\u0590-\u05FF]/.test(text);

export default function Home() {
  const [greeting, setGreeting] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: string, content: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Saved messages state
  const [savedMessages, setSavedMessages] = useState<string[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning.');
    else if (hour < 18) setGreeting('Good afternoon.');
    else setGreeting('Good evening.');

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
        body: JSON.stringify({ history: newChatHistory }),
      });

      const data = await response.json();

      if (data.text) {
        setMessages(prev => [...prev, { role: 'ai', content: data.text }]);
      } else if (data.error) {
        setMessages(prev => [...prev, { role: 'ai', content: `[System Error: ${data.error}]` }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', content: "[System: Received an empty response from the brain.]" }]);
      }
    } catch (error) {
      console.error("Connection error:", error);
      setMessages(prev => [...prev, { role: 'ai', content: "[System: Front-end connection failed.]" }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen text-[#2C3E50] flex flex-col items-center p-6 sm:p-12 font-sans selection:bg-[#B3D4F0] selection:text-[#1A252F] relative overflow-hidden">

      {/* Saved Messages Sidebar Header/Trigger */}
      <div className="absolute top-6 right-6 sm:top-8 sm:right-8 z-20">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 backdrop-blur-sm border border-[#A7C7E7] text-[#5D7A94] hover:bg-white hover:text-[#2C3E50] hover:border-[#5D7A94] transition-all duration-300 shadow-sm cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={savedMessages.length > 0 ? "#FFD700" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={savedMessages.length > 0 ? "text-[#FFD700]" : ""}>
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

      <div className="w-full max-w-3xl flex-grow flex flex-col justify-end pb-8 pt-16 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="fade-in-slow text-center mb-12">
            <h1 className="text-xl font-light tracking-[1px] text-[#5D7A94]">
              {greeting} How can I help?
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
                    className={`max-w-[85%] p-4 rounded-2xl text-[15px] font-light tracking-[0.5px] leading-relaxed shadow-sm ${isRtl ? 'text-right' : 'text-left'
                      } ${msg.role === 'user'
                        ? 'bg-[#D1E6F7] text-[#1A252F] rounded-br-none'
                        : 'bg-white/80 backdrop-blur-sm text-[#2C3E50] rounded-bl-none'
                      }`}
                  >
                    {msg.role === 'ai' ? (
                      <div className="relative group/msg">
                        <div className="space-y-4 pb-5">
                          <ReactMarkdown
                            components={{
                              // eslint-disable-next-line @typescript-eslint/no-unused-vars
                              strong: ({ node: _node, ...props }) => <span className="font-medium text-[#1A252F]" {...props} />,
                              // eslint-disable-next-line @typescript-eslint/no-unused-vars
                              ul: ({ node: _node, ...props }) => <ul className={`list-disc ${isRtl ? 'pr-5' : 'pl-5'} space-y-2`} {...props} />,
                              // eslint-disable-next-line @typescript-eslint/no-unused-vars
                              ol: ({ node: _node, ...props }) => <ol className={`list-decimal ${isRtl ? 'pr-5' : 'pl-5'} space-y-2`} {...props} />,
                              // eslint-disable-next-line @typescript-eslint/no-unused-vars
                              li: ({ node: _node, ...props }) => <li className={isRtl ? 'pr-1' : 'pl-1'} {...props} />
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>

                        {/* Star Button */}
                        <div className={`absolute bottom-0 ${isRtl ? 'left-0' : 'right-0'} bg-white/50 backdrop-blur-sm rounded-full md:bg-transparent md:opacity-0 group-hover/msg:opacity-100 transition-opacity duration-300`}>
                          <button
                            onClick={() => toggleSaveMessage(msg.content)}
                            className={`p-1 rounded-full hover:bg-[#E5F1FC] transition-colors cursor-pointer ${savedMessages.includes(msg.content) ? 'text-[#FFD700]' : 'text-[#7AA1C4] hover:text-[#5D7A94]'}`}
                            title={savedMessages.includes(msg.content) ? "Unsave message" : "Save message"}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill={savedMessages.includes(msg.content) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
                <div className="max-w-[80%] p-4 rounded-2xl bg-white/50 backdrop-blur-sm rounded-bl-none flex items-center justify-center">
                  <svg className="w-5 h-5 animate-spin text-[#7AA1C4]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                  </svg>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="w-full max-w-3xl relative mb-10">
        <form onSubmit={handleSend}>
          <input
            type="text"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            dir={isHebrew(input) ? "rtl" : "ltr"}
            className={`w-full bg-transparent border-b border-[#A7C7E7] focus:border-[#5D7A94] outline-none py-3 text-[15px] font-light tracking-[1px] transition-colors duration-500 placeholder-transparent disabled:opacity-50 ${isHebrew(input) ? 'text-right' : 'text-left'}`}
          />
          <button type="submit" disabled={isLoading} className={`absolute ${isHebrew(input) ? 'left-2' : 'right-2'} bottom-3 text-[#7AA1C4] hover:text-[#5D7A94] transition-colors duration-300 cursor-pointer disabled:opacity-50`}>
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