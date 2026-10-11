"use client";

import { useEffect, useRef, useState, type FormEvent, type MutableRefObject } from "react";
import { getCircle, leaveCircle, sendSignal } from "@/lib/api";
import { identityLabel } from "@/lib/identity";
import { ICE_CONFIG } from "@/lib/webrtc";
import type { CircleMember, CircleSummary, IdentityProfile, SignalMsg } from "@/lib/types";

type RoomMessage = { id: string; fromId: string; name: string; text: string };
type SignalHandler = (signal: SignalMsg) => void;

function AlienAvatar({ tone }: { tone: IdentityProfile["avatarTone"] }) {
  return (
    <svg className={`circle-alien tone-${tone}`} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 3.5c10.2 0 17.2 7.6 16 18.2C38.6 34 29 43.4 24 45c-5-1.6-14.6-11-16-23.3C6.8 11.1 13.8 3.5 24 3.5Z" />
      <path d="M11.8 19.2c4.5-.8 8.1.2 10.2 3.1-2.7 3-6.1 3.8-9.8 2.1-1.2-1.8-1.3-3.5-.4-5.2Z" />
      <path d="M36.2 19.2c-4.5-.8-8.1.2-10.2 3.1 2.7 3 6.1 3.8 9.8 2.1 1.2-1.8 1.3-3.5.4-5.2Z" />
      <path d="M20.5 34.2c2.3 1.2 4.7 1.2 7 0" />
    </svg>
  );
}

function VideoTile({
  id,
  name,
  tone,
  stream,
  local = false,
  cameraOn = true,
}: {
  id: string;
  name: string;
  tone: IdentityProfile["avatarTone"];
  stream: MediaStream | null;
  local?: boolean;
  cameraOn?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <article className={`circle-video-tile ${local ? "self" : ""}`} key={id}>
      {stream && cameraOn ? (
        <video ref={videoRef} autoPlay playsInline muted={local} />
      ) : (
        <div className="circle-video-placeholder"><AlienAvatar tone={tone} /></div>
      )}
      <span className="circle-video-name">{name}{local ? " · YOU" : ""}</span>
      {local && !cameraOn && <span className="circle-camera-off">Camera off</span>}
    </article>
  );
}

export default function CircleCall({
  room,
  sessionId,
  profile,
  localStream,
  onExit,
  signalRef,
}: {
  room: CircleSummary;
  sessionId: string;
  profile: IdentityProfile;
  localStream: MediaStream;
  onExit: () => void;
  signalRef: MutableRefObject<SignalHandler | null>;
}) {
  const [members, setMembers] = useState<CircleMember[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [roomError, setRoomError] = useState<string | null>(null);

  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const dataChannelsRef = useRef(new Map<string, RTCDataChannel>());
  const pendingIceRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const pendingSignalsRef = useRef<SignalMsg[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  function sendRoomSignal(peerId: string, type: "circle-offer" | "circle-answer" | "circle-ice", data: unknown) {
    void sendSignal(sessionId, peerId, type, JSON.stringify({ circleId: room.circleId, ...data as object }));
  }

  function wireDataChannel(peerId: string, channel: RTCDataChannel) {
    dataChannelsRef.current.set(peerId, channel);
    channel.onclose = () => dataChannelsRef.current.delete(peerId);
    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as RoomMessage;
        if (data.id && typeof data.text === "string") {
          setMessages((current) => {
            if (current.some((message) => message.id === data.id)) return current;
            // Re-broadcast (gossip) to all other open channels so all circle members receive it
            for (const [targetId, targetChannel] of dataChannelsRef.current.entries()) {
              if (targetId !== peerId && targetChannel.readyState === "open") {
                try {
                  targetChannel.send(event.data as string);
                } catch {
                  // ignore
                }
              }
            }
            return [...current, data];
          });
        }
      } catch {
        // Ignore malformed peer data.
      }
    };
  }

  function flushIce(peerId: string, peer: RTCPeerConnection) {
    const candidates = pendingIceRef.current.get(peerId) ?? [];
    pendingIceRef.current.delete(peerId);
    for (const candidate of candidates) {
      void peer.addIceCandidate(candidate).catch(() => undefined);
    }
  }

  async function handleRoomSignal(signal: SignalMsg) {
    let data: { circleId?: string; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    try {
      data = JSON.parse(signal.payload ?? "{}");
    } catch {
      return;
    }
    if (data.circleId !== room.circleId) return;
    const peer = peersRef.current.get(signal.fromId);
    if (!peer) {
      pendingSignalsRef.current.push(signal);
      return;
    }

    if (signal.type === "circle-ice") {
      if (!data.candidate) return;
      if (!peer.remoteDescription) {
        const candidates = pendingIceRef.current.get(signal.fromId) ?? [];
        candidates.push(data.candidate);
        pendingIceRef.current.set(signal.fromId, candidates);
      } else {
        await peer.addIceCandidate(data.candidate).catch(() => undefined);
      }
      return;
    }

    if (signal.type === "circle-offer" && data.description) {
      await peer.setRemoteDescription(data.description);
      flushIce(signal.fromId, peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      sendRoomSignal(signal.fromId, "circle-answer", { description: peer.localDescription });
    } else if (signal.type === "circle-answer" && data.description) {
      await peer.setRemoteDescription(data.description);
      flushIce(signal.fromId, peer);
    }
  }

  useEffect(() => {
    signalRef.current = (signal) => {
      if (signal.type === "circle-offer" || signal.type === "circle-answer" || signal.type === "circle-ice") {
        void handleRoomSignal(signal).catch(() => undefined);
      }
    };
    return () => {
      signalRef.current = null;
    };
  }, [room.circleId, sessionId, signalRef]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const result = await getCircle(room.circleId, sessionId);
        if (active) {
          setMembers(result.members);
          setRoomError(null);
        }
      } catch {
        if (active) setRoomError("This circle has ended.");
      }
      if (active) timer = setTimeout(refresh, 2000);
    };
    void refresh();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [room.circleId]);

  useEffect(() => {
    const liveIds = new Set(members.filter((member) => member.id !== sessionId).map((member) => member.id));

    for (const [peerId, peer] of peersRef.current) {
      if (!liveIds.has(peerId)) {
        peer.close();
        peersRef.current.delete(peerId);
        dataChannelsRef.current.delete(peerId);
        setRemoteStreams((current) => {
          const next = { ...current };
          delete next[peerId];
          return next;
        });
      }
    }

    for (const member of members) {
      if (member.id === sessionId || peersRef.current.has(member.id)) continue;
      const peer = new RTCPeerConnection(ICE_CONFIG);
      peersRef.current.set(member.id, peer);
      for (const track of localStreamRef.current?.getTracks() ?? []) {
        peer.addTrack(track, localStreamRef.current!);
      }
      peer.onicecandidate = ({ candidate }) => {
        if (candidate) sendRoomSignal(member.id, "circle-ice", { candidate });
      };
      peer.ontrack = ({ streams: remote }) => {
        const stream = remote[0];
        if (stream) setRemoteStreams((current) => ({ ...current, [member.id]: stream }));
      };
      peer.ondatachannel = (event) => wireDataChannel(member.id, event.channel);

      if (sessionId.localeCompare(member.id) < 0) {
        wireDataChannel(member.id, peer.createDataChannel("circle-chat"));
        void peer.createOffer()
          .then((offer) => peer.setLocalDescription(offer))
          .then(() => sendRoomSignal(member.id, "circle-offer", { description: peer.localDescription }))
          .catch(() => setRoomError("Could not connect to a circle member."));
      }
    }

    const queued = pendingSignalsRef.current;
    pendingSignalsRef.current = [];
    for (const signal of queued) void handleRoomSignal(signal).catch(() => undefined);
  }, [members, sessionId, room.circleId]);

  useEffect(() => {
    return () => {
      peersRef.current.forEach((peer) => peer.close());
      peersRef.current.clear();
      dataChannelsRef.current.clear();
      pendingIceRef.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      void leaveCircle(sessionId, room.circleId);
    };
  }, [room.circleId, sessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const message: RoomMessage = {
      id: crypto.randomUUID(),
      fromId: sessionId,
      name: identityLabel(profile, sessionId),
      text,
    };
    setMessages((current) => [...current, message]);
    for (const channel of dataChannelsRef.current.values()) {
      if (channel.readyState === "open") channel.send(JSON.stringify(message));
    }
    setDraft("");
  }

  function toggleTracks(kind: "audio" | "video") {
    const tracks = kind === "audio" ? localStreamRef.current?.getAudioTracks() : localStreamRef.current?.getVideoTracks();
    if (!tracks?.length) return;
    const enabled = !tracks[0].enabled;
    tracks.forEach((track) => { track.enabled = enabled; });
    if (kind === "audio") setMuted(!enabled);
    else setCameraOn(enabled);
  }

  const selfName = identityLabel(profile, sessionId);
  const onlineOthers = members.filter((member) => member.id !== sessionId);

  return (
    <main className="circle-call-screen">
      <header className="circle-call-header">
        <div><span className="circle-live-dot" /><span>LIVE CIRCLE</span><strong>#{room.keyword}</strong><small>{members.length}/6</small></div>
        <button onClick={onExit}>Leave circle</button>
      </header>
      {roomError && <div className="circle-call-error" role="status">{roomError}</div>}
      <div className={`circle-call-layout ${chatOpen ? "chat-open" : "chat-closed"}`}>
        <section className="circle-video-grid" aria-label="Circle participants">
          <VideoTile id={sessionId} name={selfName} tone={profile.avatarTone} stream={localStreamRef.current} local cameraOn={cameraOn} />
          {onlineOthers.map((member) => (
            <VideoTile
              key={member.id}
              id={member.id}
              name={identityLabel({ identityMode: member.identityMode, avatarTone: member.avatarTone, nickname: member.nickname ?? "" }, member.id)}
              tone={member.avatarTone}
              stream={remoteStreams[member.id] ?? null}
            />
          ))}
          {onlineOthers.length === 0 && <div className="circle-awaiting-peer">Waiting for people to join this circle…</div>}
        </section>
        <aside className={`circle-chat-panel ${chatOpen ? "open" : ""}`}>
          <header><strong>Circle chat</strong><small>Peer-to-peer · never stored</small></header>
          <div className="circle-chat-messages">
            {messages.length === 0 && <p className="circle-chat-empty">Say hello to the room.</p>}
            {messages.map((message) => <p className={`circle-chat-message ${message.fromId === sessionId ? "mine" : ""}`} key={message.id}><small>{message.name}</small><span>{message.text}</span></p>)}
            <div ref={endRef} />
          </div>
          <form onSubmit={sendMessage}>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Message the circle…" aria-label="Message the circle" />
            <button type="submit" disabled={!draft.trim()} aria-label="Send circle message">↑</button>
          </form>
        </aside>
      </div>
      <footer className="circle-call-controls">
        <button className={muted ? "off" : ""} onClick={() => toggleTracks("audio")} aria-pressed={!muted}>{muted ? "Unmute" : "Mute"}</button>
        <button className={!cameraOn ? "off" : ""} onClick={() => toggleTracks("video")} aria-pressed={cameraOn}>{cameraOn ? "Camera off" : "Camera on"}</button>
        <button className="circle-chat-toggle" onClick={() => setChatOpen((open) => !open)} aria-expanded={chatOpen}>{chatOpen ? "Hide chat" : `Chat (${messages.length})`}</button>
        <button className="circle-leave-call" onClick={onExit}>Leave call</button>
      </footer>
    </main>
  );
}