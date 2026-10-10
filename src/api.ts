// ── Types ──────────────────────────────────────────────────────────────────

export type SignalType =
  | "request"
  | "accept"
  | "decline"
  | "offer"
  | "answer"
  | "ice"
  | "end";

export interface PeerDot {
  id: string;
  lat: number;
  lng: number;
  busy: boolean;
  signal?: "open" | "curious" | "quiet";
  tone?: "green" | "violet" | "cyan" | "rose" | "amber";
  nickname?: string;
  city?: string;
  country?: string;
  prompt?: string;
  tags?: string[];
  distance?: string;
  distanceKm?: number;
  match?: number;
  energy?: string;
  circle?: string | null;
}

export interface SignalMsg {
  id: string;
  fromId: string;
  toId: string;
  type: SignalType;
  payload: string | null;
  createdAt: string;
}

export interface PollResponse {
  peers: PeerDot[];
  signals: SignalMsg[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
  }
  return res.json() as Promise<T>;
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function join(
  id: string,
  lat: number,
  lng: number,
  meta?: {
    signal?: "open" | "curious" | "quiet";
    tone?: "green" | "violet" | "cyan" | "rose" | "amber";
    nickname?: string;
  }
): Promise<{ ok: boolean; me?: PeerDot }> {
  return fetchJSON("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, lat, lng, ...meta }),
  });
}

export async function poll(
  id: string,
  meta?: {
    lat?: number;
    lng?: number;
    signal?: "open" | "curious" | "quiet";
    tone?: "green" | "violet" | "cyan" | "rose" | "amber";
    nickname?: string;
    invisible?: boolean;
    circle?: string;
  }
): Promise<PollResponse> {
  const query = new URLSearchParams({ id });
  if (meta?.lat !== undefined) query.set("lat", String(meta.lat));
  if (meta?.lng !== undefined) query.set("lng", String(meta.lng));
  if (meta?.signal) query.set("signal", meta.signal);
  if (meta?.tone) query.set("tone", meta.tone);
  if (meta?.nickname) query.set("nickname", meta.nickname);
  if (meta?.invisible) query.set("invisible", "true");
  if (meta?.circle) query.set("circle", meta.circle);

  return fetchJSON(`/api/poll?${query.toString()}`);
}

export async function sendSignal(
  fromId: string,
  toId: string,
  type: SignalType,
  payload?: string | null
): Promise<{ ok: boolean; autoDeclined?: boolean }> {
  return fetchJSON("/api/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromId, toId, type, payload: payload ?? null }),
  });
}

/**
 * Fire-and-forget leave beacon. Accepts an optional peerId to notify the
 * connected peer via the server-side 'end' signal on clean disconnects.
 */
export function leave(id: string, peerId?: string): void {
  const body = JSON.stringify({ id, peerId: peerId ?? null });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/leave", body);
  } else {
    void fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  }
}
