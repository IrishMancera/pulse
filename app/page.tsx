"use client";

import { useEffect, useRef, useState } from "react";
import EntryGate from "./components/EntryGate";
import WorldMap from "./components/WorldMap";
import ConnectionPrompt from "./components/ConnectionPrompt";
import ChatPanel, { type ChatMessage } from "./components/ChatPanel";
import VideoPanel from "./components/VideoPanel";
import { join, leave, poll, sendSignal } from "@/lib/api";
import { PeerSession, type DescType, type PeerControl } from "@/lib/webrtc";
import { POLL_INTERVAL_MS } from "@/lib/presence";
import { type PeerDot, type SignalMsg } from "@/lib/types";

type Conn =
  | { kind: "idle" }
  | { kind: "requesting"; peerId: string }
  | { kind: "incoming"; peerId: string }
  | { kind: "connecting"; peerId: string }
  | { kind: "connected"; peerId: string };

type VideoState = "none" | "requesting" | "incoming" | "active";
type Signal = "open" | "curious" | "quiet";
type Tone = "green" | "violet" | "cyan" | "rose" | "amber";

const REQUEST_TIMEOUT_MS = 30_000;

const TONE_COLORS: Record<Tone, string> = {
  green:  "#22c55e",
  violet: "#a855f7",
  cyan:   "#06b6d4",
  rose:   "#f43f5e",
  amber:  "#f59e0b",
};

const SIGNAL_EMOJI: Record<Signal, string> = {
  open: "💬",
  curious: "✨",
  quiet: "🌙",
};

export default function Home() {
  const [phase, setPhase] = useState<"gate" | "live">("gate");
  const [sessionId] = useState(() => crypto.randomUUID());
  const [peers, setPeers] = useState<PeerDot[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mySignal, setMySignal] = useState<Signal>("curious");
  const [myTone, setMyTone] = useState<Tone>("violet");
  const [myNickname, setMyNickname] = useState<string>("");
  const [myCityInfo, setMyCityInfo] = useState<{ city: string; country: string } | null>(null);
  const [showPeople, setShowPeople] = useState(false);

  const [conn, _setConn] = useState<Conn>({ kind: "idle" });
  const connRef = useRef<Conn>(conn);
  const setConn = (c: Conn) => {
    connRef.current = c;
    _setConn(c);
  };

  const [video, _setVideo] = useState<VideoState>("none");
  const videoRef = useRef<VideoState>(video);
  const setVideo = (v: VideoState) => {
    videoRef.current = v;
    _setVideo(v);
  };

  const peerRef = useRef<PeerSession | null>(null);
  const msgId = useRef(0);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showNotice(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 3500);
  }

  function addMessage(mine: boolean, text: string) {
    setMessages((prev) => [...prev, { id: msgId.current++, mine, text }]);
  }

  function teardown(message?: string) {
    if (requestTimer.current) clearTimeout(requestTimer.current);
    peerRef.current?.close();
    peerRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setVideo("none");
    setMessages([]);
    setConn({ kind: "idle" });
    if (message) showNotice(message);
  }

  function startPeer(peerId: string, initiator: boolean) {
    const ps = new PeerSession(initiator, {
      onSignal: (type: DescType, payload: string) => {
        void sendSignal(sessionId, peerId, type, payload);
      },
      onChat: (text) => addMessage(false, text),
      onControl: (ctrl) => handleControl(ctrl),
      onRemoteStream: (stream) => setRemoteStream(stream),
      onConnectionState: (state) => {
        if (state === "failed") {
          teardown("Connection failed (network).");
        }
      },
      onChannelOpen: () => {
        setConn({ kind: "connected", peerId });
      },
    });
    peerRef.current = ps;
  }

  function handleControl(ctrl: PeerControl) {
    const ps = peerRef.current;
    switch (ctrl) {
      case "video-request":
        if (videoRef.current === "none") setVideo("incoming");
        break;
      case "video-accept":
        if (videoRef.current === "requesting" && ps) {
          ps.startVideo()
            .then((stream) => {
              setLocalStream(stream);
              setVideo("active");
            })
            .catch(() => {
              setVideo("none");
              ps.sendControl("video-end");
              showNotice("Camera unavailable.");
            });
        }
        break;
      case "video-decline":
        if (videoRef.current === "requesting") {
          setVideo("none");
          showNotice("Video declined.");
        }
        break;
      case "video-end":
        ps?.stopVideo();
        setLocalStream(null);
        setRemoteStream(null);
        setVideo("none");
        break;
    }
  }

  function requestConnection(peerId: string) {
    if (connRef.current.kind !== "idle") return;
    setConn({ kind: "requesting", peerId });
    void sendSignal(sessionId, peerId, "request");
    requestTimer.current = setTimeout(() => {
      if (
        connRef.current.kind === "requesting" &&
        connRef.current.peerId === peerId
      ) {
        void sendSignal(sessionId, peerId, "end");
        teardown("No answer.");
      }
    }, REQUEST_TIMEOUT_MS);
  }

  function cancelRequest() {
    if (connRef.current.kind === "requesting") {
      void sendSignal(sessionId, connRef.current.peerId, "end");
    }
    teardown();
  }

  function acceptIncoming() {
    if (connRef.current.kind !== "incoming") return;
    const peerId = connRef.current.peerId;
    startPeer(peerId, false);
    void sendSignal(sessionId, peerId, "accept");
    setConn({ kind: "connecting", peerId });
  }

  function declineIncoming() {
    if (connRef.current.kind !== "incoming") return;
    void sendSignal(sessionId, connRef.current.peerId, "decline");
    setConn({ kind: "idle" });
  }

  function endConnection() {
    const c = connRef.current;
    if (c.kind === "connecting" || c.kind === "connected") {
      void sendSignal(sessionId, c.peerId, "end");
    }
    teardown();
  }

  function startVideoRequest() {
    if (videoRef.current !== "none" || !peerRef.current) return;
    setVideo("requesting");
    peerRef.current.sendControl("video-request");
  }

  function acceptVideo() {
    const ps = peerRef.current;
    if (!ps) return;
    ps.startVideo()
      .then((stream) => {
        setLocalStream(stream);
        ps.sendControl("video-accept");
        setVideo("active");
      })
      .catch(() => {
        ps.sendControl("video-decline");
        setVideo("none");
        showNotice("Camera unavailable.");
      });
  }

  function declineVideo() {
    peerRef.current?.sendControl("video-decline");
    setVideo("none");
  }

  function endVideo() {
    const ps = peerRef.current;
    ps?.stopVideo();
    ps?.sendControl("video-end");
    setLocalStream(null);
    setRemoteStream(null);
    setVideo("none");
  }

  function processSignal(sig: SignalMsg) {
    switch (sig.type) {
      case "request": {
        if (connRef.current.kind === "idle") {
          setConn({ kind: "incoming", peerId: sig.fromId });
        } else {
          void sendSignal(sessionId, sig.fromId, "decline");
        }
        break;
      }
      case "accept": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          startPeer(sig.fromId, true);
          setConn({ kind: "connecting", peerId: sig.fromId });
        }
        break;
      }
      case "decline": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          teardown("Request declined.");
        }
        break;
      }
      case "offer":
      case "answer":
      case "ice": {
        const c = connRef.current;
        const peerId =
          c.kind === "connecting" || c.kind === "connected" ? c.peerId : null;
        if (peerRef.current && peerId === sig.fromId) {
          void peerRef.current.handleSignal(
            sig.type as DescType,
            sig.payload ?? "",
          );
        }
        break;
      }
      case "end": {
        const c = connRef.current;
        if (
          (c.kind === "incoming" ||
            c.kind === "connecting" ||
            c.kind === "connected") &&
          c.peerId === sig.fromId
        ) {
          if (c.kind === "incoming") setConn({ kind: "idle" });
          else teardown("Stranger disconnected.");
        }
        break;
      }
    }
  }

  const processSignalRef = useRef(processSignal);
  useEffect(() => {
    processSignalRef.current = processSignal;
  });

  // Poll loop — heartbeat + peer list + signals
  useEffect(() => {
    if (phase !== "live" || !sessionId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const data = await poll(sessionId, {
          lat: myLocation?.lat,
          lng: myLocation?.lng,
          signal: mySignal,
          tone: myTone,
          nickname: myNickname,
        });
        if (!active) return;
        setPeers(data.peers);
        for (const s of data.signals) processSignalRef.current(s);
      } catch {}
      if (active) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sessionId, mySignal, myTone, myNickname]);

  useEffect(() => {
    if (!sessionId || phase !== "live") return;
    const onLeave = () => leave(sessionId);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [sessionId, phase]);

  async function handleReady(lat: number, lng: number, signal: Signal, tone: Tone, nickname: string) {
    setMySignal(signal);
    setMyTone(tone);
    setMyNickname(nickname);
    setMyLocation({ lat, lng });
    const res = await join(sessionId, lat, lng, { signal, tone, nickname });
    if (res.me) {
      setMyCityInfo({ city: res.me.city, country: res.me.country });
    }
    setPhase("live");
  }

  if (phase === "gate") {
    return <EntryGate onReady={handleReady} />;
  }

  const inChat = conn.kind === "connecting" || conn.kind === "connected";
  const accentColor = TONE_COLORS[myTone];

  return (
    <main className="fixed inset-0 overflow-hidden">
      <WorldMap
        peers={peers}
        me={myLocation}
        onPeerClick={requestConnection}
        canConnect={conn.kind === "idle"}
      />

      {/* ── Top bar ── */}
      <div
        className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-3"
        style={{
          background: "linear-gradient(to bottom, rgba(5,5,8,0.88) 0%, transparent 100%)",
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}` }}
          />
          <span className="text-sm font-semibold text-white">Pulse</span>
          {myCityInfo && (
            <span className="text-xs text-zinc-500">
              · {myCityInfo.city}, {myCityInfo.country}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* My signal badge */}
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white"
            style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}55` }}
          >
            <span>{SIGNAL_EMOJI[mySignal]}</span>
            <span className="capitalize">{mySignal}</span>
          </div>

          {/* People nearby toggle */}
          <button
            onClick={() => setShowPeople((p) => !p)}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:text-white"
            style={{
              background: showPeople ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <span>👥</span>
            <span>{peers.length}</span>
          </button>
        </div>
      </div>

      {/* ── Notices ── */}
      {notice && (
        <div
          className="absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full px-4 py-2 text-sm text-zinc-100 shadow-lg"
          style={{
            background: "rgba(12, 11, 22, 0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(12px)",
            animation: "float-in 0.3s ease",
          }}
        >
          {notice}
        </div>
      )}

      {conn.kind === "requesting" && (
        <div
          className="absolute left-1/2 top-16 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2 text-sm text-zinc-100 shadow-lg"
          style={{
            background: "rgba(12, 11, 22, 0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(12px)",
          }}
        >
          <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: accentColor }} />
          <span>Connecting…</span>
          <button
            onClick={cancelRequest}
            className="rounded-full border border-zinc-700 px-3 py-1 text-xs hover:border-zinc-500"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── People nearby panel ── */}
      {showPeople && !inChat && (
        <PeoplePanel
          peers={peers}
          onConnect={(id) => {
            setShowPeople(false);
            requestConnection(id);
          }}
          canConnect={conn.kind === "idle"}
          onClose={() => setShowPeople(false)}
          accentColor={accentColor}
        />
      )}

      {/* ── Incoming connection ── */}
      {conn.kind === "incoming" && (
        <ConnectionPrompt
          title="A stranger wants to connect"
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
        />
      )}

      {/* ── Chat panel ── */}
      {inChat && (
        <ChatPanel
          messages={messages}
          connected={conn.kind === "connected"}
          videoBusy={video !== "none"}
          onSend={(text) => {
            peerRef.current?.sendChat(text);
            addMessage(true, text);
          }}
          onStartVideo={startVideoRequest}
          onEnd={endConnection}
          accentColor={accentColor}
        />
      )}

      {video === "requesting" && (
        <div
          className="absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full px-4 py-2 text-sm text-zinc-100 shadow-lg"
          style={{
            background: "rgba(12, 11, 22, 0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(12px)",
          }}
        >
          Waiting for stranger to accept video…
        </div>
      )}

      {video === "incoming" && (
        <ConnectionPrompt
          title="Start video call?"
          subtitle="The stranger wants to turn on video."
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptVideo}
          onDecline={declineVideo}
        />
      )}

      {video === "active" && (
        <VideoPanel
          localStream={localStream}
          remoteStream={remoteStream}
          onEnd={endVideo}
        />
      )}
    </main>
  );
}

// ── People nearby sidebar ──
function PeoplePanel({
  peers,
  onConnect,
  canConnect,
  onClose,
  accentColor,
}: {
  peers: PeerDot[];
  onConnect: (id: string) => void;
  canConnect: boolean;
  onClose: () => void;
  accentColor: string;
}) {
  const TONE_COLORS: Record<string, string> = {
    green:  "#22c55e",
    violet: "#a855f7",
    cyan:   "#06b6d4",
    rose:   "#f43f5e",
    amber:  "#f59e0b",
  };
  const SIGNAL_EMOJI: Record<string, string> = {
    open: "💬", curious: "✨", quiet: "🌙",
  };

  return (
    <div
      className="absolute inset-y-0 right-0 z-20 flex w-full max-w-xs flex-col"
      style={{
        background: "rgba(8, 7, 16, 0.90)",
        borderLeft: "1px solid rgba(255,255,255,0.07)",
        backdropFilter: "blur(20px)",
        animation: "slide-in-right 0.25s ease",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="text-sm font-semibold text-white">
          People nearby{" "}
          <span className="ml-1 text-xs font-normal text-zinc-500">({peers.length})</span>
        </span>
        <button
          onClick={onClose}
          className="text-zinc-600 transition hover:text-zinc-300 text-lg leading-none"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {peers.length === 0 && (
          <p className="mt-8 text-center text-sm text-zinc-600">
            No one else is online yet.
            <br />
            <span className="text-xs">Share the link to invite others.</span>
          </p>
        )}
        {peers.map((peer) => {
          const color = peer.tone ? (TONE_COLORS[peer.tone] ?? accentColor) : accentColor;
          const emoji = SIGNAL_EMOJI[peer.signal ?? "curious"] ?? "✨";
          return (
            <div
              key={peer.id}
              className="mb-2 rounded-xl p-3 transition"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-center gap-2.5">
                {/* Avatar dot */}
                <div
                  className="h-8 w-8 flex-shrink-0 rounded-full"
                  style={{
                    background: color,
                    boxShadow: `0 0 10px ${color}66`,
                    opacity: peer.busy ? 0.4 : 1,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-white truncate">
                      {peer.nickname || "Anonymous"}
                    </span>
                    {peer.busy && (
                      <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
                        busy
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                    <span>{emoji}</span>
                    <span className="capitalize">{peer.signal ?? "curious"}</span>
                    {peer.city && <span>· {peer.city}</span>}
                  </div>
                  {peer.distance && (
                    <div className="text-xs text-zinc-600 mt-0.5">{peer.distance}</div>
                  )}
                </div>

                {!peer.busy && canConnect && (
                  <button
                    onClick={() => onConnect(peer.id)}
                    className="flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-white transition hover:brightness-110"
                    style={{ background: color }}
                  >
                    Connect
                  </button>
                )}
              </div>

              {peer.prompt && (
                <p
                  className="mt-2 rounded-lg p-2 text-xs text-zinc-400 italic"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                >
                  "{peer.prompt}"
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
