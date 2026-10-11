"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage } from "./ChatPanel";

export default function VideoPanel({
  localStream,
  remoteStream,
  messages,
  onSend,
  onBack,
  onEndCall,
  onPreviousPeer,
  onNextPeer,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onBack: () => void;
  onEndCall: () => void;
  onPreviousPeer: () => void;
  onNextPeer: () => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (localRef.current && localRef.current.srcObject !== localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteRef.current.srcObject !== remoteStream) {
      remoteRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatOpen]);

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  return (
    <main className={`video-call-screen ${chatOpen ? "chat-open" : ""}`}>
      <video ref={remoteRef} autoPlay playsInline className="video-remote" />
      <div className="video-call-topbar">
        <button className="video-back-button" onClick={onBack} aria-label="Back to chat">
          <span aria-hidden="true">←</span> Back to chat
        </button>
        <div className="video-call-nav">
          <button onClick={onPreviousPeer} aria-label="Call previous stranger">‹ Previous</button>
          <span className="video-call-status"><i /> LIVE CALL</span>
          <button onClick={onNextPeer} aria-label="Call next stranger">Next ›</button>
        </div>
        <button className="video-chat-toggle" onClick={() => setChatOpen((open) => !open)} aria-expanded={chatOpen}>
          {chatOpen ? "Hide chat" : `Chat${messages.length ? ` (${messages.length})` : ""}`}
        </button>
        <button className="video-end-button" onClick={onEndCall}>
          <span aria-hidden="true">×</span> End call
        </button>
      </div>
      {!remoteStream && (
        <div className="video-waiting-state">
          <span className="video-waiting-pulse" />
          <p>Waiting for their video…</p>
        </div>
      )}
      <div className="video-call-footer">
        <span>Peer-to-peer video</span>
        <span>Your camera is visible to this person only</span>
      </div>
      <div className="video-local-frame">
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className="video-local"
        />
        {!localStream && <span>Camera off</span>}
      </div>
      <aside className={`video-chat-panel ${chatOpen ? "open" : ""}`} aria-label="Chat during video call">
        <header><strong>Conversation</strong><span>Peer-to-peer</span></header>
        <div className="video-chat-messages">
          {messages.length === 0 && <p className="video-chat-empty">Say hello while you’re on the call.</p>}
          {messages.map((message) => (
            <div className={`video-chat-row ${message.mine ? "mine" : "theirs"}`} key={message.id}>
              <span>{message.text}</span>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form className="video-chat-composer" onSubmit={submitMessage}>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Message…" aria-label="Message during call" />
          <button type="submit" disabled={!draft.trim()} aria-label="Send message">↑</button>
        </form>
      </aside>
    </main>
  );
}
