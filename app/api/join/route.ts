import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyPrivacyOffset, isValidLatLng } from "@/lib/geo";
import { parseIdentity } from "@/lib/identity";
import type { IdentityProfile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/join — body { id, lat, lng } (raw coords).
// Applies a 1–3 km privacy offset and upserts the presence row. Raw
// coordinates are never stored.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { id, lat, lng } = (body ?? {}) as Record<string, unknown>;
  const bodyRecord = (body ?? {}) as Record<string, unknown>;

  if (typeof id !== "string" || id.length < 8 || id.length > 64) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  if (!isValidLatLng(lat, lng)) {
    return Response.json({ error: "invalid coordinates" }, { status: 400 });
  }

  const hasIdentity =
    "identityMode" in bodyRecord ||
    "avatarTone" in bodyRecord ||
    "nickname" in bodyRecord;
  const profile = hasIdentity
    ? parseIdentity(bodyRecord)
    : ({
        identityMode: "anonymous",
        avatarTone: "green",
        nickname: "",
      } satisfies IdentityProfile);
  if (!profile) {
    return Response.json({ error: "invalid identity" }, { status: 400 });
  }
  if (profile.identityMode === "nickname" && profile.nickname) {
    const occupied = await prisma.presence.findMany({
      where: { id: { not: id as string }, identityMode: "nickname", nickname: { not: null } },
      select: { nickname: true },
    });
    if (occupied.some((person) => person.nickname?.toLocaleLowerCase() === profile.nickname.toLocaleLowerCase())) {
      return Response.json({ error: "That nickname is already in use. Choose another." }, { status: 409 });
    }
  }

  const offset = applyPrivacyOffset(lat as number, lng as number);

  await prisma.presence.upsert({
    where: { id },
    create: {
      id,
      lat: offset.lat,
      lng: offset.lng,
      busy: false,
      lastSeen: new Date(),
      ...profile,
    },
    update: {
      lat: offset.lat,
      lng: offset.lng,
      lastSeen: new Date(),
      ...profile,
    },
  });

  return Response.json({ ok: true });
}
