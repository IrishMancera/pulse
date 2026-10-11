"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import EntryGate from "./components/EntryGate";
import WorldMap from "./components/WorldMap";
import ConnectionPrompt from "./components/ConnectionPrompt";
import ChatPanel, { type ChatMessage } from "./components/ChatPanel";
import VideoPanel from "./components/VideoPanel";
import CircleLobby from "./components/CircleLobby";
import CircleCall from "./components/CircleCall";
import IdentityPanel from "./components/IdentityPanel";
import {
  enterCircle,
  join,
  leave,
  leaveCircle,
  listCircles,
  poll,
  sendSignal,
  updateProfile,
} from "@/lib/api";
import { PeerSession, type DescType, type PeerControl } from "@/lib/webrtc";
import { POLL_INTERVAL_MS } from "@/lib/presence";
import { identityLabel } from "@/lib/identity";
import {
  type CircleSummary,
  type IdentityProfile,
  type PeerDot,
  type SignalMsg,
} from "@/lib/types";

/* ===== GALAXY CANVAS — interactive star field ===== */
function GalaxyCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const STAR_COUNT = 180;
    const NEBULA_COUNT = 6;

    interface Star {
      x: number; y: number; r: number; baseR: number;
      speed: number; hue: number; sat: number; alpha: number;
      drift: number; phase: number;
    }
    interface Nebula {
      x: number; y: number; r: number; hue: number; alpha: number;
      speed: number; drift: number;
    }

    const stars: Star[] = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.5 + 0.3,
      baseR: Math.random() * 1.5 + 0.3,
      speed: Math.random() * 0.15 + 0.02,
      hue: [160, 200, 270, 320, 100][Math.floor(Math.random() * 5)],
      sat: Math.random() * 40 + 60,
      alpha: Math.random() * 0.6 + 0.2,
      drift: (Math.random() - 0.5) * 0.3,
      phase: Math.random() * Math.PI * 2,
    }));

    const nebulae: Nebula[] = Array.from({ length: NEBULA_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 150 + 80,
      hue: [270, 200, 160, 320][Math.floor(Math.random() * 4)],
      alpha: Math.random() * 0.025 + 0.01,
      speed: (Math.random() - 0.5) * 0.08,
      drift: (Math.random() - 0.5) * 0.05,
    }));

    function onResize() {
      w = canvas!.width = window.innerWidth;
      h = canvas!.height = window.innerHeight;
    }
    function onMouseMove(e: MouseEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouseMove);

    let t = 0;
    function draw() {
      t += 0.003;
      ctx!.clearRect(0, 0, w, h);

      // Draw nebulae
      for (const n of nebulae) {
        n.x += n.speed;
        n.y += n.drift;
        if (n.x > w + n.r) n.x = -n.r;
        if (n.x < -n.r) n.x = w + n.r;
        if (n.y > h + n.r) n.y = -n.r;
        if (n.y < -n.r) n.y = h + n.r;
        const grad = ctx!.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        grad.addColorStop(0, `hsla(${n.hue}, 80%, 50%, ${n.alpha * 1.5})`);
        grad.addColorStop(0.5, `hsla(${n.hue}, 60%, 30%, ${n.alpha * 0.6})`);
        grad.addColorStop(1, `hsla(${n.hue}, 40%, 10%, 0)`);
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Draw stars with mouse interaction
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      for (const s of stars) {
        s.y -= s.speed;
        s.x += s.drift + Math.sin(t + s.phase) * 0.15;
        if (s.y < -5) { s.y = h + 5; s.x = Math.random() * w; }
        if (s.x < -5) s.x = w + 5;
        if (s.x > w + 5) s.x = -5;

        // Mouse proximity glow
        const dx = s.x - mx;
        const dy = s.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const proximity = Math.max(0, 1 - dist / 200);
        const r = s.baseR + proximity * 2;
        const a = Math.min(1, s.alpha + proximity * 0.4 + Math.sin(t * 2 + s.phase) * 0.15);

        ctx!.beginPath();
        ctx!.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx!.fillStyle = `hsla(${s.hue}, ${s.sat}%, 80%, ${a})`;
        ctx!.fill();

        if (proximity > 0.3 || r > 1.5) {
          ctx!.beginPath();
          ctx!.arc(s.x, s.y, r * 3, 0, Math.PI * 2);
          ctx!.fillStyle = `hsla(${s.hue}, ${s.sat}%, 60%, ${a * 0.1})`;
          ctx!.fill();
        }
      }

      animId = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="galaxy-canvas" aria-hidden="true" />;
}

/* ===== AURORA BACKGROUND ===== */
function AuroraBackground() {
  return (
    <>
      <div className="aurora-container" aria-hidden="true">
        <div className="aurora-band" />
        <div className="aurora-band" />
        <div className="aurora-band" />
      </div>
      <div aria-hidden="true">
        <div className="floating-orb" />
        <div className="floating-orb" />
        <div className="floating-orb" />
      </div>
    </>
  );
}

type Conn =
  | { kind: "idle" }
  | { kind: "requesting"; peerId: string }
  | { kind: "incoming"; peerId: string }
  | { kind: "connecting"; peerId: string }
  | { kind: "connected"; peerId: string };

type VideoState = "none" | "requesting" | "incoming" | "active";
type ActiveCircle = CircleSummary & { localStream: MediaStream };

const REQUEST_TIMEOUT_MS = 30_000;
const NEARBY_RADIUS_KM = 250;

function distanceKm(
  first: { lat: number; lng: number },
  second: { lat: number; lng: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(second.lat - first.lat);
  const longitudeDelta = radians(second.lng - first.lng);
  const arc =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.lat)) *
      Math.cos(radians(second.lat)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

function mediaErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Allow camera and microphone access in your browser to start video.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No camera or microphone was found on this device.";
  }
  return "Could not start video. Check your camera and microphone permissions.";
}

export default function Home() {
  const [phase, setPhase] = useState<"gate" | "live">("gate");
  const [sessionId] = useState(() => crypto.randomUUID());
  const [profile, setProfile] = useState<IdentityProfile>(() => ({
    identityMode: "anonymous",
    avatarTone: "green",
    nickname: `Pulse-${sessionId.slice(0, 4).toUpperCase()}`,
  }));
  const [peers, setPeers] = useState<PeerDot[]>([]);
  const [isAvailable, setIsAvailable] = useState(true);
  const [viewMode, setViewMode] = useState<"roam" | "nearby" | "circles">("roam");
  const [circles, setCircles] = useState<CircleSummary[]>([]);
  const [circlesLoading, setCirclesLoading] = useState(false);
  const [circleBusy, setCircleBusy] = useState(false);
  const [activeCircle, setActiveCircle] = useState<ActiveCircle | null>(null);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );

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
  const circleSignalRef = useRef<((signal: SignalMsg) => void) | null>(null);

  function showNotice(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 3500);
  }

  function changeProfile(next: IdentityProfile) {
    const previous = profile;
    setProfile(next);
    if (phase === "live") {
      void updateProfile(sessionId, next).catch((error: unknown) => {
        setProfile(previous);
        showNotice(error instanceof Error ? error.message : "Could not update your identity.");
      });
    }
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
            .catch((error: unknown) => {
              setVideo("none");
              ps.sendControl("video-end");
              showNotice(mediaErrorMessage(error));
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
    if (connRef.current.kind !== "idle" || activeCircle) return;
    if (activeCircle) return;
    if (!isAvailable) {
      showNotice("Set your status to Available before connecting.");
      return;
    }
    if (peers.find((peer) => peer.id === peerId)?.busy) {
      showNotice("That pulse is already in a conversation.");
      return;
    }
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

  function switchStranger(direction: -1 | 1) {
    const current = connRef.current;
    if (activeCircle || (current.kind !== "connecting" && current.kind !== "connected")) return;
    const ordered = [...peers].sort((first, second) => first.id.localeCompare(second.id));
    const currentIndex = ordered.findIndex((peer) => peer.id === current.peerId);
    if (currentIndex < 0 || ordered.length < 2) {
      showNotice("No other pulses are online yet.");
      return;
    }

    let nextPeer: PeerDot | undefined;
    for (let step = 1; step < ordered.length; step += 1) {
      const index = (currentIndex + direction * step + ordered.length) % ordered.length;
      if (!ordered[index].busy) {
        nextPeer = ordered[index];
        break;
      }
    }
    if (!nextPeer) {
      showNotice("No other available pulses right now.");
      return;
    }

    void sendSignal(sessionId, current.peerId, "end");
    teardown();
    requestConnection(nextPeer.id);
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
      .catch((error: unknown) => {
        ps.sendControl("video-decline");
        setVideo("none");
        showNotice(mediaErrorMessage(error));
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
      case "circle-offer":
      case "circle-answer":
      case "circle-ice": {
        circleSignalRef.current?.(sig);
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

  useEffect(() => {
    if (phase !== "live" || !sessionId || !isAvailable) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const data = await poll(sessionId);
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
  }, [phase, sessionId, isAvailable]);

  useEffect(() => {
    if (phase !== "live" || viewMode !== "circles" || activeCircle) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const result = await listCircles();
        if (active) setCircles(result);
      } catch {
        if (active) showNotice("Couldn't refresh circles.");
      } finally {
        if (active) timer = setTimeout(refresh, 4000);
      }
    };
    setCirclesLoading(true);
    void listCircles()
      .then((result) => {
        if (active) setCircles(result);
      })
      .catch(() => {
        if (active) showNotice("Couldn't load circles.");
      })
      .finally(() => {
        if (active) setCirclesLoading(false);
      });
    timer = setTimeout(refresh, 4000);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [phase, viewMode, activeCircle]);

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

  function handleReady(lat: number, lng: number) {
    setMyLocation({ lat, lng });
    setIsAvailable(true);
    setPhase("live"); // enter the map immediately — join fires in background
    void join(sessionId, lat, lng, profile).catch(() => {
      // retry once silently; presence heartbeat will reconcile
      void join(sessionId, lat, lng, profile).catch(() => {});
    });
  }

  async function handleCircleEnter(mode: "create" | "join" | "random", keyword: string) {
    if (circleBusy || activeCircle) return;
    setCircleBusy(true);
    let circle: CircleSummary | null = null;
    try {
      circle = await enterCircle(sessionId, mode, keyword, profile);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setActiveCircle({ ...circle, localStream: stream });
    } catch (error) {
      if (circle) await leaveCircle(sessionId, circle.circleId);
      showNotice(
        error instanceof Error
          ? error.message
          : mediaErrorMessage(error),
      );
      setCircles(await listCircles().catch(() => circles));
    } finally {
      setCircleBusy(false);
    }
  }

  async function handleLeaveCircle() {
    if (!activeCircle) return;
    const current = activeCircle;
    current.localStream.getTracks().forEach((track) => track.stop());
    setActiveCircle(null);
    await leaveCircle(sessionId, current.circleId);
    setCircles(await listCircles().catch(() => []));
  }

  function refreshCircles() {
    setCirclesLoading(true);
    void listCircles()
      .then(setCircles)
      .catch(() => showNotice("Couldn't refresh circles."))
      .finally(() => setCirclesLoading(false));
  }

  async function toggleAvailability() {
    if (connRef.current.kind !== "idle" || activeCircle) return;
    if (isAvailable) {
      leave(sessionId);
      setPeers([]);
      setIsAvailable(false);
      return;
    }
    if (!myLocation) return;
    await join(sessionId, myLocation.lat, myLocation.lng, profile);
    setIsAvailable(true);
    setViewMode("roam");
  }

  function surpriseMe() {
    if (connRef.current.kind !== "idle" || activeCircle) return;
    const candidates = peers.filter((peer) => !peer.busy);
    if (candidates.length === 0) {
      showNotice("No one is available to connect right now.");
      return;
    }
    const peer = candidates[Math.floor(Math.random() * candidates.length)];
    setViewMode("roam");
    requestConnection(peer.id);
  }

  if (phase === "gate") {
    return (
      <div className="welcome-root-wrapper">
        <GalaxyCanvas />
        <AuroraBackground />
        <EntryGate onReady={handleReady} />
      </div>
    );
  }

  const inChat = conn.kind === "connecting" || conn.kind === "connected";
  const nearbyPeers = myLocation
    ? peers.filter(
        (peer) => distanceKm(myLocation, peer) <= NEARBY_RADIUS_KM,
      )
    : [];
  const visiblePeers = viewMode === "nearby" ? nearbyPeers : peers;

  return (
    <main className="pulse-workspace">
      {/* Galaxy Effects Layer */}
      <GalaxyCanvas />
      <AuroraBackground />

      <header className="workspace-header">
        <div className="pulse-brand"><span className="pulse-brand-mark"><i /></span>pulse</div>
        <div className="workspace-live-count"><i /> <strong>{peers.length === 0 ? "You are the first online" : `${peers.length + 1} pulses online`}</strong></div>
        <nav className="workspace-tabs" aria-label="Map views">
          <button className={viewMode === "roam" ? "active" : ""} onClick={() => setViewMode("roam")} aria-pressed={viewMode === "roam"}>◎ <span>Roam</span></button>
          <button className={viewMode === "nearby" ? "active" : ""} onClick={() => setViewMode("nearby")} aria-pressed={viewMode === "nearby"}>⌖ <span>Near you ({nearbyPeers.length})</span></button>
          <button className={viewMode === "circles" ? "active" : ""} onClick={() => setViewMode("circles")} aria-pressed={viewMode === "circles"}>♧ <span>Circles</span></button>
        </nav>
        <div className="workspace-header-actions">
          <span className="workspace-frequency"><i>≋</i> Frequency mode</span>
          <button className="workspace-surprise" onClick={surpriseMe} disabled={!isAvailable || conn.kind !== "idle" || Boolean(activeCircle)}>✧ <span>Surprise me</span></button>
          <button className="workspace-identity" onClick={() => setIdentityOpen(true)} aria-label="Edit your avatar and nickname">
            <i><span className={`identity-tone-dot tone-${profile.avatarTone}`} /></i>
            <span><small>APPEARING AS</small>{identityLabel(profile, sessionId)}</span>
          </button>
          <button className={`workspace-availability ${isAvailable ? "online" : "offline"}`} onClick={() => void toggleAvailability()} disabled={conn.kind !== "idle" || Boolean(activeCircle)} aria-pressed={isAvailable}><i />{isAvailable ? "Available" : "Away"}</button>
        </div>
      </header>

      {viewMode === "circles" ? (
        <CircleLobby
          circles={circles}
          loading={circlesLoading}
          busy={circleBusy}
          onRefresh={refreshCircles}
          onEnter={(mode, keyword) => void handleCircleEnter(mode, keyword)}
        />
      ) : (
        <>
      <section className="workspace-intro">
        <span className="workspace-eyebrow"><i /> LIVE PRESENCE ACTIVATES WHEN CONNECTED</span>
        <h1>Meet the world<br /><em>between moments.</em></h1>
        <p>Find someone on your frequency. Talk for a minute or stay for hours. When you leave, it all disappears.</p>
        <div className="workspace-privacy"><span>⌖</span> Your location is blurred <i /> No account required</div>
      </section>

      <div className="workspace-map-label"><span /> THE WORLD, RIGHT NOW <i /> {visiblePeers.length} PEOPLE {viewMode === "nearby" ? "NEAR YOU" : "ONLINE"}</div>
      <div className="workspace-map">
        <WorldMap
          peers={visiblePeers}
          me={myLocation}
          profile={profile}
          onPeerClick={requestConnection}
          canConnect={isAvailable && conn.kind === "idle"}
          focusNearby={viewMode === "nearby"}
          isRoaming={viewMode === "roam" && isAvailable && conn.kind === "idle" && !activeCircle}
        />
        <div className="workspace-map-vignette" aria-hidden="true" />
        <div className="workspace-map-legend" aria-label="Map legend">
          <span className="map-legend-you"><i />YOU</span>
          <span><i className="map-key-line water" />Water</span>
          <span><i className="map-key-line roads" />Roads</span>
          <span><i className="map-key-line rail" />Rail</span>
          <span><i className="map-key-line trails" />Trails</span>
        </div>
      </div>
        </>
      )}

      {notice && (
        <div className="pulse-notice-toast">
          {notice}
        </div>
      )}

      {conn.kind === "requesting" && (
        <div className="pulse-requesting-toast">
          <span>Requesting connection…</span>
          <button onClick={cancelRequest}>Cancel</button>
        </div>
      )}

      {conn.kind === "incoming" && (
        <ConnectionPrompt
          title="A stranger wants to connect"
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
        />
      )}

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
        />
      )}

      {video === "requesting" && (
        <div className="absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-zinc-800/90 px-4 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
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
          messages={messages}
          onSend={(text) => {
            peerRef.current?.sendChat(text);
            addMessage(true, text);
          }}
          onBack={endVideo}
          onEndCall={endConnection}
          onPreviousPeer={() => switchStranger(-1)}
          onNextPeer={() => switchStranger(1)}
        />
      )}

      {identityOpen && (
        <IdentityPanel
          profile={profile}
          onChange={changeProfile}
          onClose={() => setIdentityOpen(false)}
        />
      )}

      {activeCircle && (
        <CircleCall
          room={activeCircle}
          sessionId={sessionId}
          profile={profile}
          localStream={activeCircle.localStream}
          signalRef={circleSignalRef}
          onExit={() => void handleLeaveCircle()}
        />
      )}

      {/* Premium Footer Bar */}
      <footer className="workspace-footer">
        <span><svg className="footer-lock" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> END-TO-END, PEER-TO-PEER WEBRTC</span>
        <span>Your presence fades the moment you close this tab.</span>
        <span className="footer-status">LIVE NETWORK CONNECTED</span>
      </footer>
    </main>
  );
}
