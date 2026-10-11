import type { NextRequest } from "next/server";
import { STALE_MS } from "@/lib/presence";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ roomId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { roomId } = await context.params;
  const sessionId = request.nextUrl.searchParams.get("id");
  if (sessionId) {
    const current = await prisma.presence.findUnique({
      where: { id: sessionId },
      select: { circleId: true },
    });
    if (current && current.circleId !== roomId) {
      return Response.json({ error: "not a member of this circle" }, { status: 403 });
    }
  }

  const members = await prisma.presence.findMany({
    where: {
      circleId: roomId,
      lastSeen: { gte: new Date(Date.now() - STALE_MS) },
    },
    select: {
      id: true,
      lat: true,
      lng: true,
      busy: true,
      identityMode: true,
      avatarTone: true,
      nickname: true,
      circleKeyword: true,
    },
    orderBy: { lastSeen: "desc" },
  });

  return Response.json({
    circleId: roomId,
    keyword: members[0]?.circleKeyword ?? "OPEN",
    members: members.map(({ circleKeyword: _keyword, ...member }) => member),
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { roomId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== "string") {
    return Response.json({ error: "invalid session id" }, { status: 400 });
  }

  await prisma.presence.updateMany({
    where: { id, circleId: roomId },
    data: { busy: false, circleId: null, circleKeyword: null },
  });
  return Response.json({ ok: true });
}