import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { join, leave, poll, sendSignal, type PeerDot, type SignalMsg, type SignalType } from "./api";
import { ICE_CONFIG, PeerSession, type DescType, type PeerControl } from "./webrtc";

type IconName =
  | "arrow"
  | "camera"
  | "check"
  | "chevron"
  | "close"
  | "compass"
  | "globe"
  | "lock"
  | "message"
  | "mic"
  | "micOff"
  | "more"
  | "phone"
  | "phoneOff"
  | "pin"
  | "send"
  | "spark"
  | "users"
  | "videoOff";

export type AvatarTone = "green" | "violet" | "cyan" | "rose" | "amber";
export type IdentityMode = "anonymous" | "color" | "nickname";
export type UserIdentity = { mode: IdentityMode; tone: AvatarTone; nickname: string };

export type Person = {
  id: string;
  city: string;
  country: string;
  distance: string;
  distanceKm?: number;
  lat: number;
  lng: number;
  signal: "open" | "curious" | "quiet";
  match: number;
  energy: string;
  tags: string[];
  prompt: string;
  tone: AvatarTone;
  nickname?: string;
  busy?: boolean;
  circle?: string | null;
};

type Message = {
  id: number;
  text: string;
  mine: boolean;
};

type ConnState =
  | { kind: "idle" }
  | { kind: "requesting"; peer: Person }
  | { kind: "incoming"; peer: Person }
  | { kind: "connecting"; peer: Person }
  | { kind: "connected"; peer: Person };

const signalCopy = {
  open: "Let’s talk",
  curious: "Explore something new",
  quiet: "Share a random thought",
};

const avatarTones: AvatarTone[] = ["green", "violet", "cyan", "rose", "amber"];

function AlienFace({ tone = "green", className = "" }: { tone?: AvatarTone; className?: string }) {
  return (
    <svg className={`alien-face tone-${tone} ${className}`} viewBox="0 0 48 48" aria-hidden="true">
      <path className="alien-head" d="M24 3.5c10.2 0 17.2 7.6 16 18.2C38.6 34 29 43.4 24 45c-5-1.6-14.6-11-16-23.3C6.8 11.1 13.8 3.5 24 3.5Z" />
      <path className="alien-eye" d="M11.8 19.2c4.5-.8 8.1.2 10.2 3.1-2.7 3-6.1 3.8-9.8 2.1-1.2-1.8-1.3-3.5-.4-5.2Z" />
      <path className="alien-eye" d="M36.2 19.2c-4.5-.8-8.1.2-10.2 3.1 2.7 3 6.1 3.8 9.8 2.1 1.2-1.8 1.3-3.5.4-5.2Z" />
      <path className="alien-mouth" d="M20.5 34.2c2.3 1.2 4.7 1.2 7 0" />
    </svg>
  );
}

function alienMarkup(tone: AvatarTone) {
  return `<svg class="alien-face tone-${tone}" viewBox="0 0 48 48" aria-hidden="true"><path class="alien-head" d="M24 3.5c10.2 0 17.2 7.6 16 18.2C38.6 34 29 43.4 24 45c-5-1.6-14.6-11-16-23.3C6.8 11.1 13.8 3.5 24 3.5Z"/><path class="alien-eye" d="M11.8 19.2c4.5-.8 8.1.2 10.2 3.1-2.7 3-6.1 3.8-9.8 2.1-1.2-1.8-1.3-3.5-.4-5.2Z"/><path class="alien-eye" d="M36.2 19.2c-4.5-.8-8.1.2-10.2 3.1 2.7 3 6.1 3.8 9.8 2.1 1.2-1.8 1.3-3.5.4-5.2Z"/><path class="alien-mouth" d="M20.5 34.2c2.3 1.2 4.7 1.2 7 0"/></svg>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]!);
}

function identityLabel(identity: UserIdentity) {
  return identity.mode === "nickname" && identity.nickname.trim()
    ? identity.nickname.trim()
    : identity.mode === "color"
    ? `${identity.tone} alien`
    : "Anonymous alien";
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    camera: <><path d="M14.5 8.5 19 6v12l-4.5-2.5" /><rect x="3" y="6" width="12" height="12" rx="2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
    compass: <><circle cx="12" cy="12" r="9" /><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.4 3 14.6 0 18M12 3c-3 3.4-3 14.6 0 18" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    message: <path d="M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3Z" />,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
    micOff: <><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="22" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>,
    phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
    phoneOff: <><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" /><line x1="1" y1="1" x2="23" y2="23" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    spark: <><path d="m12 3 1.4 4.1L17 9l-3.6 1.9L12 15l-1.4-4.1L7 9l3.6-1.9Z" /><path d="m5 15 .8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8Z" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
    videoOff: <><path d="m16 16 4.5 2.5V6l-4.5 2.5" /><rect x="3" y="6" width="13" height="12" rx="2" /><line x1="2" y1="2" x2="22" y2="22" /></>,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark"><span /></span>
      <span>pulse</span>
    </div>
  );
}

function SpatialBackground() {
  const scene = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function moveScene(event: PointerEvent) {
      if (!scene.current) return;
      const x = (event.clientX / window.innerWidth - 0.5) * 2;
      const y = (event.clientY / window.innerHeight - 0.5) * 2;
      scene.current.style.setProperty("--pointer-x", x.toFixed(3));
      scene.current.style.setProperty("--pointer-y", y.toFixed(3));
    }

    window.addEventListener("pointermove", moveScene, { passive: true });
    return () => window.removeEventListener("pointermove", moveScene);
  }, []);

  return (
    <div className="spatial-background" ref={scene} aria-hidden="true">
      <div className="depth-grid" />
      <div className="holo-orb orb-violet"><i /><i /><i /></div>
      <div className="holo-orb orb-cyan"><i /><i /></div>
      <div className="glass-prism"><span /><span /><span /></div>
      <div className="light-rain">
        {Array.from({ length: 18 }, (_, index) => <i key={index} style={{ "--rain-index": index } as React.CSSProperties} />)}
      </div>
    </div>
  );
}

function Globe({
  peers,
  selected,
  onSelect,
  identity,
  myLocation,
}: {
  peers: Person[];
  selected: Person | null;
  onSelect: (person: Person) => void;
  identity: UserIdentity;
  myLocation: [number, number] | null;
}) {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const shellElement = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const userMarker = useRef<L.Marker | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!mapElement.current || mapInstance.current) return;

    const initialCenter: [number, number] = myLocation ?? [24, 5];
    const map = L.map(mapElement.current, {
      zoomControl: false,
      attributionControl: true,
      worldCopyJump: true,
      minZoom: 2,
    }).setView(initialCenter, myLocation ? 6 : 2);

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      {
        attribution:
          'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, DeLorme, NAVTEQ',
        maxZoom: 16,
        subdomains: [],
      }
    ).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapInstance.current = map;

    window.setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Update user's own marker
  useEffect(() => {
    if (!mapInstance.current || !myLocation) return;
    const map = mapInstance.current;

    const icon = L.divIcon({
      className: "pulse-user-marker",
      html: `<span class="user-location-pulse"></span>${alienMarkup(identity.tone)}<small>${escapeHtml(identityLabel(identity))} · you are here</small>`,
      iconSize: [180, 48],
      iconAnchor: [22, 22],
    });

    if (!userMarker.current) {
      userMarker.current = L.marker(myLocation, { icon }).addTo(map);
    } else {
      userMarker.current.setLatLng(myLocation);
      userMarker.current.setIcon(icon);
    }
  }, [myLocation, identity]);

  // Reconcile online peer markers
  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;
    const markers = markersRef.current;
    const activeIds = new Set(peers.map((p) => p.id));

    // Remove stale peer markers
    for (const [id, marker] of markers.entries()) {
      if (!activeIds.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }

    // Upsert live peer markers
    for (const peer of peers) {
      const isSelected = selected?.id === peer.id;
      const icon = L.divIcon({
        className: `pulse-map-marker ${isSelected ? "selected" : ""} ${peer.busy ? "busy" : ""}`,
        html: `<span class="marker-ring"></span>${alienMarkup(peer.tone)}<small>${escapeHtml(peer.nickname || peer.city)}</small>`,
        iconSize: [110, 48],
        iconAnchor: [21, 21],
      });

      let marker = markers.get(peer.id);
      if (!marker) {
        marker = L.marker([peer.lat, peer.lng], { icon }).addTo(map);
        marker.on("click", () => onSelect(peer));
        markers.set(peer.id, marker);
      } else {
        marker.setLatLng([peer.lat, peer.lng]);
        marker.setIcon(icon);
      }
    }
  }, [peers, selected, onSelect]);

  useEffect(() => {
    if (!selected || !mapInstance.current) return;
    mapInstance.current.flyTo([selected.lat, selected.lng], 7, { duration: 0.8 });
  }, [selected]);

  function illuminateMap(event: React.PointerEvent<HTMLDivElement>) {
    if (!shellElement.current) return;
    const bounds = shellElement.current.getBoundingClientRect();
    shellElement.current.style.setProperty("--map-x", `${event.clientX - bounds.left}px`);
    shellElement.current.style.setProperty("--map-y", `${event.clientY - bounds.top}px`);
  }

  return (
    <div className="live-map-shell" ref={shellElement} onPointerMove={illuminateMap} aria-label="Live interactive world map">
      <div ref={mapElement} className="live-map" />
      <div className="location-status found">
        <Icon name="pin" size={14} />
        <span>
          <strong>Location protected</strong>
          <small>Placed 1–3 km from your real position</small>
        </span>
      </div>
      {myLocation && (
        <button className="recenter-button" onClick={() => mapInstance.current?.flyTo(myLocation, 7, { duration: 0.8 })}>
          <Icon name="compass" size={15} /> Recenter
        </button>
      )}
      <div className="map-legend">
        <span><i className="available" /> Let’s talk</span>
        <span><i className="curious" /> Explore</span>
        <span><i className="thought" /> Random thought</span>
      </div>
      <div className="map-vignette" />
    </div>
  );
}

function Welcome({ onEnter }: { onEnter: (coords?: { lat: number; lng: number }) => void }) {
  const [locating, setLocating] = useState(false);

  function enterWithLocation() {
    setLocating(true);
    if (!navigator.geolocation) {
      onEnter();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onEnter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        onEnter();
      },
      { enableHighAccuracy: false, timeout: 3500, maximumAge: 300000 }
    );
  }

  return (
    <main className="welcome">
      <SpatialBackground />
      <div className="welcome-noise" />
      <div className="welcome-orbit orbit-a"><i /><i /><i /></div>
      <div className="welcome-orbit orbit-b"><i /><i /></div>
      <header>
        <Brand />
        <span><Icon name="lock" size={14} /> No account. No trace.</span>
      </header>
      <section className="welcome-content">
        <span className="welcome-kicker"><i /> Live presence activates when connected</span>
        <h1>Meet the world<br /><em>between moments.</em></h1>
        <p>Find someone on your frequency. Talk for a minute or stay for hours. When you leave, it all disappears.</p>
        <button className="enter-button" onClick={enterWithLocation} disabled={locating}>
          <span>{locating ? "Tuning your frequency…" : "Enter Pulse ✦"}</span>
          <i>{locating ? <span className="entry-loader" /> : <Icon name="arrow" size={19} />}</i>
        </button>
        <div className="welcome-trust">
          <span><Icon name="lock" size={13} /> Peer-to-peer</span>
          <span><Icon name="pin" size={13} /> Location blurred</span>
          <span><Icon name="message" size={13} /> Nothing stored</span>
        </div>
      </section>
      <div className="welcome-globe">
        <div className="mini-world">
          <svg className="welcome-world-map" viewBox="0 0 1000 1000" role="img" aria-label="The world">
            <g className="world-grid">
              <ellipse cx="500" cy="500" rx="440" ry="155" />
              <ellipse cx="500" cy="500" rx="440" ry="285" />
              <path d="M60 500h880M500 60c-145 126-145 754 0 880M500 60c145 126 145 754 0 880" />
            </g>
          </svg>
        </div>
      </div>
      <div className="welcome-side-copy"><span>One planet</span><i /><span>One fleeting connection</span></div>
      <footer>
        <span>Pulse / Anonymous social</span>
        <p>Be open. Be kind. Be here.</p>
        <span>Made for the quietly curious</span>
      </footer>
    </main>
  );
}

function NearbyView({ peers, onSelect }: { peers: Person[]; onSelect: (person: Person) => void }) {
  const rail = useRef<HTMLDivElement | null>(null);
  const [filter, setFilter] = useState<"all" | Person["signal"]>("all");
  const visiblePeople = filter === "all" ? peers : peers.filter((p) => p.signal === filter);

  function moveRail(event: React.WheelEvent<HTMLDivElement>) {
    if (!rail.current || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    rail.current.scrollBy({ left: event.deltaY * 1.15, behavior: "smooth" });
  }

  return (
    <section className="discovery-view">
      <div className="discovery-heading">
        <div>
          <span className="eyebrow"><i /> Around your orbit</span>
          <h2>People nearby</h2>
          <p>Not precise locations — just real humans close enough to share your corner of the world.</p>
        </div>
        <span className="local-count"><i /> {peers.length} active pulses</span>
      </div>
      <div className="nearby-filters">
        {([
          ["all", "All nearby"],
          ["open", "Let’s talk"],
          ["curious", "Explore"],
          ["quiet", "Random thought"],
        ] as const).map(([value, label]) => (
          <button className={filter === value ? "active" : ""} onClick={() => setFilter(value)} key={value}>
            <i className={value} /> {label}
          </button>
        ))}
      </div>
      <div className="people-grid" ref={rail} onWheel={moveRail}>
        {visiblePeople.length === 0 && (
          <div className="empty-discovery">
            <AlienFace tone="cyan" />
            <strong>No nearby strangers online yet</strong>
            <p>Open another browser window or invite someone to test real-time presence!</p>
          </div>
        )}
        {visiblePeople.map((person, index) => (
          <button className={`nearby-card nearby-${(index % 4) + 1}`} onClick={() => onSelect(person)} key={person.id}>
            <span className="nearby-top">
              <span className="mini-avatar"><AlienFace tone={person.tone} /></span>
              <span className="match-score">{person.match}% aligned</span>
            </span>
            <span className="nearby-body">
              <small>{person.distance} near {person.city}</small>
              <strong>{person.nickname || `${person.city} Pulse`}</strong>
              <span className="tag-row">{person.tags.slice(0, 2).map((tag) => <i key={tag}>{tag}</i>)}</span>
            </span>
            <span className="nearby-foot">
              <span><i /> {signalCopy[person.signal]}</span>
              <Icon name="chevron" size={15} />
            </span>
          </button>
        ))}
      </div>
      <div className="scroll-hint"><span /><p>Scroll vertically — the orbit moves sideways</p><span /></div>
    </section>
  );
}

type Circle = { title: string; topic: string; count: number; tone: string; tags: string[] };

function CirclesView({ onJoin, onHost }: { onJoin: (circle: Circle) => void; onHost: () => void }) {
  const circles: Circle[] = [
    { title: "Midnight Solitude", topic: "What do you think about when everyone else is asleep?", count: 3, tone: "violet", tags: ["night", "calm"] },
    { title: "Creative Spark", topic: "What’s one crazy idea you’ve had recently?", count: 2, tone: "cyan", tags: ["wild ideas", "brainstorm"] },
  ];

  return (
    <section className="discovery-view circles-view">
      <div className="discovery-heading">
        <div>
          <span className="eyebrow"><i /> Live gatherings</span>
          <h2>Drop into a circle</h2>
          <p>Small, temporary rooms built around a thought. Listen first or add your voice.</p>
        </div>
        <button className="host-button" onClick={onHost}><Icon name="spark" size={15} /> Start a circle</button>
      </div>
      <div className="circle-list">
        {circles.map((circle) => (
          <button className={`circle-card ${circle.tone}`} key={circle.title} onClick={() => onJoin(circle)}>
            <span className="circle-visual">
              {[0, 1, 2, 3].map((item) => <i style={{ transform: `rotate(${item * 90}deg) translateY(-24px)` }} key={item} />)}
              <strong>{circle.count}</strong>
              <small>inside</small>
            </span>
            <span className="circle-copy">
              <small>LIVE NOW</small>
              <strong>{circle.title}</strong>
              <p>{circle.topic}</p>
              <span>{circle.tags.map((tag) => <i key={tag}>{tag}</i>)}</span>
            </span>
            <span className="join-circle">Enter quietly <Icon name="arrow" size={16} /></span>
          </button>
        ))}
      </div>
      <p className="circle-note"><Icon name="lock" size={13} /> Circles dissolve when the last person leaves. Nothing is recorded.</p>
    </section>
  );
}

function CircleRoom({
  circle,
  peers,
  sessionId,
  identity,
  onLeave,
  circleSignalRef,
  showNotice,
}: {
  circle: Circle;
  peers: Person[];
  sessionId: string;
  identity: UserIdentity;
  onLeave: () => void;
  circleSignalRef: React.MutableRefObject<((sig: SignalMsg) => void) | null>;
  showNotice: (msg: string) => void;
}) {
  const [micActive, setMicActive] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [selfMonitor, setSelfMonitor] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [waveHeights, setWaveHeights] = useState<number[]>(Array(24).fill(8));
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set());

  const localStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudios = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Filter peers that are in this circle
  const roomPeers = useMemo(
    () => peers.filter((p) => p.circle === circle.title),
    [peers, circle.title]
  );

  // Total active count in this circle
  const activeCount = 1 + roomPeers.length;

  function getOrCreatePC(peerId: string): RTCPeerConnection {
    let pc = peerConnections.current.get(peerId);
    if (pc) return pc;

    pc = new RTCPeerConnection(ICE_CONFIG);
    peerConnections.current.set(peerId, pc);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        void sendSignal(sessionId, peerId, "ice", JSON.stringify({ circle: circle.title, candidate }));
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      let audio = remoteAudios.current.get(peerId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        (audio as any).playsInline = true;
        remoteAudios.current.set(peerId, audio);
      }
      audio.srcObject = stream;
      audio.play().catch((e) => console.warn("Remote audio play error:", e));

      // Mark this peer as speaking when audio flows
      setSpeakingPeers((prev) => new Set(prev).add(peerId));
    };

    // If local microphone stream exists, add tracks
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getAudioTracks()) {
        try {
          pc.addTrack(track, localStreamRef.current);
        } catch {}
      }
    }

    return pc;
  }

  async function connectToPeer(peerId: string, stream?: MediaStream) {
    const pc = getOrCreatePC(peerId);
    if (stream) {
      for (const track of stream.getAudioTracks()) {
        if (!pc.getSenders().some((s) => s.track === track)) {
          try {
            pc.addTrack(track, stream);
          } catch {}
        }
      }
    }

    // Deterministic initiator: the one with smaller UUID initiates
    if (sessionId < peerId) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        void sendSignal(
          sessionId,
          peerId,
          "offer",
          JSON.stringify({ circle: circle.title, sdp: pc.localDescription })
        );
      } catch (e) {
        console.warn("Circle offer error:", e);
      }
    }
  }

  // Handle incoming circle WebRTC signals
  useEffect(() => {
    circleSignalRef.current = async (sig: SignalMsg) => {
      try {
        const data = sig.payload ? JSON.parse(sig.payload) : {};
        if (data.circle !== circle.title) return;

        const pc = getOrCreatePC(sig.fromId);
        if (sig.type === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          void sendSignal(
            sessionId,
            sig.fromId,
            "answer",
            JSON.stringify({ circle: circle.title, sdp: pc.localDescription })
          );
        } else if (sig.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } else if (sig.type === "ice") {
          if (data.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
        }
      } catch (e) {
        console.warn("Circle signal handling error:", e);
      }
    };

    return () => {
      circleSignalRef.current = null;
    };
  }, [circle.title, sessionId]);

  // Connect to any new peers joining the circle
  useEffect(() => {
    for (const p of roomPeers) {
      void connectToPeer(p.id, localStreamRef.current || undefined);
    }
  }, [roomPeers]);

  async function joinVoice() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setMicActive(true);
      setMicMuted(false);

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      // Self-monitoring node (loopback for hearing oneself)
      const monitorGain = ctx.createGain();
      monitorGain.gain.value = selfMonitor ? 0.7 : 0;
      source.connect(monitorGain);
      monitorGain.connect(ctx.destination);
      monitorGainRef.current = monitorGain;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateWave = () => {
        if (!localStreamRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setAudioLevel(avg);

        // Dynamically compute bar heights based on speech frequencies
        const newHeights = Array.from({ length: 24 }, (_, i) => {
          const val = dataArray[i % dataArray.length] || 0;
          return Math.max(5, Math.min(32, Math.round(5 + (val / 255) * 27)));
        });
        setWaveHeights(newHeights);
        animFrameRef.current = requestAnimationFrame(updateWave);
      };
      updateWave();

      // Add audio track to all peer connections in the circle
      for (const p of roomPeers) {
        void connectToPeer(p.id, stream);
      }
      showNotice("Microphone live! Everyone in the circle can now hear you.");
    } catch (err) {
      console.error(err);
      showNotice("Could not access microphone. Please allow microphone permissions.");
    }
  }

  function toggleMute() {
    if (localStreamRef.current) {
      const next = !micMuted;
      localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !next));
      setMicMuted(next);
      showNotice(next ? "Microphone muted." : "Microphone unmuted · speaking freely.");
    }
  }

  function toggleSelfMonitor() {
    const next = !selfMonitor;
    setSelfMonitor(next);
    if (monitorGainRef.current) {
      monitorGainRef.current.gain.value = next ? 0.7 : 0;
    }
    showNotice(next ? "Voice monitor active (use headphones to prevent acoustic echo)." : "Voice monitor turned off.");
  }

  // Cleanup on unmount or when leaving the room
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      for (const pc of peerConnections.current.values()) {
        try { pc.close(); } catch {}
      }
      peerConnections.current.clear();
      for (const audio of remoteAudios.current.values()) {
        try { audio.srcObject = null; audio.pause(); } catch {}
      }
      remoteAudios.current.clear();
    };
  }, []);

  // Display souls around the orbit
  const orbitSouls = useMemo(() => {
    const list = [
      { id: sessionId, tone: identity.tone, isSelf: true, speaking: micActive && !micMuted && audioLevel > 15 },
      ...roomPeers.map((p) => ({
        id: p.id,
        tone: p.tone,
        isSelf: false,
        speaking: speakingPeers.has(p.id),
      })),
    ];
    // Pad to at least 7 visuals for aesthetics
    while (list.length < 7) {
      list.push({
        id: `phantom-${list.length}`,
        tone: avatarTones[list.length % avatarTones.length],
        isSelf: false,
        speaking: false,
      });
    }
    return list.slice(0, 7);
  }, [sessionId, identity.tone, roomPeers, micActive, micMuted, audioLevel, speakingPeers]);

  return (
    <section className={`circle-room ${circle.tone}`}>
      <div className="room-head">
        <span><i /> Live circle · Voice active</span>
        <button onClick={onLeave} title="Leave circle"><Icon name="close" size={16} /></button>
      </div>

      <div className="room-orbit">
        {orbitSouls.map((soul, index) => (
          <i
            className={`room-soul soul-${index + 1} ${soul.speaking ? "speaking" : ""}`}
            key={soul.id}
            style={soul.speaking ? { transform: `scale(1.25)`, filter: "drop-shadow(0 0 10px var(--green))" } : {}}
          >
            <AlienFace tone={soul.tone} />
          </i>
        ))}
        <div className="room-center">
          <Icon name="users" size={20} />
          <strong>{activeCount}</strong>
          <small>{micActive ? (micMuted ? "muted" : "speaking") : "listening"}</small>
        </div>
      </div>

      <span className="room-label">Now discussing</span>
      <h2>{circle.title}</h2>
      <blockquote>“{circle.topic}”</blockquote>

      {/* Dynamic Waveform responding to real voice volume */}
      <div className="room-wave">
        {waveHeights.map((h, index) => (
          <i
            key={index}
            style={{
              height: micActive && !micMuted ? `${h}px` : undefined,
              animation: micActive && !micMuted ? "none" : undefined,
              background: micActive && !micMuted && audioLevel > 12 ? "var(--green)" : undefined,
              transition: "height 0.08s ease",
            }}
          />
        ))}
      </div>

      <p>
        {!micActive
          ? "You’re listening quietly. Tap 'Join voice' to speak to everyone in this room."
          : micMuted
          ? "Microphone is muted. Tap 'Unmute mic' when you're ready to speak."
          : audioLevel > 15
          ? "You’re speaking on the floor. Voice is live and streaming!"
          : "You’re on the floor. Microphone is listening… speak freely."}
      </p>

      <div className="room-actions">
        {!micActive ? (
          <button className="live" onClick={joinVoice}>
            <Icon name="mic" size={17} /> Join voice
          </button>
        ) : (
          <button className={micMuted ? "" : "live"} onClick={toggleMute}>
            <Icon name={micMuted ? "micOff" : "mic"} size={17} />
            {micMuted ? "Unmute mic" : "Mute mic"}
          </button>
        )}

        {micActive && (
          <button
            onClick={toggleSelfMonitor}
            title="Hear yourself through headphones"
            style={selfMonitor ? { borderColor: "var(--blue)", color: "var(--blue)", background: "rgba(34,211,238,0.12)" } : {}}
          >
            <Icon name="spark" size={15} />
            {selfMonitor ? "Voice monitor ON" : "Test hear myself"}
          </button>
        )}

        <button onClick={onLeave}>Leave quietly</button>
      </div>

      <small className="room-privacy">
        <Icon name="lock" size={12} /> Peer-to-peer encrypted audio · Nothing is recorded or stored
      </small>
    </section>
  );
}

function HostCircle({ onClose, onStart }: { onClose: () => void; onStart: (circle: Circle) => void }) {
  const [topic, setTopic] = useState("What’s been on your mind lately?");
  return (
    <div className="modal-backdrop">
      <section className="host-modal">
        <button className="card-close" onClick={onClose}><Icon name="close" size={16} /></button>
        <span className="modal-icon"><Icon name="spark" /></span>
        <small>Host a temporary space</small>
        <h2>Start a circle</h2>
        <p>Give strangers one thoughtful reason to gather. The room vanishes when everyone leaves.</p>
        <label>
          Opening thought
          <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={80} />
        </label>
        <div className="prompt-picks">
          {["A tiny win from today", "Where would you go next?", "A thought you can’t shake"].map((prompt) => (
            <button onClick={() => setTopic(prompt)} key={prompt}>{prompt}</button>
          ))}
        </div>
        <button className="start-room" onClick={() => onStart({ title: "Open frequency", topic, count: 1, tone: "violet", tags: ["live", "strangers"] })}>
          Open the circle <Icon name="arrow" size={16} />
        </button>
      </section>
    </div>
  );
}

function Serendipity({
  state,
  match,
  onClose,
  onRetry,
  onChoose,
}: {
  state: "scanning" | "found";
  match: Person | null;
  onClose: () => void;
  onRetry: () => void;
  onChoose: () => void;
}) {
  return (
    <div className="serendipity-backdrop">
      <section className={`serendipity ${state}`}>
        <button className="serendipity-close" onClick={onClose} aria-label="Close serendipity">
          <Icon name="close" size={17} />
        </button>
        <div className="serendipity-brand"><Brand /><span>Serendipity mode</span></div>
        <div className="resonance-visual">
          <div className="resonance-ring ring-one" />
          <div className="resonance-ring ring-two" />
          <div className="resonance-ring ring-three" />
          <div className="resonance-core"><Icon name={state === "found" ? "check" : "spark"} size={24} /></div>
          {Array.from({ length: 8 }, (_, index) => <i className={`resonance-dot rd-${index + 1}`} key={index} />)}
        </div>

        {state === "scanning" || !match ? (
          <div className="serendipity-copy">
            <span>Listening across the world</span>
            <h2>Finding your<br /><em>unexpected pulse.</em></h2>
            <p>Scanning active orbits for someone who shares your energy right now.</p>
            <div className="scan-line"><i /></div>
            <small>Comparing temporary signals · no algorithms or profiles</small>
          </div>
        ) : (
          <div className="serendipity-copy reveal">
            <span>A rare resonance appeared</span>
            <h2>{match.match}% alignment<br /><em>near {match.city}.</em></h2>
            <p>You’re both open to <strong>{signalCopy[match.signal].toLowerCase()}</strong>, and online in this exact moment.</p>
            <blockquote>“{match.prompt}”</blockquote>
            <div className="serendipity-actions">
              <button className="choose-match" onClick={onChoose}>Meet this pulse <Icon name="arrow" size={17} /></button>
              <button onClick={onRetry}>Try another orbit</button>
            </div>
            <small><Icon name="lock" size={12} /> Neither of you is revealed until a signal is accepted</small>
          </div>
        )}
      </section>
    </div>
  );
}

function ChatPanel({
  person,
  messages,
  onSendMessage,
  onStartAudioCall,
  onEndAudioCall,
  callActive,
  onToggleVideo,
  videoActive,
  localStream,
  remoteStream,
  onClose,
  isConnecting,
}: {
  person: Person;
  messages: Message[];
  onSendMessage: (text: string) => void;
  onStartAudioCall: () => void;
  onEndAudioCall: () => void;
  callActive: boolean;
  onToggleVideo: () => void;
  videoActive: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onClose: () => void;
  isConnecting: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [showChatInVideo, setShowChatInVideo] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Call duration timer
  useEffect(() => {
    if (!callActive && !videoActive) {
      setCallDuration(0);
      return;
    }
    const timer = window.setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [callActive, videoActive]);

  // Bind local video
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, videoActive]);

  // Bind remote video
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, videoActive]);

  // Bind remote audio (always active so voice is heard regardless of view)
  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  function submitMessage(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    onSendMessage(draft.trim());
    setDraft("");
  }

  function toggleMic() {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setMicMuted(!micMuted);
    }
  }

  function toggleCamera() {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setCameraOff(!cameraOff);
    }
  }

  const formattedTime = `${Math.floor(callDuration / 60)
    .toString()
    .padStart(2, "0")}:${(callDuration % 60).toString().padStart(2, "0")}`;

  return (
    <section className="chat-panel" aria-label={`Private chat with ${person.city}`}>
      {/* Hidden background audio sink for remote audio */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />

      <div className="chat-head">
        <div className="avatar"><AlienFace tone={person.tone} /></div>
        <div className="chat-identity">
          <strong>{person.nickname || "Anonymous stranger"}</strong>
          <span>
            <i style={{ background: isConnecting ? "var(--amber)" : "var(--green)" }} />
            {isConnecting
              ? "Connecting WebRTC…"
              : callActive
              ? `Voice call (${formattedTime})`
              : videoActive
              ? `Live video (${formattedTime})`
              : `Near ${person.city} · live peer-to-peer`}
          </span>
        </div>

        {/* Audio call toggle */}
        <button
          className={`icon-button ${callActive ? "active" : ""}`}
          onClick={callActive ? onEndAudioCall : onStartAudioCall}
          title={callActive ? "End voice call" : "Start voice call"}
          style={callActive ? { color: "var(--green)", borderColor: "var(--green)" } : {}}
        >
          <Icon name={callActive ? "phoneOff" : "phone"} size={16} />
        </button>

        {/* Video call toggle */}
        <button
          className={`icon-button ${videoActive ? "active" : ""}`}
          onClick={onToggleVideo}
          title={videoActive ? "End video call" : "Start video call"}
          style={videoActive ? { color: "var(--blue)", borderColor: "var(--blue)" } : {}}
        >
          <Icon name="camera" size={16} />
        </button>

        <button className="icon-button" onClick={() => setSafetyOpen(!safetyOpen)} title="Safety options">
          <Icon name="more" />
        </button>
        <button className="icon-button" onClick={onClose} title="End conversation">
          <Icon name="close" />
        </button>

        {safetyOpen && (
          <div className="safety-menu">
            <span><Icon name="lock" size={15} /> Your privacy</span>
            <button onClick={() => setSafetyOpen(false)}>Report conversation <Icon name="chevron" size={14} /></button>
            <button className="danger" onClick={onClose}>End & leave orbit <Icon name="close" size={14} /></button>
            <small>Peer-to-peer WebRTC. Nothing touches the server.</small>
          </div>
        )}
      </div>

      {/* Active Audio Call Bar */}
      {callActive && !videoActive && (
        <div className="audio-call-bar">
          <div className="audio-call-info">
            <div className="audio-call-wave">
              <span /><span /><span /><span />
            </div>
            <span><strong>Voice call live</strong> · {formattedTime}</span>
          </div>
          <div className="audio-call-actions">
            <button
              className={`audio-action-btn ${micMuted ? "muted" : ""}`}
              onClick={toggleMic}
              title={micMuted ? "Unmute mic" : "Mute mic"}
            >
              <Icon name={micMuted ? "micOff" : "mic"} size={14} />
            </button>
            <button
              className="audio-action-btn end"
              onClick={onEndAudioCall}
              title="End voice call"
            >
              <Icon name="phoneOff" size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Video Call Stage */}
      {videoActive ? (
        <div className="video-stage">
          <div className="video-noise" />
          {remoteStream && remoteStream.getVideoTracks().length > 0 ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <>
              <div className="video-avatar"><AlienFace tone={person.tone} /></div>
              <p>Waiting for stranger’s camera feed…</p>
              <span>Encrypted live peer-to-peer stream</span>
            </>
          )}

          {localStream && (
            <div className="self-view">
              {cameraOff ? (
                <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--muted)" }}>
                  <Icon name="videoOff" size={20} />
                </div>
              ) : (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              )}
              <small>You {cameraOff ? "(off)" : ""}</small>
            </div>
          )}

          {/* Floating Controls */}
          <div className="video-controls" style={{ position: "absolute", bottom: "16px", zIndex: 10, display: "flex", gap: "10px" }}>
            <button
              className={`icon-button ${micMuted ? "active" : ""}`}
              onClick={toggleMic}
              title={micMuted ? "Unmute mic" : "Mute mic"}
              style={micMuted ? { background: "rgba(255, 59, 92, 0.2)", color: "var(--red)" } : {}}
            >
              <Icon name={micMuted ? "micOff" : "mic"} size={16} />
            </button>
            <button
              className={`icon-button ${cameraOff ? "active" : ""}`}
              onClick={toggleCamera}
              title={cameraOff ? "Turn camera on" : "Turn camera off"}
              style={cameraOff ? { background: "rgba(255, 59, 92, 0.2)", color: "var(--red)" } : {}}
            >
              <Icon name={cameraOff ? "videoOff" : "camera"} size={16} />
            </button>
            <button
              className={`icon-button ${showChatInVideo ? "active" : ""}`}
              onClick={() => setShowChatInVideo(!showChatInVideo)}
              title="Toggle chat overlay"
              style={showChatInVideo ? { background: "rgba(34, 211, 238, 0.2)", color: "var(--blue)" } : {}}
            >
              <Icon name="message" size={16} />
            </button>
            <button
              className="icon-button"
              style={{ background: "var(--red)", color: "white" }}
              onClick={onToggleVideo}
              title="End video call"
            >
              <Icon name="phoneOff" size={16} />
            </button>
          </div>

          {/* Optional Chat Overlay During Video */}
          {showChatInVideo && (
            <div className="video-chat-toggle-pane">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
                <strong style={{ fontSize: "11px" }}>Live conversation</strong>
                <button className="icon-button" onClick={() => setShowChatInVideo(false)} style={{ width: "24px", height: "24px" }}>
                  <Icon name="close" size={13} />
                </button>
              </div>
              <div className="messages" style={{ flex: 1, padding: "12px" }}>
                {messages.map((message) => (
                  <div className={`message ${message.mine ? "mine" : ""}`} key={message.id}>
                    <p>{message.text}</p>
                    <small>{message.mine ? "Delivered" : "Just now"}</small>
                  </div>
                ))}
              </div>
              <form className="composer" onSubmit={submitMessage}>
                <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type during call..." />
                <button type="submit" aria-label="Send message"><Icon name="send" size={16} /></button>
              </form>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="privacy-line">
            <Icon name="lock" size={13} />
            {isConnecting ? "Connecting direct P2P data channel…" : "Peer-to-peer WebRTC · nothing stored"}
          </div>
          <div className="messages">
            <div className="conversation-start">
              <span><Icon name="spark" size={15} /></span>
              <strong>Frequency connected</strong>
              <p>You’re speaking directly with {person.nickname || "someone"} near {person.city}. Be kind and stay curious.</p>
            </div>
            {messages.map((message) => (
              <div className={`message ${message.mine ? "mine" : ""}`} key={message.id}>
                <p>{message.text}</p>
                <small>{message.mine ? "Delivered" : "Just now"}</small>
              </div>
            ))}
          </div>
          <form className="composer" onSubmit={submitMessage}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Say something real..." autoFocus />
            <button type="submit" aria-label="Send message"><Icon name="send" size={17} /></button>
          </form>
        </>
      )}
    </section>
  );
}

function IdentityPanel({
  identity,
  onChange,
  onClose,
}: {
  identity: UserIdentity;
  onChange: (identity: UserIdentity) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop identity-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="identity-modal" aria-label="Choose how you appear">
        <button className="card-close" onClick={onClose}><Icon name="close" size={16} /></button>
        <div className="identity-preview">
          <span><AlienFace tone={identity.tone} /></span>
          <small>Your temporary appearance</small>
          <strong>{identityLabel(identity)}</strong>
          <p>Change it anytime. It disappears when you leave.</p>
        </div>
        <div className="identity-options">
          <button className={identity.mode === "anonymous" ? "active" : ""} onClick={() => onChange({ ...identity, mode: "anonymous" })}>
            <span><Icon name="lock" size={16} /></span>
            <span><strong>Stay anonymous</strong><small>Only your alien face is visible</small></span>
            {identity.mode === "anonymous" && <Icon name="check" size={16} />}
          </button>
          <button className={identity.mode === "color" ? "active" : ""} onClick={() => onChange({ ...identity, mode: "color" })}>
            <span className="color-swatch"><AlienFace tone={identity.tone} /></span>
            <span><strong>Color avatar</strong><small>Be known by a color, not a name</small></span>
            {identity.mode === "color" && <Icon name="check" size={16} />}
          </button>
          <button className={identity.mode === "nickname" ? "active" : ""} onClick={() => onChange({ ...identity, mode: "nickname" })}>
            <span><Icon name="message" size={16} /></span>
            <span><strong>Use a nickname</strong><small>A temporary name for this session</small></span>
            {identity.mode === "nickname" && <Icon name="check" size={16} />}
          </button>
        </div>
        <div className="identity-customize">
          <label>
            Alien color
            <span className="tone-picker">
              {avatarTones.map((tone) => (
                <button className={`tone-choice tone-${tone} ${identity.tone === tone ? "active" : ""}`} onClick={() => onChange({ ...identity, tone })} key={tone}>
                  <AlienFace tone={tone} />
                </button>
              ))}
            </span>
          </label>
          {identity.mode === "nickname" && (
            <label>
              Nickname
              <input value={identity.nickname} onChange={(e) => onChange({ ...identity, nickname: e.target.value.slice(0, 18) })} placeholder="e.g. MoonMoth" autoFocus />
              <small>{identity.nickname.length}/18 · visible only while you’re here</small>
            </label>
          )}
        </div>
        <button className="identity-done" onClick={onClose}>Appear as {identityLabel(identity)} <Icon name="arrow" size={16} /></button>
      </section>
    </div>
  );
}

export default function App() {
  const [entered, setEntered] = useState(false);
  const [sessionId] = useState(() => {
    try {
      const stored = sessionStorage.getItem("pulse_session_id");
      if (stored) return stored;
    } catch {}
    const fresh = crypto.randomUUID();
    try { sessionStorage.setItem("pulse_session_id", fresh); } catch {}
    return fresh;
  });

  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);
  const [peers, setPeers] = useState<Person[]>([]);
  const [mode, setMode] = useState<"roam" | "nearby" | "circles">("roam");
  const [selected, setSelected] = useState<Person | null>(null);
  const [conn, setConn] = useState<ConnState>({ kind: "idle" });
  const connRef = useRef<ConnState>(conn);
  connRef.current = conn;

  const [signal, setSignal] = useState<"open" | "curious" | "quiet">("curious");
  const [identity, setIdentity] = useState<UserIdentity>({ mode: "anonymous", tone: "green", nickname: "" });
  const [identityOpen, setIdentityOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visible, setVisible] = useState(true);

  const [messages, setMessages] = useState<Message[]>([]);
  const [callActive, setCallActive] = useState(false);
  const [videoActive, setVideoActive] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ type: "audio" | "video"; fromName: string; fromTone: AvatarTone } | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<{ type: "audio" | "video" } | null>(null);

  const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
  const [hosting, setHosting] = useState(false);
  const [serendipity, setSerendipity] = useState<"closed" | "scanning" | "found">("closed");
  const [serendipityMatch, setSerendipityMatch] = useState<Person | null>(null);

  const peerSessionRef = useRef<PeerSession | null>(null);
  const circleSignalRef = useRef<((sig: SignalMsg) => void) | null>(null);
  const requestTimeoutRef = useRef<number | null>(null);
  const serendipityTimer = useRef<number | null>(null);

  function showNotice(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 3500);
  }

  function teardownConnection(reason?: string) {
    if (requestTimeoutRef.current) clearTimeout(requestTimeoutRef.current);
    peerSessionRef.current?.close();
    peerSessionRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallActive(false);
    setVideoActive(false);
    setIncomingCall(null);
    setOutgoingCall(null);
    setMessages([]);
    setConn({ kind: "idle" });
    if (reason) showNotice(reason);
  }

  function initPeerSession(peer: Person, isInitiator: boolean) {
    if (peerSessionRef.current) {
      peerSessionRef.current.close();
    }

    const session = new PeerSession(isInitiator, {
      onSignal: (type: DescType, payload: string) => {
        void sendSignal(sessionId, peer.id, type, payload);
      },
      onChat: (text: string) => {
        setMessages((prev) => [...prev, { id: Date.now(), text, mine: false }]);
      },
      onControl: (ctrl: PeerControl) => {
        if (ctrl === "call-request") {
          setIncomingCall({
            type: "audio",
            fromName: peer.nickname || peer.city || "Stranger",
            fromTone: peer.tone,
          });
        } else if (ctrl === "call-accept") {
          session.startAudio().then((stream) => {
            setLocalStream(stream);
            setCallActive(true);
            setOutgoingCall(null);
            showNotice("Voice call connected! Speak freely.");
          }).catch(() => {
            session.sendControl("call-decline");
            setOutgoingCall(null);
            showNotice("Microphone permission required for voice call.");
          });
        } else if (ctrl === "call-decline") {
          setOutgoingCall(null);
          showNotice("Voice call declined by stranger.");
        } else if (ctrl === "call-end") {
          session.stopAudio();
          setCallActive(false);
          showNotice("Voice call ended.");
        } else if (ctrl === "video-request") {
          setIncomingCall({
            type: "video",
            fromName: peer.nickname || peer.city || "Stranger",
            fromTone: peer.tone,
          });
        } else if (ctrl === "video-accept") {
          session.startVideo().then((stream) => {
            setLocalStream(stream);
            setVideoActive(true);
            setOutgoingCall(null);
            showNotice("Video call connected!");
          }).catch(() => {
            session.sendControl("video-decline");
            setOutgoingCall(null);
            showNotice("Camera permission required for video call.");
          });
        } else if (ctrl === "video-decline") {
          setOutgoingCall(null);
          showNotice("Video call declined by stranger.");
        } else if (ctrl === "video-end") {
          session.stopVideo();
          setVideoActive(false);
          showNotice("Video call ended.");
        }
      },
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
      },
      onConnectionState: (state) => {
        if (state === "failed" || state === "closed" || state === "disconnected") {
          teardownConnection("Stranger disconnected.");
        }
      },
      onChannelOpen: () => {
        setConn({ kind: "connected", peer });
      },
      onChannelClose: () => {
        teardownConnection("Stranger left the chat.");
      },
    });

    peerSessionRef.current = session;
  }

  function handleSignalMessage(sig: SignalMsg) {
    if (sig.payload) {
      try {
        const data = JSON.parse(sig.payload);
        if (data.circle && circleSignalRef.current) {
          circleSignalRef.current(sig);
          return;
        }
      } catch {}
    }

    const current = connRef.current;
    switch (sig.type) {
      case "request": {
        if (current.kind === "idle") {
          let meta: any = null;
          try {
            if (sig.payload) meta = JSON.parse(sig.payload);
          } catch {}

          const fromPeer = peers.find((p) => p.id === sig.fromId) || {
            id: sig.fromId,
            city: meta?.city || "A fellow stranger",
            country: meta?.country || "Earth",
            distance: meta?.distance || "nearby",
            lat: meta?.lat || 0,
            lng: meta?.lng || 0,
            signal: (meta?.signal as any) || "curious",
            match: 88,
            energy: "Warm & spontaneous",
            tags: meta?.tags || ["online", "ready to talk"],
            prompt: meta?.prompt || "Say hi!",
            tone: (meta?.tone as AvatarTone) || "violet",
            nickname: meta?.nickname || "",
          };
          setConn({ kind: "incoming", peer: fromPeer });
        } else {
          void sendSignal(sessionId, sig.fromId, "decline");
        }
        break;
      }
      case "accept": {
        if (current.kind === "requesting" && current.peer.id === sig.fromId) {
          if (requestTimeoutRef.current) clearTimeout(requestTimeoutRef.current);
          initPeerSession(current.peer, true);
          setConn({ kind: "connecting", peer: current.peer });
        }
        break;
      }
      case "decline": {
        if (current.kind === "requesting" && current.peer.id === sig.fromId) {
          teardownConnection("Signal declined by stranger.");
        }
        break;
      }
      case "offer":
      case "answer":
      case "ice": {
        if (peerSessionRef.current && (current.kind === "connecting" || current.kind === "connected")) {
          void peerSessionRef.current.handleSignal(sig.type as DescType, sig.payload || "");
        }
        break;
      }
      case "end": {
        if (
          (current.kind === "incoming" || current.kind === "connecting" || current.kind === "connected") &&
          current.peer.id === sig.fromId
        ) {
          teardownConnection("Stranger disconnected.");
        }
        break;
      }
    }
  }

  // Polling loop for presence & signaling
  useEffect(() => {
    if (!entered || !sessionId) return;
    let active = true;
    let timer: number | null = null;

    const tick = async () => {
      try {
        const data = await poll(sessionId, {
          lat: myLocation ? myLocation[0] : undefined,
          lng: myLocation ? myLocation[1] : undefined,
          signal,
          tone: identity.tone,
          nickname: identity.nickname,
          invisible: !visible,
          circle: selectedCircle ? selectedCircle.title : undefined,
        });

        if (!active) return;

        const mappedPeers: Person[] = data.peers.map((p) => ({
          id: p.id,
          city: p.city || "Earth",
          country: p.country || "Global",
          distance: p.distance || "nearby",
          distanceKm: p.distanceKm,
          lat: p.lat,
          lng: p.lng,
          signal: p.signal || "curious",
          match: p.match ?? 80,
          energy: p.energy || "Electric & searching",
          tags: p.tags || ["curious", "open"],
          prompt: p.prompt || "Say hi!",
          tone: p.tone || "green",
          nickname: p.nickname,
          busy: p.busy,
          circle: p.circle || null,
        }));

        setPeers(mappedPeers);

        for (const s of data.signals) {
          handleSignalMessage(s);
        }
      } catch {}

      if (active) {
        // Poll faster when visible (1.5 s), slower when invisible (8 s)
        timer = window.setTimeout(tick, visible ? 1500 : 8000);
      }
    };

    tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [entered, sessionId, myLocation, signal, identity, visible, selectedCircle]);


  // Tab close beacon — send leave + notify active peer
  useEffect(() => {
    if (!entered || !sessionId) return;
    const onLeave = () => {
      const activePeerId = connRef.current.kind !== "idle" ? connRef.current.peer.id : undefined;
      leave(sessionId, activePeerId);
    };
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [entered, sessionId]);

  async function handleEnter(coords?: { lat: number; lng: number }) {
    const fallbackCities = [
      { lat: 14.5995, lng: 120.9842 }, // Manila
      { lat: 35.6762, lng: 139.6503 }, // Tokyo
      { lat: 40.7128, lng: -74.006 },  // New York
      { lat: 51.5074, lng: -0.1278 },  // London
      { lat: 48.8566, lng: 2.3522 },   // Paris
      { lat: 1.3521, lng: 103.8198 },  // Singapore
      { lat: -33.8688, lng: 151.2093 },// Sydney
    ];
    const picked = fallbackCities[Math.floor(Math.random() * fallbackCities.length)];
    const lat = coords?.lat ?? picked.lat;
    const lng = coords?.lng ?? picked.lng;

    setMyLocation([lat, lng]);
    try {
      await join(sessionId, lat, lng, {
        signal,
        tone: identity.tone,
        nickname: identity.nickname,
      });
    } catch {}
    setEntered(true);
  }

  function startConnect(peer: Person) {
    if (conn.kind !== "idle") return;
    setConn({ kind: "requesting", peer });
    const payload = JSON.stringify({
      nickname: identity.nickname || "",
      tone: identity.tone,
      signal,
      prompt: signalCopy[signal],
      city: "Nearby",
      lat: myLocation ? myLocation[0] : undefined,
      lng: myLocation ? myLocation[1] : undefined,
    });
    void sendSignal(sessionId, peer.id, "request", payload);

    requestTimeoutRef.current = window.setTimeout(() => {
      if (connRef.current.kind === "requesting" && connRef.current.peer.id === peer.id) {
        void sendSignal(sessionId, peer.id, "end");
        teardownConnection("No answer from pulse.");
      }
    }, 25000);
  }

  function acceptIncoming() {
    if (conn.kind !== "incoming") return;
    const caller = conn.peer;
    initPeerSession(caller, false);
    void sendSignal(sessionId, caller.id, "accept");
    setConn({ kind: "connecting", peer: caller });
  }

  function declineIncoming() {
    if (conn.kind !== "incoming") return;
    void sendSignal(sessionId, conn.peer.id, "decline");
    setConn({ kind: "idle" });
  }

  function sendChatMessage(text: string) {
    if (!peerSessionRef.current) return;
    peerSessionRef.current.sendChat(text);
    setMessages((prev) => [...prev, { id: Date.now(), text, mine: true }]);
  }

  function startAudioCall() {
    if (!peerSessionRef.current) return;
    peerSessionRef.current.sendControl("call-request");
    setOutgoingCall({ type: "audio" });
  }

  function acceptAudioCall() {
    if (!peerSessionRef.current) return;
    setIncomingCall(null);
    peerSessionRef.current
      .startAudio()
      .then((stream) => {
        setLocalStream(stream);
        setCallActive(true);
        peerSessionRef.current?.sendControl("call-accept");
        showNotice("Voice call connected! Speak freely.");
      })
      .catch(() => {
        peerSessionRef.current?.sendControl("call-decline");
        showNotice("Microphone permission required for voice call.");
      });
  }

  function declineAudioCall() {
    if (peerSessionRef.current) {
      peerSessionRef.current.sendControl("call-decline");
    }
    setIncomingCall(null);
  }

  function endAudioCall() {
    if (peerSessionRef.current) {
      peerSessionRef.current.stopAudio();
      peerSessionRef.current.sendControl("call-end");
    }
    setCallActive(false);
    showNotice("Voice call ended.");
  }

  function startVideoCall() {
    if (!peerSessionRef.current) return;
    peerSessionRef.current.sendControl("video-request");
    setOutgoingCall({ type: "video" });
  }

  function acceptVideoCall() {
    if (!peerSessionRef.current) return;
    setIncomingCall(null);
    peerSessionRef.current
      .startVideo()
      .then((stream) => {
        setLocalStream(stream);
        setVideoActive(true);
        peerSessionRef.current?.sendControl("video-accept");
        showNotice("Video call connected!");
      })
      .catch(() => {
        peerSessionRef.current?.sendControl("video-decline");
        showNotice("Camera permission required for video call.");
      });
  }

  function declineVideoCall() {
    if (peerSessionRef.current) {
      peerSessionRef.current.sendControl("video-decline");
    }
    setIncomingCall(null);
  }

  function toggleVideo() {
    if (!peerSessionRef.current) return;
    if (videoActive) {
      peerSessionRef.current.stopVideo();
      peerSessionRef.current.sendControl("video-end");
      setVideoActive(false);
      showNotice("Video call ended.");
    } else {
      startVideoCall();
    }
  }

  function startSerendipity() {
    if (peers.length === 0) {
      setFiltersOpen(true);
      return;
    }
    if (serendipityTimer.current) clearTimeout(serendipityTimer.current);
    setSerendipity("scanning");
    serendipityTimer.current = window.setTimeout(() => {
      const liveMatch = peers[Math.floor(Math.random() * peers.length)];
      setSerendipityMatch(liveMatch ?? null);
      setSerendipity(liveMatch ? "found" : "closed");
    }, 1800);
  }

  const activePeople = useMemo(() => peers.filter((p) => p.signal === signal).length, [peers, signal]);

  if (!entered) return <Welcome onEnter={handleEnter} />;

  return (
    <main className={`app-shell mode-${mode}`}>
      <SpatialBackground />
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      {notice && (
        <div style={{ position: "fixed", top: "96px", left: "50%", transform: "translateX(-50%)", zIndex: 120, background: "rgba(10,14,26,0.92)", border: "1px solid var(--line)", padding: "10px 18px", borderRadius: "999px", fontSize: "11px", color: "white", backdropFilter: "blur(18px)", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
          {notice}
        </div>
      )}

      <header className="topbar">
        <Brand />
        <div className="live-count"><i /> {peers.length === 0 ? "You are the first online" : `${peers.length} active pulses online`}</div>
        <div className="mode-tabs">
          <button className={mode === "roam" ? "active" : ""} onClick={() => { setMode("roam"); setSelected(null); setSelectedCircle(null); }}>
            <Icon name="compass" size={15} /> Roam
          </button>
          <button className={mode === "nearby" ? "active" : ""} onClick={() => { setMode("nearby"); setSelected(null); setSelectedCircle(null); }}>
            <Icon name="pin" size={15} /> Near you ({peers.length})
          </button>
          <button className={mode === "circles" ? "active" : ""} onClick={() => { setMode("circles"); setSelected(null); setSelectedCircle(null); }}>
            <Icon name="users" size={15} /> Circles
          </button>
        </div>
        <nav>
          <button className="nav-link" onClick={() => setFiltersOpen(!filtersOpen)}><Icon name="users" size={16} /> Frequency mode</button>
          <button className="serendipity-button" onClick={startSerendipity}><Icon name="spark" size={15} /> Surprise me</button>
          <button className="identity-button" onClick={() => setIdentityOpen(true)} aria-label="Change your identity">
            <AlienFace tone={identity.tone} />
            <span><small>Appearing as</small>{identityLabel(identity)}</span>
          </button>
          <button className={`visibility-button ${visible ? "online" : ""}`} onClick={() => setVisible(!visible)}>
            <i /> {visible ? "Available" : "Invisible"}
          </button>
        </nav>
      </header>

      <div className="mobile-actions">
        <button className="mobile-identity" onClick={() => setIdentityOpen(true)}><AlienFace tone={identity.tone} /></button>
        <button className="mobile-surprise" onClick={startSerendipity}><Icon name="spark" size={17} /></button>
        <button className={visible ? "mobile-visible online" : "mobile-visible"} onClick={() => setVisible(!visible)}><i /></button>
      </div>

      {mode === "roam" && (
        <section className="hero-copy">
          <span className="eyebrow"><i /> Live around the world</span>
          <h1>Someone, somewhere,<br /><em>right now.</em></h1>
          <p>Tap any dot on the globe to send an encrypted WebRTC pulse. When you leave, it all vanishes.</p>
        </section>
      )}

      {mode === "roam" && (
        <section className="signal-card">
          <div className="signal-card-head">
            <span>Your signal frequency</span>
            <i />
          </div>
          <div className="signal-options">
            {(["open", "curious", "quiet"] as const).map((option) => (
              <button className={signal === option ? "active" : ""} key={option} onClick={() => setSignal(option)}>
                <span className={`signal-glyph ${option}`} />
                <span><strong>{signalCopy[option]}</strong><small>{option === "open" ? "Open conversation" : option === "curious" ? "Follow your curiosity" : "One fleeting idea"}</small></span>
                {signal === option && <Icon name="check" size={16} />}
              </button>
            ))}
          </div>
          <p><Icon name="users" size={14} /> {activePeople} {activePeople === 1 ? "stranger shares" : "strangers share"} your frequency</p>
        </section>
      )}

      {mode === "roam" && (
        <div className="world-label">
          <Icon name="globe" size={15} />
          <span>Drag to explore</span>
          <i />
          <span>Tap a pulse to connect</span>
        </div>
      )}

      {mode === "roam" && (
        <Globe
          peers={peers}
          selected={selected}
          onSelect={(p) => setSelected(p)}
          identity={identity}
          myLocation={myLocation}
        />
      )}

      {mode === "nearby" && (
        <NearbyView peers={peers} onSelect={(p) => { setSelected(p); }} />
      )}

      {mode === "circles" && !selectedCircle && (
        <CirclesView onJoin={setSelectedCircle} onHost={() => setHosting(true)} />
      )}

      {mode === "circles" && selectedCircle && (
        <CircleRoom
          circle={selectedCircle}
          peers={peers}
          sessionId={sessionId}
          identity={identity}
          circleSignalRef={circleSignalRef}
          showNotice={showNotice}
          onLeave={() => setSelectedCircle(null)}
        />
      )}

      {/* Selected Person Card Modal */}
      {selected && conn.kind === "idle" && (
        <aside className="person-card">
          <button className="card-close" onClick={() => setSelected(null)}><Icon name="close" size={16} /></button>
          <div className="person-orb"><AlienFace tone={selected.tone} /><i /></div>
          <span className="match-label">{selected.nickname || "An anonymous pulse"} near</span>
          <h2>{selected.city}</h2>
          <p>{selected.country} · {selected.distance}</p>
          <div className="compatibility">
            <strong>{selected.match}%</strong>
            <span>frequency<br />resonance</span>
            <i><b style={{ width: `${selected.match}%` }} /></i>
          </div>
          <div className="frequency-match">
            <span className={`signal-glyph ${selected.signal}`} />
            <span><small>Their signal</small><strong>{signalCopy[selected.signal]}</strong></span>
          </div>
          <div className="person-tags">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <blockquote>“{selected.prompt}”</blockquote>
          <button className="connect-button" onClick={() => startConnect(selected)}>
            Send a signal <Icon name="arrow" />
          </button>
          <small className="microcopy"><Icon name="lock" size={12} /> Peer-to-peer WebRTC connection</small>
        </aside>
      )}

      {/* Requesting State */}
      {conn.kind === "requesting" && (
        <div className="modal-backdrop">
          <aside className="person-card" style={{ position: "relative", right: "auto", top: "auto", transform: "none" }}>
            <div className="person-orb"><AlienFace tone={conn.peer.tone} /><i /></div>
            <h2>Connecting with {conn.peer.city}…</h2>
            <p>Waiting for stranger to accept your signal</p>
            <div style={{ margin: "20px auto" }} className="loader" />
            <button className="connect-button" style={{ background: "rgba(255,255,255,0.08)", color: "white" }} onClick={() => teardownConnection("Request cancelled.")}>
              Cancel request
            </button>
          </aside>
        </div>
      )}

      {/* Incoming Connection Prompt */}
      {conn.kind === "incoming" && (
        <div className="modal-backdrop">
          <aside className="person-card" style={{ position: "relative", right: "auto", top: "auto", transform: "none", animation: "revealcopy .4s ease" }}>
            <div className="person-orb"><AlienFace tone={conn.peer.tone} /><i /></div>
            <span className="match-label">Incoming signal from</span>
            <h2>{conn.peer.city}</h2>
            <p>{conn.peer.distance} · {signalCopy[conn.peer.signal]}</p>
            <blockquote>“{conn.peer.prompt}”</blockquote>
            <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
              <button className="connect-button" onClick={acceptIncoming}>
                Accept <Icon name="check" size={16} />
              </button>
              <button className="connect-button" style={{ background: "rgba(255,255,255,0.08)", color: "white" }} onClick={declineIncoming}>
                Decline
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Connected Chat & Video Panel */}
      {(conn.kind === "connecting" || conn.kind === "connected") && (
        <ChatPanel
          person={conn.peer}
          messages={messages}
          onSendMessage={sendChatMessage}
          onStartAudioCall={startAudioCall}
          onEndAudioCall={endAudioCall}
          callActive={callActive}
          onToggleVideo={toggleVideo}
          videoActive={videoActive}
          localStream={localStream}
          remoteStream={remoteStream}
          onClose={() => teardownConnection("Conversation ended.")}
          isConnecting={conn.kind === "connecting"}
        />
      )}

      {/* Incoming Call Prompt (Audio or Video) */}
      {incomingCall && (
        <div className="modal-backdrop" style={{ zIndex: 120 }}>
          <section className="call-modal">
            <div className="call-modal-orb">
              <AlienFace tone={incomingCall.fromTone} />
            </div>
            <h3>Incoming {incomingCall.type === "audio" ? "Voice" : "Video"} Call</h3>
            <p>From <strong>{incomingCall.fromName}</strong></p>
            <div className="call-modal-actions">
              <button
                className="call-btn-accept"
                onClick={incomingCall.type === "audio" ? acceptAudioCall : acceptVideoCall}
              >
                <Icon name={incomingCall.type === "audio" ? "phone" : "camera"} size={16} />
                Accept {incomingCall.type === "audio" ? "Voice" : "Video"}
              </button>
              <button
                className="call-btn-decline"
                onClick={incomingCall.type === "audio" ? declineAudioCall : declineVideoCall}
              >
                <Icon name="close" size={16} />
                Decline
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Outgoing Call Waiting Prompt */}
      {outgoingCall && (
        <div className="modal-backdrop" style={{ zIndex: 120 }}>
          <section className="call-modal">
            <div className="call-modal-orb">
              <AlienFace tone={conn.kind !== "idle" ? conn.peer.tone : "violet"} />
            </div>
            <h3>Calling {conn.kind !== "idle" ? (conn.peer.nickname || conn.peer.city) : "Stranger"}…</h3>
            <p>Waiting for stranger to accept your {outgoingCall.type === "audio" ? "voice" : "video"} call</p>
            <div style={{ margin: "16px auto" }} className="loader" />
            <button
              className="connect-button"
              style={{ background: "rgba(255,255,255,0.08)", color: "white" }}
              onClick={() => {
                if (peerSessionRef.current) {
                  peerSessionRef.current.sendControl(outgoingCall.type === "audio" ? "call-end" : "video-end");
                }
                setOutgoingCall(null);
                showNotice("Call cancelled.");
              }}
            >
              Cancel Call
            </button>
          </section>
        </div>
      )}

      {filtersOpen && (
        <div className="toast">
          <span><Icon name="spark" /></span>
          <div>
            <strong>Frequency alignment active</strong>
            <p>Currently tuning to &ldquo;{signalCopy[signal]}&rdquo;. Switch frequencies anytime to find peers on the same wave.</p>
          </div>
          <button onClick={() => setFiltersOpen(false)}><Icon name="close" size={15} /></button>
        </div>
      )}

      {hosting && (
        <HostCircle
          onClose={() => setHosting(false)}
          onStart={(circle) => {
            setHosting(false);
            setSelectedCircle(circle);
          }}
        />
      )}

      {serendipity !== "closed" && (
        <Serendipity
          state={serendipity}
          match={serendipityMatch}
          onClose={() => setSerendipity("closed")}
          onRetry={startSerendipity}
          onChoose={() => {
            if (serendipityMatch) {
              setSerendipity("closed");
              setMode("roam");
              setSelected(serendipityMatch);
              startConnect(serendipityMatch);
            }
          }}
        />
      )}

      {identityOpen && <IdentityPanel identity={identity} onChange={setIdentity} onClose={() => setIdentityOpen(false)} />}

      <footer>
        <span><Icon name="lock" size={13} /> End-to-end, peer-to-peer WebRTC</span>
        <p>Your presence fades the moment you close the tab.</p>
        <span>Live network connected</span>
      </footer>
    </main>
  );
}
