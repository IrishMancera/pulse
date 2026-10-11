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
}: {
  messages: ChatMessage[];
  connected: boolean;
  videoBusy: boolean;
  onSend: (text: string) => void;
  onStartVideo: () => void;
  onEnd: () => void;
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
    <div className="chat-workspace-panel">
      <header className="chat-workspace-header">
        <div className="chat-peer-identity">
          <span className="chat-peer-avatar" aria-hidden="true"><i /></span>
          <span>
          <p className="chat-peer-name">Stranger</p>
          <p className="chat-peer-status">
            {connected ? "Connected" : "Connecting…"}
          </p>
          </span>
        </div>
        <div className="chat-workspace-actions">
          <button
            onClick={onStartVideo}
            disabled={!connected || videoBusy}
            className="chat-video-button"
          >
            Video
          </button>
          <button
            onClick={onEnd}
            className="chat-end-button"
          >
            End
          </button>
        </div>
      </header>

      <div className="chat-message-list">
        {messages.length === 0 && (
          <p className="chat-empty-state">
            Say hello. Messages are peer-to-peer and never stored.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-message-row ${m.mine ? "mine" : "theirs"}`}>
            <span
              className="chat-message-bubble"
            >
              {m.text}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="chat-composer">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connected ? "Type a message…" : "Connecting…"}
          disabled={!connected}
          className="chat-composer-input"
        />
        <button
          type="submit"
          disabled={!connected || !draft.trim()}
          className="chat-composer-send"
        >
          Send
        </button>
      </form>
    </div>
  );
}
