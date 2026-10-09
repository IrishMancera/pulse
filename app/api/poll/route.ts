import type { NextRequest } from "next/server";
import { heartbeatPresence, drainSignals, getOnlinePeers } from "@/lib/store";
import type { PollResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/poll?id=&lat=&lng=&signal=&tone=&nickname=
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get("id");

  if (!id) {
    return Response.json({ error: "missing id" }, { status: 400 });
  }

  const signal = params.get("signal") as "open" | "curious" | "quiet" | null;
  const tone = params.get("tone") as "green" | "violet" | "cyan" | "rose" | "amber" | null;
  const nickname = params.get("nickname") ?? undefined;
  const latParam = params.get("lat");
  const lngParam = params.get("lng");
  const callerLat = latParam ? parseFloat(latParam) : undefined;
  const callerLng = lngParam ? parseFloat(lngParam) : undefined;

  // 1) Heartbeat
  await heartbeatPresence(id, {
    signal: signal || undefined,
    tone: tone || undefined,
    nickname,
  });

  // 2) Online peers with distance calculation
  const peers = await getOnlinePeers(
    id,
    callerLat && !isNaN(callerLat) ? callerLat : undefined,
    callerLng && !isNaN(callerLng) ? callerLng : undefined,
    signal || undefined
  );

  // 3) Drain mailbox
  const signals = await drainSignals(id);

  const response: PollResponse = {
    peers,
    signals,
  };

  return Response.json(response);
}

