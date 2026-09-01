import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Send, 
  Bot, 
  User, 
  X, 
  Trash2, 
  ChevronRight,
  Shield,
  Lightbulb,
  Layers
} from 'lucide-react';
import { TacticalMetrics, TeamConfig, SportType } from '../types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface AICoachChatProps {
  isOpen: boolean;
  onClose: () => void;
  sport: SportType;
  teamA: TeamConfig;
  teamB: TeamConfig;
  metrics: TacticalMetrics;
  pitchControlA: number;
}

export const AICoachChat: React.FC<AICoachChatProps> = ({
  isOpen,
  onClose,
  sport,
  teamA,
  teamB,
  metrics,
  pitchControlA,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello Coach! I'm your AI Tactical Assistant powered by live computer vision telemetry. We are tracking **${teamA.name}** vs **${teamB.name}** in ${sport.toUpperCase()}.\n\nCurrently, ${teamA.shortName} holds **${pitchControlA}% spatial pitch control** with a **${metrics.detectedFormationA}** shape. How would you like to break down today's tactics?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const quickPrompts = [
    `How to exploit their ${metrics.detectedFormationB} shape?`,
    `Analyze our ${metrics.compactnessA.convexHullAreaSqM}m² defensive compactness`,
    `Evaluate our PPDA pressing intensity (${metrics.ppdaTeamA})`,
    `Design a 15-min drill for quick transitional play`,
  ];

  const handleSendMessage = async (userText: string) => {
    const textToSend = userText || input;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/gemini/coach-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          context: {
            sport,
            teamA: teamA.name,
            teamB: teamB.name,
            formationA: metrics.detectedFormationA,
            formationB: metrics.detectedFormationB,
            pitchControlA,
            compactnessA: metrics.compactnessA.convexHullAreaSqM,
            ppdaA: metrics.ppdaTeamA,
            xTA: metrics.expectedThreatTeamA,
          },
        }),
      });

      const data = await response.json();
      const botReply = data.reply || "I analyzed the tactical telemetry and have recommendations for your tactical shape.";

      const botMsg: Message = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: botReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      console.error('Error fetching AI coach chat:', err);
      const fallbackMsg: Message = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Tactical advice based on telemetry: To counter their shape, instruct your wide midfielders to isolate their fullbacks while maintaining a compact ${metrics.compactnessA.lineDepthMeters}m depth to prevent counter-attacks.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-slate-900/95 border-l border-slate-800 shadow-2xl backdrop-blur-xl flex flex-col">
      {/* Chat Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>AI Tactical Coach</span>
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/30">
                LIVE
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">UEFA Pro Tactical Assistant</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setMessages(messages.slice(0, 1))}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Clear Chat History"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role === 'assistant' && (
              <div className="h-7 w-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                <Bot className="h-4 w-4" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${
                m.role === 'user'
                  ? 'bg-emerald-600 text-white rounded-tr-none'
                  : 'bg-slate-950/90 text-slate-200 border border-slate-800 rounded-tl-none'
              }`}
            >
              <div className="whitespace-pre-line">{m.content}</div>
              <div
                className={`text-[9px] mt-1 text-right ${
                  m.role === 'user' ? 'text-emerald-200' : 'text-slate-500'
                }`}
              >
                {m.timestamp}
              </div>
            </div>

            {m.role === 'user' && (
              <div className="h-7 w-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0 mt-0.5">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 w-fit">
            <div className="flex space-x-1">
              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" />
              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
            <span className="text-[11px] text-slate-400">Synthesizing tactical counsel...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompt Chips */}
      <div className="px-4 py-2 border-t border-slate-800/60 bg-slate-950/50 space-y-1.5">
        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
          Quick Coaching Prompts:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {quickPrompts.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(p)}
              disabled={isLoading}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700/80 hover:border-cyan-500/50 transition-all text-left truncate max-w-full"
            >
              ⚡ {p}
            </button>
          ))}
        </div>
      </div>

      {/* Input Box */}
      <div className="p-3 border-t border-slate-800 bg-slate-950">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AI Coach about tactics, pressing, or drills..."
            disabled={isLoading}
            className="flex-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white shadow-md shadow-emerald-900/30 transition-all"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
