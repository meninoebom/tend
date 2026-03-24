"use client";

import { useEffect, useRef, useState } from "react";
import { sendChatMessage, getMe, createCheckout } from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { ChatMessage, User } from "@/lib/api-types";
import { cn } from "@/lib/utils";

const SUGGESTED_PROMPTS = [
  "What should I focus on today?",
  "Am I overloading myself?",
  "What have I been putting off?",
  "How's my balance across domains?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getMe().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSend(text?: string) {
    const message = (text ?? input).trim();
    if (!message || loading) return;

    setInput("");
    setError(null);
    setLoading(true);

    const userMsg: ChatMessage = { role: "user", content: message };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    try {
      const response = await sendChatMessage(message, messages);
      const assistantMsg: ChatMessage = { role: "assistant", content: response.reply };
      setMessages([...updatedMessages, assistantMsg]);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  // Pro gate
  if (user && !user.is_pro) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-medium text-text-primary mb-2">AI Companion</h1>
          <p className="text-sm text-text-muted mb-6">
            Chat with an AI that knows your tasks, patterns, and priorities.
            Available with Tend Pro.
          </p>
          <button
            onClick={async () => {
              if (upgradeLoading) return;
              setUpgradeLoading(true);
              try {
                const { checkout_url } = await createCheckout();
                window.location.href = checkout_url;
              } catch {
                setUpgradeLoading(false);
              }
            }}
            disabled={upgradeLoading}
            className="px-4 py-2 rounded-lg bg-accent-blue text-white text-sm font-medium hover:bg-accent-blue/90 transition-colors disabled:opacity-50"
          >
            {upgradeLoading ? "Loading..." : "Upgrade to Pro"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-6 pt-7 pb-4 border-b border-border/30">
        <h1 className="text-lg font-medium text-text-primary">Chat</h1>
        <p className="text-xs text-text-muted mt-0.5">Ask about your tasks, patterns, and priorities</p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-sm text-text-muted">Try asking:</p>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  className="px-3 py-1.5 rounded-full text-xs text-text-secondary bg-bg-hover hover:bg-bg-hover/80 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[75%] rounded-xl px-4 py-2.5 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-accent-blue/15 text-text-primary"
                  : "bg-bg-card text-text-secondary",
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-bg-card rounded-xl px-4 py-2.5">
              <span className="text-sm text-text-muted animate-pulse">Thinking...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-border/30">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your tasks..."
            disabled={loading}
            className="flex-1 bg-bg-card rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:ring-1 focus:ring-accent-blue/30 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 rounded-lg bg-accent-blue text-white text-sm font-medium hover:bg-accent-blue/90 transition-colors disabled:opacity-30"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
