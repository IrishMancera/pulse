// Client-side helpers for talking to the coordination API.
import type {
  CircleRoom,
  CircleSummary,
  IdentityProfile,
  PollResponse,
  SignalType,
} from "@/lib/types";

export async function join(
  id: string,
  lat: number,
  lng: number,
  profile?: IdentityProfile,
): Promise<void> {
  const response = await fetch("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, lat, lng, ...profile }),
  });
  if (!response.ok) throw new Error(`join failed: ${response.status}`);
}

export async function updateProfile(
  id: string,
  profile: IdentityProfile,
): Promise<void> {
  const response = await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...profile }),
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error ?? `profile update failed: ${response.status}`);
  }
}

export async function listCircles(): Promise<CircleSummary[]> {
  const response = await fetch("/api/circles", { cache: "no-store" });
  if (!response.ok) throw new Error(`circle list failed: ${response.status}`);
  const data = await response.json();
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.circles)) return data.circles;
  return [];
}

export async function enterCircle(
  id: string,
  mode: "create" | "join" | "random",
  keyword: string,
  profile: IdentityProfile,
): Promise<CircleSummary> {
  const response = await fetch("/api/circles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, mode, keyword, ...profile }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Couldn't enter the circle.");
  return result as CircleSummary;
}

export async function getCircle(circleId: string, id?: string): Promise<CircleRoom> {
  const url = id
    ? `/api/circles/${encodeURIComponent(circleId)}?id=${encodeURIComponent(id)}`
    : `/api/circles/${encodeURIComponent(circleId)}`;
  const response = await fetch(url, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`circle fetch failed: ${response.status}`);
  return response.json();
}

export async function leaveCircle(id: string, circleId: string): Promise<void> {
  await fetch(`/api/circles/${encodeURIComponent(circleId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
    keepalive: true,
  });
}

export async function poll(id: string): Promise<PollResponse> {
  const res = await fetch(`/api/poll?id=${encodeURIComponent(id)}`, {
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
