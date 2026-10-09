// Client-side helpers for talking to the coordination API.
import type { PollResponse, SignalType } from "@/lib/types";

export async function join(
  id: string,
  lat: number,
  lng: number,
  meta?: {
    signal?: "open" | "curious" | "quiet";
    tone?: "green" | "violet" | "cyan" | "rose" | "amber";
    nickname?: string;
  }
): Promise<{ ok: boolean; me?: any }> {
  const res = await fetch("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, lat, lng, ...meta }),
  });
  if (!res.ok) throw new Error(`join failed: ${res.status}`);
  return res.json();
}

export async function poll(
  id: string,
  meta?: {
    lat?: number;
    lng?: number;
    signal?: "open" | "curious" | "quiet";
    tone?: "green" | "violet" | "cyan" | "rose" | "amber";
    nickname?: string;
  }
): Promise<PollResponse> {
  const query = new URLSearchParams({ id });
  if (meta?.lat !== undefined) query.set("lat", String(meta.lat));
  if (meta?.lng !== undefined) query.set("lng", String(meta.lng));
  if (meta?.signal) query.set("signal", meta.signal);
  if (meta?.tone) query.set("tone", meta.tone);
  if (meta?.nickname) query.set("nickname", meta.nickname);

  const res = await fetch(`/api/poll?${query.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`poll failed: ${res.status}`);
  return res.json();
}


export async function sendSignal(
  fromId: string,
  toId: string,
  type: SignalType,
  payload?: string,
): Promise<void> {
  await fetch("/api/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromId, toId, type, payload }),
  });
}

// Fire-and-forget leave that survives the tab closing.
export function leave(id: string): void {
  const body = JSON.stringify({ id });
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
