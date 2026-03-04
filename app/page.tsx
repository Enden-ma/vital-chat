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

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning.');
    else if (hour < 18) setGreeting('Good afternoon.');
    else setGreeting('Good evening.');
  }, []);

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
    <main className="min-h-screen text-[#2C3E50] flex flex-col items-center p-6 sm:p-12 font-sans selection:bg-[#B3D4F0] selection:text-[#1A252F]">
      <div className="w-full max-w-3xl flex-grow flex flex-col justify-end pb-8 overflow-y-auto">
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
                      <div className="space-y-4">
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
            {/* Minimalist Sprout / Leaf Icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 20A7 7 0 0 1 4 13V4h9a7 7 0 0 1 7 7v9h-9Z" />
              <path d="M11 20V13" />
            </svg>
          </button>
        </form>
      </div>
    </main>
  );
}