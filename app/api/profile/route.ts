import type { NextRequest } from "next/server";
import { parseIdentity } from "@/lib/identity";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const input = (body ?? {}) as Record<string, unknown>;
  if (typeof input.id !== "string" || input.id.length < 8) {
    return Response.json({ error: "invalid session id" }, { status: 400 });
  }
  const profile = parseIdentity(input);
  if (!profile) {
    return Response.json({ error: "invalid identity" }, { status: 400 });
  }

  if (profile.identityMode === "nickname" && profile.nickname) {
    const occupied = await prisma.presence.findMany({
      where: { id: { not: input.id }, identityMode: "nickname", nickname: { not: null } },
      select: { nickname: true },
    });
    if (occupied.some((person) => person.nickname?.toLocaleLowerCase() === profile.nickname.toLocaleLowerCase())) {
      return Response.json({ error: "That nickname is already in use. Choose another." }, { status: 409 });
    }
  }

  const result = await prisma.presence.updateMany({
    where: { id: input.id },
    data: profile,
  });
  if (result.count === 0) {
    return Response.json({ error: "session is no longer online" }, { status: 404 });
  }
  return Response.json({ ok: true });
}