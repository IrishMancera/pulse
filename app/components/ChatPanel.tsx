"use client";

import { useEffect, useRef, useState } from "react";

export interface ChatMessage {
  id: number;
  mine: boolean;
  text: string;
}

export default function ChatPanel({
  messages,
  connected,
  videoBusy,
  onSend,
  onStartVideo,
  onEnd,
  accentColor = "#a855f7",
}: {
  messages: ChatMessage[];
  connected: boolean;
  videoBusy: boolean;
  onSend: (text: string) => void;
  onStartVideo: () => void;
  onEnd: () => void;
  accentColor?: string;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div
      className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col text-zinc-100 shadow-2xl"
      style={{
        background: "rgba(8, 7, 16, 0.92)",
        borderLeft: "1px solid rgba(255,255,255,0.07)",
        backdropFilter: "blur(20px)",
        animation: "slide-in-right 0.25s ease",
      }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-3.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div>
          <p className="text-sm font-semibold text-white">Stranger</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
            {connected ? (
              <>
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: accentColor, boxShadow: `0 0 5px ${accentColor}` }}
                />
                Connected
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />
                Connecting…
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onStartVideo}
            disabled={!connected || videoBusy}
            className="rounded-full border border-zinc-700/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-30"
          >
            📹 Video
          </button>
          <button
            onClick={onEnd}
            className="rounded-full bg-red-500/80 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500"
          >
            End
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="mt-10 text-center text-sm text-zinc-600">
            Say hello. Messages are peer-to-peer and never stored.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.mine ? "justify-end" : "justify-start"}`}
          >
            <span
              className="max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-snug"
              style={
                m.mine
                  ? { background: accentColor, color: "#fff" }
                  : { background: "rgba(255,255,255,0.08)", color: "#e8e8f0" }
              }
            >
              {m.text}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={submit}
        className="flex gap-2 p-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connected ? "Type a message…" : "Connecting…"}
          disabled={!connected}
          className="flex-1 rounded-full bg-zinc-900/80 px-4 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:ring-1 disabled:opacity-50 transition"
          style={{ "--tw-ring-color": accentColor } as React.CSSProperties}
        />
        <button
          type="submit"
          disabled={!connected || !draft.trim()}
          className="rounded-full px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-30"
          style={{ background: accentColor }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
