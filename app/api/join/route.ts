import type { NextRequest } from "next/server";
import { isValidLatLng } from "@/lib/geo";
import { registerPresence } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/join — body { id, lat, lng, signal?, tone?, nickname? }
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { id, lat, lng, signal, tone, nickname } = (body ?? {}) as Record<string, unknown>;

  if (typeof id !== "string" || id.length < 8 || id.length > 64) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  if (!isValidLatLng(lat, lng)) {
    return Response.json({ error: "invalid coordinates" }, { status: 400 });
  }

  const validSignal =
    signal === "open" || signal === "curious" || signal === "quiet"
      ? (signal as "open" | "curious" | "quiet")
      : "curious";
  const validTone =
    tone === "green" || tone === "violet" || tone === "cyan" || tone === "rose" || tone === "amber"
      ? (tone as "green" | "violet" | "cyan" | "rose" | "amber")
      : "green";
  const validNickname = typeof nickname === "string" ? nickname.slice(0, 24) : "";

  const record = await registerPresence(id, lat as number, lng as number, {
    signal: validSignal,
    tone: validTone,
    nickname: validNickname,
  });

  return Response.json({
    ok: true,
    me: {
      id: record.id,
      lat: record.lat,
      lng: record.lng,
      city: record.city,
      country: record.country,
      signal: record.signal,
      tone: record.tone,
      nickname: record.nickname,
    },
  });
}

