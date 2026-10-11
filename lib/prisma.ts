import { PrismaClient as PostgresPrismaClient } from "@/generated/postgres";
import { PrismaClient as SqlitePrismaClient } from "@/generated/sqlite";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// ── In-Memory Coordination Store Fallback ────────────────────────────────
// When DATABASE_URL is not set (e.g. zero-config Vercel deployment),
// or when database connection fails, this in-memory store coordinates presence,
// signals, and circles reliably without throwing 500 errors.

interface PresenceItem {
  id: string;
  lat: number;
  lng: number;
  busy: boolean;
  lastSeen: Date;
  identityMode?: string | null;
  avatarTone?: string | null;
  nickname?: string | null;
  circleId?: string | null;
  circleKeyword?: string | null;
}

interface SignalItem {
  id: string;
  fromId: string;
  toId: string;
  type: string;
  payload: string | null;
  createdAt: Date;
}

const memoryStore = globalThis as unknown as {
  __pulse_presences?: Map<string, PresenceItem>;
  __pulse_signals?: SignalItem[];
};

if (!memoryStore.__pulse_presences) memoryStore.__pulse_presences = new Map();
if (!memoryStore.__pulse_signals) memoryStore.__pulse_signals = [];

const presences = memoryStore.__pulse_presences;

function matchesFilter(record: any, where: any): boolean {
  if (!where) return true;
  if (Array.isArray(where.OR)) {
    return where.OR.some((sub: any) => matchesFilter(record, sub));
  }
  for (const [key, val] of Object.entries(where)) {
    if (key === "OR") continue;
    const itemVal = record[key];
    if (val && typeof val === "object" && !(val instanceof Date)) {
      const v = val as any;
      if (v.not !== undefined) {
        if (v.not === null) {
          if (itemVal === null || itemVal === undefined) return false;
        } else if (itemVal === v.not) return false;
      }
      if (v.in !== undefined && Array.isArray(v.in)) {
        if (!v.in.includes(itemVal)) return false;
      }
      if (v.gte !== undefined) {
        const t1 = itemVal instanceof Date ? itemVal.getTime() : itemVal;
        const t2 = v.gte instanceof Date ? v.gte.getTime() : v.gte;
        if (t1 < t2) return false;
      }
      if (v.lt !== undefined) {
        const t1 = itemVal instanceof Date ? itemVal.getTime() : itemVal;
        const t2 = v.lt instanceof Date ? v.lt.getTime() : v.lt;
        if (t1 >= t2) return false;
      }
    } else {
      if (itemVal !== val) return false;
    }
  }
  return true;
}

export function createMemoryClient(): PostgresPrismaClient {
  return {
    presence: {
      async upsert({ where, update, create }: any) {
        let item = presences.get(where.id);
        if (item) {
          Object.assign(item, update);
        } else {
          item = { id: where.id, ...create };
          presences.set(where.id, item!);
        }
        return item;
      },
      async findMany(args?: any) {
        const list: any[] = [];
        for (const item of presences.values()) {
          if (matchesFilter(item, args?.where)) {
            if (args?.select) {
              const res: any = {};
              for (const k of Object.keys(args.select)) {
                if (args.select[k]) res[k] = (item as any)[k];
              }
              list.push(res);
            } else {
              list.push({ ...item });
            }
          }
        }
        return list;
      },
      async findUnique({ where }: any) {
        const item = presences.get(where.id);
        return item ? { ...item } : null;
      },
      async updateMany({ where, data }: any) {
        let count = 0;
        for (const item of presences.values()) {
          if (matchesFilter(item, where)) {
            Object.assign(item, data);
            count++;
          }
        }
        return { count };
      },
      async update({ where, data }: any) {
        const item = presences.get(where.id);
        if (item) Object.assign(item, data);
        return item ? { ...item } : null;
      },
      async deleteMany(args?: any) {
        let count = 0;
        for (const [id, item] of Array.from(presences.entries())) {
          if (matchesFilter(item, args?.where)) {
            presences.delete(id);
            count++;
          }
        }
        return { count };
      },
    },
    signal: {
      async create({ data }: any) {
        const sig: SignalItem = {
          id: data.id ?? crypto.randomUUID(),
          fromId: data.fromId,
          toId: data.toId,
          type: data.type,
          payload: data.payload ?? null,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        };
        memoryStore.__pulse_signals!.push(sig);
        return sig;
      },
      async findMany(args?: any) {
        const signals = memoryStore.__pulse_signals ?? [];
        const list = signals.filter((s) => matchesFilter(s, args?.where));
        if (args?.orderBy?.createdAt === "asc") {
          list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        return list.map((s) => ({ ...s }));
      },
      async deleteMany(args?: any) {
        const signals = memoryStore.__pulse_signals ?? [];
        const before = signals.length;
        const kept = signals.filter((s) => !matchesFilter(s, args?.where));
        memoryStore.__pulse_signals = kept;
        return { count: before - kept.length };
      },
    },
  } as unknown as PostgresPrismaClient;
}

function createResilientClient(targetClient: PostgresPrismaClient): PostgresPrismaClient {
  const memoryClient = createMemoryClient();
  let useFallback = false;

  return new Proxy(targetClient, {
    get(target, prop, receiver) {
      if (useFallback) {
        return Reflect.get(memoryClient, prop);
      }
      const model = Reflect.get(target, prop, receiver);
      if (model && typeof model === "object") {
        return new Proxy(model, {
          get(subTarget, subProp, subReceiver) {
            const originalMethod = Reflect.get(subTarget, subProp, subReceiver);
            if (typeof originalMethod === "function") {
              return async (...args: any[]) => {
                if (useFallback) {
                  const fallbackModel = (memoryClient as any)[prop];
                  return fallbackModel[subProp](...args);
                }
                try {
                  return await originalMethod.apply(subTarget, args);
                } catch (err: any) {
                  console.warn(
                    `[Pulse DB Error on ${String(prop)}.${String(subProp)}]: falling back to memory store`,
                    err?.message || err,
                  );
                  useFallback = true;
                  const fallbackModel = (memoryClient as any)[prop];
                  return fallbackModel[subProp](...args);
                }
              };
            }
            return originalMethod;
          },
        });
      }
      return model;
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PostgresPrismaClient | undefined;
};

function createClient(): PostgresPrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return createMemoryClient();
  }

  // SQLite files cannot be written to or opened on Vercel's read-only serverless filesystem
  if (process.env.VERCEL && /^(file:|sqlite:)/i.test(connectionString)) {
    console.warn("[Pulse] SQLite cannot run on Vercel serverless. Using memory client fallback.");
    return createMemoryClient();
  }

  const log: Array<"error" | "warn"> =
    process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];

  try {
    if (/^(file:|sqlite:)/i.test(connectionString)) {
      const adapter = new PrismaBetterSqlite3({ url: connectionString });
      const client = new SqlitePrismaClient({ adapter, log }) as unknown as PostgresPrismaClient;
      return createResilientClient(client);
    }

    const adapter = new PrismaPg({ connectionString });
    const client = new PostgresPrismaClient({ adapter, log });
    return createResilientClient(client);
  } catch (err) {
    console.error("[Pulse] Failed to initialize DB client, using memory client:", err);
    return createMemoryClient();
  }
}

export const prisma = globalForPrisma.prisma ?? (globalForPrisma.prisma = createClient());
