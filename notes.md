# Pulse — Architecture and Feature Notes

Live: https://pulse-eta-silk.vercel.app
Repo: https://github.com/IrishMancera/pulse

---

## What is Pulse?

Pulse is an ephemeral, location-aware social layer built on peer-to-peer WebRTC. Users appear on a live world map, connect with nearby strangers for audio/video calls, and leave zero trace when they close the tab. No accounts. No history. No data retention.

---

## Tech Stack

- Framework: Next.js 16.2.7 (App Router, Turbopack)
- Language: TypeScript 5
- Styling: Vanilla CSS (globals.css) — galaxy/glassmorphism theme
- Database (local): SQLite via better-sqlite3 + Prisma adapter
- Database (production): PostgreSQL (optional — falls back to SQLite)
- ORM: Prisma 7 (dual-schema)
- Maps: MapLibre GL JS
- Real-time comms: WebRTC (peer-to-peer, no media server)
- Signaling: Polling-based REST API
- Deployment: Vercel (serverless)

---

## Directory Structure

app/
  page.tsx              Main workspace — map, circles list, controls
  layout.tsx            Root layout (font, metadata)
  globals.css           Full design system: galaxy theme, animations
  global-error.tsx      Next.js 16 global error boundary
  api/
    join/               POST register presence / GET own profile
    leave/              POST remove presence
    poll/               GET fetch pending signals
    signal/             POST send WebRTC signal
    circles/            GET list active circles
    circles/[roomId]/   GET members of a circle
    profile/            GET/PATCH identity prefs
  components/
    EntryGate.tsx        Landing page with alien mascot + tractor beam
    IdentityPanel.tsx    Nickname / avatar tone / anonymous vs named
    WorldMap.tsx         MapLibre GL map with live presence dots
    CircleLobby.tsx      Browse and join named topic circles
    CircleCall.tsx       Active group call UI (video grid + chat)
    ChatPanel.tsx        Shared chat component used in calls
    ConnectionPrompt.tsx Accept/decline incoming peer connection
    VideoPanel.tsx       Individual video tile with mute/cam controls

lib/
  api.ts          Client-side fetch helpers for all API routes
  webrtc.ts       WebRTC peer connection lifecycle management
  presence.ts     Heartbeat loop — keeps user alive on the map
  identity.ts     Session identity (localStorage-backed, anonymous by default)
  geo.ts          Privacy-offset geolocation (blurs raw coords before storing)
  types.ts        Shared TypeScript interfaces
  prisma.ts       Prisma client singletons (postgres + sqlite)

prisma/
  schema.prisma           PostgreSQL schema (Presence, Signal models)
  schema.sqlite.prisma    SQLite mirror for local dev
  prisma.config.ts        Prisma 7 config — auto-selects schema by DATABASE_URL
  migrations/             SQL migration history

---

## Core Features

1. Ephemeral Identity — no sign-up, UUID session in localStorage, anonymous by default
2. Privacy-First Geolocation — raw GPS is never stored; a ~1-5 km random offset is applied
3. Live World Map — MapLibre GL dark galaxy-style map with animated presence dots
4. Peer-to-Peer Calls — all audio/video is direct browser-to-browser, no media relay
5. Named Circles — topic-based rooms (e.g. music, night-owls) with group calls
6. Group Chat — WebRTC data channels, nothing stored server-side
7. Surprise Me — randomly connects you to any available peer on the map

---

## Data Models

Presence: id, lat, lng, busy, lastSeen, avatarTone, identityMode, nickname, circleId, circleKeyword
Signal: id, toId, fromId, type (request/accept/decline/offer/answer/ice/end), payload, createdAt

---

## API Routes

POST /api/join        Register presence
GET  /api/join        Fetch own profile
POST /api/leave       Remove self from map
GET  /api/poll        Poll for incoming signals
POST /api/signal      Send signal to peer
GET  /api/circles     List active circles
GET  /api/circles/[roomId]  Members of a circle
GET/PATCH /api/profile      Read/update identity

---

## WebRTC Signaling Flow

Caller sends request signal via /api/signal
Callee polls /api/poll and receives it
Callee accepts -> sends accept signal
Caller sends SDP offer, callee replies with answer
ICE candidates exchanged via /api/signal
Direct P2P connection established (audio, video, data channel)

---

## Design System

- Galaxy theme: deep space dark background (#050510) with CSS star-field animation
- Glassmorphism: frosted panels with backdrop-filter blur
- Colors: electric violet (#7c3aed), cyan (#00d4ff), magenta (#ff006e)
- Typography: Inter (Google Fonts)
- Animations: float, pulse, glow, orbit, tracerBeam keyframes
- Alien mascot: CSS SVG cartoon alien on landing page with hover tractor beam

---

## Deployment

Production URL: https://pulse-eta-silk.vercel.app
Build command: npm run db:generate && next build

Local dev:
  cp .env.example .env
  npm install
  npm run dev  (http://localhost:3000)

Environment variables:
  DATABASE_URL            Optional. PostgreSQL URL. Falls back to SQLite (file:./dev.db)
  NEXT_PUBLIC_MAPBOX_TOKEN  Optional. MapLibre map tile token.

---

## Known Limitations

- Signaling uses 1s polling; WebSockets/SSE would improve latency
- No TURN server — NAT traversal may fail for strict networks
- SQLite only works reliably on single-instance deployments; use Postgres for production scale
- No push notifications — tab must be open to receive connection requests
