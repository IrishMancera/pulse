import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { STALE_MS } from "@/lib/presence";
import { normalizeCircleKeyword, parseIdentity } from "@/lib/identity";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MEMBERS = 6;

async function activeRooms() {
  const members = await prisma.presence.findMany({
    where: {
      circleId: { not: null },
      lastSeen: { gte: new Date(Date.now() - STALE_MS) },
    },
    select: { id: true, circleId: true, circleKeyword: true },
  });
  const rooms = new Map<string, { keyword: string; ids: Set<string> }>();
  for (const member of members) {
    if (!member.circleId) continue;
    const room = rooms.get(member.circleId) ?? {
      keyword: member.circleKeyword ?? "OPEN",
      ids: new Set<string>(),
    };
    room.ids.add(member.id);
    rooms.set(member.circleId, room);
  }
  return rooms;
}

export async function GET() {
  const rooms = await activeRooms();
  return Response.json({
    circles: Array.from(rooms, ([circleId, room]) => ({
      circleId,
      keyword: room.keyword,
      memberCount: room.ids.size,
    })).sort((first, second) => second.memberCount - first.memberCount),
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const { id, mode, keyword } = input;
  if (
    typeof id !== "string" ||
    id.length < 8 ||
    (mode !== "create" && mode !== "join" && mode !== "random")
  ) {
    return Response.json({ error: "invalid circle request" }, { status: 400 });
  }
  const profile = parseIdentity(input);
  if (!profile) {
    return Response.json({ error: "invalid identity" }, { status: 400 });
  }

  const presence = await prisma.presence.findUnique({
    where: { id },
    select: { id: true, busy: true },
  });
  if (!presence) {
    return Response.json({ error: "join Pulse before entering a circle" }, { status: 409 });
  }
  if (presence.busy) {
    return Response.json({ error: "end your current conversation first" }, { status: 409 });
  }

  const rooms = await activeRooms();
  let circleId: string | null = null;
  let circleKeyword = "";

  if (mode === "create") {
    circleKeyword = typeof keyword === "string" ? normalizeCircleKeyword(keyword) : "";
    if (circleKeyword.length < 2) {
      return Response.json({ error: "enter a keyword with at least 2 characters" }, { status: 400 });
    }
    circleId = randomUUID();
  } else {
    const normalizedKeyword =
      mode === "join" && typeof keyword === "string"
        ? normalizeCircleKeyword(keyword)
        : null;
    const candidates = Array.from(rooms.entries()).filter(
      ([roomId, room]) =>
        room.ids.size < MAX_MEMBERS &&
        !room.ids.has(id) &&
        (!normalizedKeyword || room.keyword === normalizedKeyword),
    );
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];

    if (chosen) {
      circleId = chosen[0];
      circleKeyword = chosen[1].keyword;
    } else if (mode === "join") {
      return Response.json({ error: "no open circle uses that keyword" }, { status: 404 });
    } else {
      circleId = randomUUID();
      circleKeyword = `OPEN-${randomUUID().slice(0, 4).toUpperCase()}`;
    }
  }

  await prisma.presence.update({
    where: { id },
    data: { ...profile, busy: true, circleId, circleKeyword, lastSeen: new Date() },
  });

  return Response.json({
    circleId,
    keyword: circleKeyword,
    memberCount: (rooms.get(circleId)?.ids.size ?? 0) + 1,
  });
}