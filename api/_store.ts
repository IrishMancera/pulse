/**
 * Pulse coordination store
 * Uses Vercel KV (Redis) when KV_REST_API_URL is set, otherwise falls back
 * to a globalThis in-memory store (single-instance dev / small deployments).
 *
 * TTL / lease durations:
 *   Presence heartbeat : 45 s  (client polls every 4 s, 11 × leeway)
 *   Signal queue       : 60 s  (signals consumed on next poll)
 */

// ── Types ──────────────────────────────────────────────────────────────────
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
  invisible: boolean;
  circle?: string | null;
}

export interface StoredSignal {
  id: string;
  fromId: string;
  toId: string;
  type: string;
  payload: string | null;
  createdAt: number;
}

// ── Constants ──────────────────────────────────────────────────────────────
const STALE_MS = 45_000;
const SIGNAL_TTL_MS = 60_000;
const PRESENCE_KEY = (id: string) => `pulse:presence:${id}`;
const SIGNALS_KEY = (id: string) => `pulse:signals:${id}`;
const ALL_IDS_KEY = "pulse:ids";

// ── KV detection ──────────────────────────────────────────────────────────
let kv: typeof import("@vercel/kv").kv | null = null;
let kvAvailable = false;

async function getKV() {
  if (kv !== null) return kv;
  if (!process.env.KV_REST_API_URL) {
    kvAvailable = false;
    return null;
  }
  try {
    const mod = await import("@vercel/kv");
    kv = mod.kv;
    kvAvailable = true;
    return kv;
  } catch {
    kvAvailable = false;
    return null;
  }
}

// ── In-memory fallback ─────────────────────────────────────────────────────
const globalStore = globalThis as unknown as {
  __pulse_presences?: Map<string, PresenceRecord>;
  __pulse_signals?: StoredSignal[];
};
if (!globalStore.__pulse_presences) globalStore.__pulse_presences = new Map();
if (!globalStore.__pulse_signals) globalStore.__pulse_signals = [];
const memPresences = globalStore.__pulse_presences!;
let memSignals = globalStore.__pulse_signals!;

// ── Geo helpers ────────────────────────────────────────────────────────────
const WORLD_CITIES = [
  { name: "Tokyo", country: "Japan", lat: 35.6762, lng: 139.6503 },
  { name: "London", country: "United Kingdom", lat: 51.5074, lng: -0.1278 },
  { name: "New York", country: "United States", lat: 40.7128, lng: -74.006 },
  { name: "Paris", country: "France", lat: 48.8566, lng: 2.3522 },
  { name: "Los Angeles", country: "United States", lat: 34.0522, lng: -118.2437 },
  { name: "Sydney", country: "Australia", lat: -33.8688, lng: 151.2093 },
  { name: "Singapore", country: "Singapore", lat: 1.3521, lng: 103.8198 },
  { name: "Manila", country: "Philippines", lat: 14.5995, lng: 120.9842 },
  { name: "Berlin", country: "Germany", lat: 52.52, lng: 13.405 },
  { name: "Toronto", country: "Canada", lat: 43.6532, lng: -79.3832 },
  { name: "San Francisco", country: "United States", lat: 37.7749, lng: -122.4194 },
  { name: "Chicago", country: "United States", lat: 41.8781, lng: -87.6298 },
  { name: "São Paulo", country: "Brazil", lat: -23.5505, lng: -46.6333 },
  { name: "Mumbai", country: "India", lat: 19.076, lng: 72.8777 },
  { name: "Seoul", country: "South Korea", lat: 37.5665, lng: 126.978 },
  { name: "Amsterdam", country: "Netherlands", lat: 52.3676, lng: 4.9041 },
  { name: "Madrid", country: "Spain", lat: 40.4168, lng: -3.7038 },
  { name: "Rome", country: "Italy", lat: 41.9028, lng: 12.4964 },
  { name: "Hong Kong", country: "Hong Kong", lat: 22.3193, lng: 114.1694 },
  { name: "Bangkok", country: "Thailand", lat: 13.7563, lng: 100.5018 },
  { name: "Dubai", country: "United Arab Emirates", lat: 25.2048, lng: 55.2708 },
  { name: "Istanbul", country: "Turkey", lat: 41.0082, lng: 28.9784 },
  { name: "Jakarta", country: "Indonesia", lat: -6.2088, lng: 106.8456 },
  { name: "São Paulo", country: "Brazil", lat: -23.5505, lng: -46.6333 },
  { name: "Cairo", country: "Egypt", lat: 30.0444, lng: 31.2357 },
  { name: "Lagos", country: "Nigeria", lat: 6.5244, lng: 3.3792 },
  { name: "Buenos Aires", country: "Argentina", lat: -34.6037, lng: -58.3816 },
  { name: "Mexico City", country: "Mexico", lat: 19.4326, lng: -99.1332 },
  { name: "Nairobi", country: "Kenya", lat: -1.2921, lng: 36.8219 },
  { name: "Stockholm", country: "Sweden", lat: 59.3293, lng: 18.0686 },
];

export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function getCityInfo(lat: number, lng: number): { city: string; country: string } {
  let closest = WORLD_CITIES[0];
  let minDist = Infinity;
  for (const c of WORLD_CITIES) {
    const d = calculateDistanceKm(lat, lng, c.lat, c.lng);
    if (d < minDist) { minDist = d; closest = c; }
  }
  return { city: closest.name, country: closest.country };
}

export function applyPrivacyOffset(lat: number, lng: number): { lat: number; lng: number } {
  const km = 1 + Math.random() * 2;
  const angle = Math.random() * Math.PI * 2;
  const latD = (km / 111.32) * Math.cos(angle);
  const lngD = (km / (111.32 * Math.cos((lat * Math.PI) / 180) || 111.32)) * Math.sin(angle);
  return {
    lat: Math.min(90, Math.max(-90, lat + latD)),
    lng: ((((lng + lngD + 180) % 360) + 360) % 360) - 180,
  };
}

function buildPrompt(signal: string) {
  return signal === "open"
    ? "Ready to talk with anyone right now. Say hi!"
    : signal === "curious"
    ? "Tell me something unexpected about your corner of the world."
    : "Sharing an ambient thought into the night sky.";
}

function buildTags(signal: string) {
  return signal === "open"
    ? ["spontaneous", "open mic", "deep listening"]
    : signal === "curious"
    ? ["wild ideas", "creative spark", "exploration"]
    : ["ambient thoughts", "slow talk", "night vibes"];
}

// ── KV-backed operations ───────────────────────────────────────────────────
async function kvRegister(
  id: string, rawLat: number, rawLng: number,
  meta?: { signal?: string; tone?: string; nickname?: string; invisible?: boolean; circle?: string | null }
): Promise<PresenceRecord> {
  const store = await getKV();
  if (!store) return memRegister(id, rawLat, rawLng, meta);

  const offset = applyPrivacyOffset(rawLat, rawLng);
  const geo = getCityInfo(offset.lat, offset.lng);
  const sig = (meta?.signal as PresenceRecord["signal"]) || "curious";
  const tone = (meta?.tone as PresenceRecord["tone"]) || "green";
  const record: PresenceRecord = {
    id,
    lat: offset.lat,
    lng: offset.lng,
    busy: false,
    lastSeen: Date.now(),
    signal: sig,
    tone,
    nickname: meta?.nickname?.trim() || "",
    city: geo.city,
    country: geo.country,
    prompt: buildPrompt(sig),
    tags: buildTags(sig),
    invisible: meta?.invisible ?? false,
    circle: meta?.circle || null,
  };

  await store.set(PRESENCE_KEY(id), JSON.stringify(record), { ex: Math.ceil(STALE_MS / 1000) + 5 });
  await store.sadd(ALL_IDS_KEY, id);
  await store.expire(ALL_IDS_KEY, 600);
  return record;
}

async function kvTouch(
  id: string,
  meta?: { signal?: string; tone?: string; nickname?: string; lat?: number; lng?: number; invisible?: boolean }
): Promise<void> {
  const store = await getKV();
  if (!store) { memTouch(id, meta); return; }

  const raw = await store.get<string>(PRESENCE_KEY(id));
  if (!raw) {
    if (meta?.lat !== undefined && meta?.lng !== undefined && !isNaN(meta.lat) && !isNaN(meta.lng)) {
      await kvRegister(id, meta.lat, meta.lng, meta);
    }
    return;
  }

  const record: PresenceRecord = typeof raw === "string" ? JSON.parse(raw) : raw as PresenceRecord;
  record.lastSeen = Date.now();
  if (meta?.signal) record.signal = meta.signal as PresenceRecord["signal"];
  if (meta?.tone) record.tone = meta.tone as PresenceRecord["tone"];
  if (meta?.nickname !== undefined) record.nickname = meta.nickname.trim();
  if (meta?.invisible !== undefined) record.invisible = meta.invisible;
  if (meta?.circle !== undefined) record.circle = meta.circle || null;

  await store.set(PRESENCE_KEY(id), JSON.stringify(record), { ex: Math.ceil(STALE_MS / 1000) + 5 });
}

async function kvRemove(id: string): Promise<void> {
  const store = await getKV();
  if (!store) { memRemove(id); return; }
  await store.del(PRESENCE_KEY(id));
  await store.srem(ALL_IDS_KEY, id);
}

async function kvList(callerId: string, callerLat?: number, callerLng?: number, callerSignal?: string): Promise<any[]> {
  const store = await getKV();
  if (!store) return memList(callerId, callerLat, callerLng, callerSignal);

  const ids = await store.smembers(ALL_IDS_KEY);
  if (!ids || ids.length === 0) return [];

  const now = Date.now();
  const staleCutoff = now - STALE_MS;
  const staleIds: string[] = [];
  const peers: any[] = [];

  await Promise.all(ids.map(async (rawId: unknown) => {
    const rid = String(rawId);
    if (rid === callerId) return;
    const raw = await store.get<string>(PRESENCE_KEY(rid));
    if (!raw) { staleIds.push(rid); return; }

    const record: PresenceRecord = typeof raw === "string" ? JSON.parse(raw) : raw as PresenceRecord;
    if (record.lastSeen < staleCutoff || record.invisible) {
      staleIds.push(rid);
      return;
    }

    let distKm = 0;
    let distStr = "nearby";
    if (callerLat !== undefined && callerLng !== undefined && !isNaN(callerLat) && !isNaN(callerLng)) {
      distKm = calculateDistanceKm(callerLat, callerLng, record.lat, record.lng);
      distStr = distKm <= 5 ? `about ${Math.max(1, distKm)} km away` : `${distKm.toLocaleString()} km away`;
    }

    let match = 75;
    if (callerSignal) {
      if (callerSignal === record.signal) match = 95;
      else if ((callerSignal === "open" && record.signal === "curious") || (callerSignal === "curious" && record.signal === "open")) match = 85;
      else match = 78;
    }

    peers.push({
      id: record.id, lat: record.lat, lng: record.lng, busy: record.busy,
      signal: record.signal, tone: record.tone, nickname: record.nickname,
      city: record.city, country: record.country, prompt: record.prompt,
      tags: record.tags, distance: distStr, distanceKm: distKm, match,
      energy: record.signal === "open" ? "Warm & spontaneous" : record.signal === "curious" ? "Electric & searching" : "Calm & contemplative",
      circle: record.circle || null,
    });
  }));

  if (staleIds.length > 0) {
    await Promise.all(staleIds.map(id => store.srem(ALL_IDS_KEY, id)));
  }

  return callerLat !== undefined ? peers.sort((a, b) => a.distanceKm - b.distanceKm) : peers;
}

async function kvQueueSignal(fromId: string, toId: string, type: string, payload?: string | null): Promise<{ ok: boolean; autoDeclined?: boolean }> {
  const store = await getKV();
  if (!store) return memQueueSignal(fromId, toId, type, payload);

  // Auto-decline if target is busy
  if (type === "request") {
    const raw = await store.get<string>(PRESENCE_KEY(toId));
    if (raw) {
      const rec: PresenceRecord = typeof raw === "string" ? JSON.parse(raw) : raw as PresenceRecord;
      if (rec.busy) {
        await kvQueueSignal(toId, fromId, "decline", null);
        return { ok: true, autoDeclined: true };
      }
    }
  }

  // Update busy state
  if (type === "accept") {
    await kvSetBusy([fromId, toId], true, store);
  } else if (type === "decline" || type === "end") {
    await kvSetBusy([fromId, toId], false, store);
  }

  const sig: StoredSignal = {
    id: crypto.randomUUID(),
    fromId, toId, type,
    payload: payload || null,
    createdAt: Date.now(),
  };

  await store.lpush(SIGNALS_KEY(toId), JSON.stringify(sig));
  await store.expire(SIGNALS_KEY(toId), Math.ceil(SIGNAL_TTL_MS / 1000) + 10);
  return { ok: true };
}

async function kvSetBusy(ids: string[], busy: boolean, store: NonNullable<typeof kv>): Promise<void> {
  await Promise.all(ids.map(async (id) => {
    const raw = await store.get<string>(PRESENCE_KEY(id));
    if (!raw) return;
    const rec: PresenceRecord = typeof raw === "string" ? JSON.parse(raw) : raw as PresenceRecord;
    rec.busy = busy;
    await store.set(PRESENCE_KEY(id), JSON.stringify(rec), { ex: Math.ceil(STALE_MS / 1000) + 5 });
  }));
}

async function kvDrainSignals(toId: string): Promise<any[]> {
  const store = await getKV();
  if (!store) return memDrainSignals(toId);

  const key = SIGNALS_KEY(toId);
  const count = await store.llen(key);
  if (!count) return [];

  const results: any[] = [];
  const items = await store.lrange(key, 0, count - 1);
  if (items && items.length > 0) {
    await store.del(key);
    items.reverse();
    const now = Date.now();
    for (const item of items) {
      try {
        const sig: StoredSignal = typeof item === "string" ? JSON.parse(item) : item as StoredSignal;
        if (now - sig.createdAt < SIGNAL_TTL_MS) {
          results.push({ ...sig, createdAt: new Date(sig.createdAt).toISOString() });
        }
      } catch {}
    }
  }
  return results;
}

// ── In-memory fallback implementations ────────────────────────────────────
function memRegister(
  id: string, rawLat: number, rawLng: number,
  meta?: { signal?: string; tone?: string; nickname?: string; invisible?: boolean; circle?: string | null }
): PresenceRecord {
  const offset = applyPrivacyOffset(rawLat, rawLng);
  const geo = getCityInfo(offset.lat, offset.lng);
  const sig = (meta?.signal as PresenceRecord["signal"]) || "curious";
  const record: PresenceRecord = {
    id, lat: offset.lat, lng: offset.lng, busy: false,
    lastSeen: Date.now(),
    signal: sig,
    tone: (meta?.tone as PresenceRecord["tone"]) || "green",
    nickname: meta?.nickname?.trim() || "",
    city: geo.city, country: geo.country,
    prompt: buildPrompt(sig),
    tags: buildTags(sig),
    invisible: meta?.invisible ?? false,
    circle: meta?.circle || null,
  };
  memPresences.set(id, record);
  return record;
}

function memTouch(
  id: string,
  meta?: { signal?: string; tone?: string; nickname?: string; lat?: number; lng?: number; invisible?: boolean; circle?: string | null }
) {
  let existing = memPresences.get(id);
  if (!existing && meta?.lat !== undefined && meta?.lng !== undefined && !isNaN(meta.lat) && !isNaN(meta.lng)) {
    memRegister(id, meta.lat, meta.lng, meta);
    return;
  }
  if (existing) {
    existing.lastSeen = Date.now();
    if (meta?.signal) existing.signal = meta.signal as PresenceRecord["signal"];
    if (meta?.tone) existing.tone = meta.tone as PresenceRecord["tone"];
    if (meta?.nickname !== undefined) existing.nickname = meta.nickname.trim();
    if (meta?.invisible !== undefined) existing.invisible = meta.invisible;
    if (meta?.circle !== undefined) existing.circle = meta.circle || null;
  }
}

function memRemove(id: string) {
  memPresences.delete(id);
  memSignals = memSignals.filter((s) => s.toId !== id && s.fromId !== id);
  globalStore.__pulse_signals = memSignals;
}

function memList(callerId: string, callerLat?: number, callerLng?: number, callerSignal?: string): any[] {
  const now = Date.now();
  const staleCutoff = now - STALE_MS;
  const peers: any[] = [];

  for (const [id, record] of memPresences.entries()) {
    if (id === callerId || record.lastSeen < staleCutoff || record.invisible) continue;

    let distKm = 0;
    let distStr = "nearby";
    if (callerLat !== undefined && callerLng !== undefined && !isNaN(callerLat) && !isNaN(callerLng)) {
      distKm = calculateDistanceKm(callerLat, callerLng, record.lat, record.lng);
      distStr = distKm <= 5 ? `about ${Math.max(1, distKm)} km away` : `${distKm.toLocaleString()} km away`;
    }

    let match = 75;
    if (callerSignal) {
      if (callerSignal === record.signal) match = 95;
      else if ((callerSignal === "open" && record.signal === "curious") || (callerSignal === "curious" && record.signal === "open")) match = 85;
      else match = 78;
    }

    peers.push({
      id: record.id, lat: record.lat, lng: record.lng, busy: record.busy,
      signal: record.signal, tone: record.tone, nickname: record.nickname,
      city: record.city, country: record.country, prompt: record.prompt,
      tags: record.tags, distance: distStr, distanceKm: distKm, match,
      energy: record.signal === "open" ? "Warm & spontaneous" : record.signal === "curious" ? "Electric & searching" : "Calm & contemplative",
      circle: record.circle || null,
    });
  }

  // Reap stale
  for (const [id, record] of memPresences.entries()) {
    if (record.lastSeen < staleCutoff) memPresences.delete(id);
  }

  return callerLat !== undefined ? peers.sort((a, b) => a.distanceKm - b.distanceKm) : peers;
}

function memQueueSignal(fromId: string, toId: string, type: string, payload?: string | null): { ok: boolean; autoDeclined?: boolean } {
  if (type === "request") {
    const target = memPresences.get(toId);
    if (target?.busy) {
      memQueueSignal(toId, fromId, "decline", null);
      return { ok: true, autoDeclined: true };
    }
  }

  if (type === "accept") {
    [fromId, toId].forEach(id => { const p = memPresences.get(id); if (p) p.busy = true; });
  } else if (type === "decline" || type === "end") {
    [fromId, toId].forEach(id => { const p = memPresences.get(id); if (p) p.busy = false; });
  }

  memSignals.push({ id: crypto.randomUUID(), fromId, toId, type, payload: payload || null, createdAt: Date.now() });
  globalStore.__pulse_signals = memSignals;
  return { ok: true };
}

function memDrainSignals(toId: string): any[] {
  const now = Date.now();
  const out: any[] = [];
  const keep: StoredSignal[] = [];
  for (const s of memSignals) {
    if (s.toId === toId && now - s.createdAt < SIGNAL_TTL_MS) {
      out.push({ ...s, createdAt: new Date(s.createdAt).toISOString() });
    } else if (s.toId !== toId && now - s.createdAt < SIGNAL_TTL_MS) {
      keep.push(s);
    }
  }
  memSignals = keep;
  globalStore.__pulse_signals = memSignals;
  return out;
}

// ── Public async API ───────────────────────────────────────────────────────
export async function registerPresence(
  id: string, rawLat: number, rawLng: number,
  meta?: { signal?: string; tone?: string; nickname?: string; invisible?: boolean; circle?: string | null }
): Promise<PresenceRecord> {
  await getKV();
  return kvAvailable ? kvRegister(id, rawLat, rawLng, meta) : memRegister(id, rawLat, rawLng, meta);
}

export async function touchPresence(
  id: string,
  meta?: { signal?: string; tone?: string; nickname?: string; lat?: number; lng?: number; invisible?: boolean; circle?: string | null }
): Promise<void> {
  await getKV();
  return kvAvailable ? kvTouch(id, meta) : Promise.resolve(memTouch(id, meta));
}

export async function removePresence(id: string): Promise<void> {
  await getKV();
  return kvAvailable ? kvRemove(id) : Promise.resolve(memRemove(id));
}

export async function listPeers(
  callerId: string, callerLat?: number, callerLng?: number, callerSignal?: string
): Promise<any[]> {
  await getKV();
  return kvAvailable ? kvList(callerId, callerLat, callerLng, callerSignal) : Promise.resolve(memList(callerId, callerLat, callerLng, callerSignal));
}

export async function queueSignal(
  fromId: string, toId: string, type: string, payload?: string | null
): Promise<{ ok: boolean; autoDeclined?: boolean }> {
  await getKV();
  return kvAvailable ? kvQueueSignal(fromId, toId, type, payload) : Promise.resolve(memQueueSignal(fromId, toId, type, payload));
}

export async function drainSignals(toId: string): Promise<any[]> {
  await getKV();
  return kvAvailable ? kvDrainSignals(toId) : Promise.resolve(memDrainSignals(toId));
}
