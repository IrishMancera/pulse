import { prisma } from "@/lib/prisma";
import { STALE_MS, SIGNAL_TTL_MS } from "@/lib/presence";
import { applyPrivacyOffset, calculateDistanceKm, getCityInfo } from "@/lib/geo";
import type { PeerDot, SignalMsg, SignalType } from "@/lib/types";

export interface PresenceRecord {
  id: string;
  lat: number;
  lng: number;
  busy: boolean;
  lastSeen: number;
  signal: "open" | "curious" | "quiet";
  tone: "green" | "violet" | "cyan" | "rose" | "amber";
  nickname: string;
  city: string;
  country: string;
  prompt: string;
  tags: string[];
}

export interface StoredSignal {
  id: string;
  fromId: string;
  toId: string;
  type: SignalType;
  payload: string | null;
  createdAt: number;
}

// Global in-memory fallback store for zero-dependency resilience and local/preview testing
const globalStore = globalThis as unknown as {
  __pulse_presences?: Map<string, PresenceRecord>;
  __pulse_signals?: StoredSignal[];
};

if (!globalStore.__pulse_presences) {
  globalStore.__pulse_presences = new Map();
}
if (!globalStore.__pulse_signals) {
  globalStore.__pulse_signals = [];
}

const memoryPresences = globalStore.__pulse_presences!;
let memorySignals = globalStore.__pulse_signals!;

export const SIGNAL_PROMPTS: Record<"open" | "curious" | "quiet", { prompt: string; tags: string[]; energy: string }> = {
  open: {
    prompt: "Ready to talk with anyone right now. Say hi!",
    tags: ["spontaneous", "open mic", "deep listening"],
    energy: "Warm & spontaneous",
  },
  curious: {
    prompt: "Tell me something unexpected about your corner of the world.",
    tags: ["wild ideas", "creative spark", "exploration"],
    energy: "Electric & searching",
  },
  quiet: {
    prompt: "Sharing an ambient thought into the night sky.",
    tags: ["ambient thoughts", "slow talk", "night vibes"],
    energy: "Calm & contemplative",
  },
};

export async function reapStale() {
  const now = Date.now();
  const staleCutoff = now - STALE_MS;
  const signalCutoff = now - SIGNAL_TTL_MS;

  // Memory reap
  for (const [id, record] of memoryPresences.entries()) {
    if (record.lastSeen < staleCutoff) {
      memoryPresences.delete(id);
    }
  }
  memorySignals = memorySignals.filter((s) => s.createdAt >= signalCutoff);
  globalStore.__pulse_signals = memorySignals;

  // DB reap (if available)
  try {
    await prisma.presence.deleteMany({
      where: { lastSeen: { lt: new Date(staleCutoff) } },
    });
    await prisma.signal.deleteMany({
      where: { createdAt: { lt: new Date(signalCutoff) } },
    });
  } catch {
    // Database optional/fallback mode
  }
}

export async function registerPresence(
  id: string,
  rawLat: number,
  rawLng: number,
  meta?: {
    signal?: "open" | "curious" | "quiet";
    tone?: "green" | "violet" | "cyan" | "rose" | "amber";
    nickname?: string;
  }
): Promise<PresenceRecord> {
  await reapStale();

  const offset = applyPrivacyOffset(rawLat, rawLng);
  const geo = getCityInfo(offset.lat, offset.lng);
  const chosenSignal = meta?.signal || "curious";
  const chosenTone = meta?.tone || "green";
  const chosenNick = meta?.nickname?.trim() || "";
  const info = SIGNAL_PROMPTS[chosenSignal];

  const record: PresenceRecord = {
    id,
    lat: offset.lat,
    lng: offset.lng,
    busy: false,
    lastSeen: Date.now(),
    signal: chosenSignal,
    tone: chosenTone,
    nickname: chosenNick,
    city: geo.city,
    country: geo.country,
    prompt: info.prompt,
    tags: info.tags,
  };

  memoryPresences.set(id, record);

  try {
    await prisma.presence.upsert({
      where: { id },
      create: {
        id,
        lat: record.lat,
        lng: record.lng,
        busy: false,
        lastSeen: new Date(),
      },
      update: {
        lat: record.lat,
        lng: record.lng,
        lastSeen: new Date(),
      },
    });
  } catch {
    // Falls back to in-memory store
  }

  return record;
}

export async function heartbeatPresence(
  id: string,
  meta?: {
    signal?: "open" | "curious" | "quiet";
    tone?: "green" | "violet" | "cyan" | "rose" | "amber";
    nickname?: string;
  }
) {
  const now = Date.now();
  const existing = memoryPresences.get(id);
  if (existing) {
    existing.lastSeen = now;
    if (meta?.signal) {
      existing.signal = meta.signal;
      const info = SIGNAL_PROMPTS[meta.signal];
      existing.prompt = info.prompt;
      existing.tags = info.tags;
    }
    if (meta?.tone) existing.tone = meta.tone;
    if (meta?.nickname !== undefined) existing.nickname = meta.nickname.trim();
  }

  try {
    await prisma.presence.updateMany({
      where: { id },
      data: { lastSeen: new Date(now) },
    });
  } catch {
    // In-memory fallback
  }
}

export async function leavePresence(id: string) {
  memoryPresences.delete(id);
  memorySignals = memorySignals.filter((s) => s.toId !== id && s.fromId !== id);
  globalStore.__pulse_signals = memorySignals;

  try {
    await prisma.signal.deleteMany({
      where: { OR: [{ toId: id }, { fromId: id }] },
    });
    await prisma.presence.deleteMany({ where: { id } });
  } catch {
    // In-memory fallback
  }
}

export async function setPeersBusy(ids: string[], busy: boolean) {
  for (const id of ids) {
    const p = memoryPresences.get(id);
    if (p) p.busy = busy;
  }

  try {
    await prisma.presence.updateMany({
      where: { id: { in: ids } },
      data: { busy },
    });
  } catch {
    // In-memory fallback
  }
}

export async function queueSignal(
  fromId: string,
  toId: string,
  type: SignalType,
  payload?: string | null
): Promise<{ ok: boolean; autoDeclined?: boolean }> {
  // If request, check if recipient is busy
  if (type === "request") {
    const target = memoryPresences.get(toId);
    if (!target) {
      // Offline
      await queueSignal(toId, fromId, "decline", null);
      return { ok: true, autoDeclined: true };
    }
    if (target.busy) {
      // Target busy
      await queueSignal(toId, fromId, "decline", null);
      return { ok: true, autoDeclined: true };
    }
  }

  if (type === "accept") {
    await setPeersBusy([fromId, toId], true);
  } else if (type === "decline" || type === "end") {
    await setPeersBusy([fromId, toId], false);
  }

  const sig: StoredSignal = {
    id: crypto.randomUUID(),
    fromId,
    toId,
    type,
    payload: payload || null,
    createdAt: Date.now(),
  };

  memorySignals.push(sig);
  globalStore.__pulse_signals = memorySignals;

  try {
    await prisma.signal.create({
      data: {
        id: sig.id,
        fromId: sig.fromId,
        toId: sig.toId,
        type: sig.type,
        payload: sig.payload,
      },
    });
  } catch {
    // In-memory fallback
  }

  return { ok: true };
}

export async function drainSignals(toId: string): Promise<SignalMsg[]> {
  const result: SignalMsg[] = [];
  const remaining: StoredSignal[] = [];

  for (const s of memorySignals) {
    if (s.toId === toId) {
      result.push({
        id: s.id,
        fromId: s.fromId,
        toId: s.toId,
        type: s.type,
        payload: s.payload,
        createdAt: new Date(s.createdAt).toISOString(),
      });
    } else {
      remaining.push(s);
    }
  }

  memorySignals = remaining;
  globalStore.__pulse_signals = memorySignals;

  try {
    const inbox = await prisma.signal.findMany({
      where: { toId },
      orderBy: { createdAt: "asc" },
    });
    if (inbox.length > 0) {
      await prisma.signal.deleteMany({
        where: { id: { in: inbox.map((s) => s.id) } },
      });
      // Combine if any signals came through DB that weren't in memory
      for (const row of inbox) {
        if (!result.some((r) => r.id === row.id)) {
          result.push({
            id: row.id,
            fromId: row.fromId,
            toId: row.toId,
            type: row.type as SignalType,
            payload: row.payload,
            createdAt: row.createdAt.toISOString(),
          });
        }
      }
    }
  } catch {
    // In-memory fallback
  }

  return result;
}

export async function getOnlinePeers(
  callerId: string,
  callerLat?: number,
  callerLng?: number,
  callerSignal?: "open" | "curious" | "quiet"
): Promise<PeerDot[]> {
  await reapStale();

  // Load from memory
  const peerList: PeerDot[] = [];
  const staleCutoff = Date.now() - STALE_MS;

  for (const [id, record] of memoryPresences.entries()) {
    if (id === callerId || record.lastSeen < staleCutoff) continue;

    let distKm = 0;
    let distanceStr = "nearby";
    if (
      callerLat !== undefined &&
      callerLng !== undefined &&
      !isNaN(callerLat) &&
      !isNaN(callerLng)
    ) {
      distKm = calculateDistanceKm(callerLat, callerLng, record.lat, record.lng);
      distanceStr = distKm <= 5 ? `about ${Math.max(1, distKm)} km away` : `${distKm.toLocaleString()} km away`;
    }

    // Alignment calculation
    let match = 70;
    if (callerSignal) {
      if (callerSignal === record.signal) match = 95;
      else if ((callerSignal === "open" && record.signal === "curious") || (callerSignal === "curious" && record.signal === "open")) match = 85;
      else match = 78;
    }

    const info = SIGNAL_PROMPTS[record.signal];

    peerList.push({
      id: record.id,
      lat: record.lat,
      lng: record.lng,
      busy: record.busy,
      signal: record.signal,
      tone: record.tone,
      nickname: record.nickname,
      city: record.city,
      country: record.country,
      prompt: record.prompt || info.prompt,
      tags: record.tags || info.tags,
      distance: distanceStr,
      distanceKm: distKm,
      match,
      energy: info.energy,
    });
  }

  // Also query DB for any peers registered on other serverless instances
  try {
    const dbPeers = await prisma.presence.findMany({
      where: {
        id: { not: callerId },
        lastSeen: { gte: new Date(staleCutoff) },
      },
    });

    for (const p of dbPeers) {
      if (!peerList.some((existing) => existing.id === p.id)) {
        const geo = getCityInfo(p.lat, p.lng);
        let distKm = 0;
        let distanceStr = "nearby";
        if (callerLat !== undefined && callerLng !== undefined) {
          distKm = calculateDistanceKm(callerLat, callerLng, p.lat, p.lng);
          distanceStr = distKm <= 5 ? `about ${Math.max(1, distKm)} km away` : `${distKm.toLocaleString()} km away`;
        }

        const info = SIGNAL_PROMPTS.curious;
        peerList.push({
          id: p.id,
          lat: p.lat,
          lng: p.lng,
          busy: p.busy,
          signal: "curious",
          tone: "violet",
          nickname: "",
          city: geo.city,
          country: geo.country,
          prompt: info.prompt,
          tags: info.tags,
          distance: distanceStr,
          distanceKm: distKm,
          match: 80,
          energy: info.energy,
        });
      }
    }
  } catch {
    // In-memory fallback
  }

  // Sort by distance if caller coords provided
  if (callerLat !== undefined && callerLng !== undefined) {
    peerList.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }

  return peerList;
}
