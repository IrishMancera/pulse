import { PrismaClient as PostgresPrismaClient } from "@/generated/postgres";
import { PrismaClient as SqlitePrismaClient } from "@/generated/sqlite";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as {
  prisma: PostgresPrismaClient | undefined;
};

function createClient(): PostgresPrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const log: Array<"error" | "warn"> =
    process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];

  if (/^(file:|sqlite:)/i.test(connectionString)) {
    const adapter = new PrismaBetterSqlite3({ url: connectionString });
    return new SqlitePrismaClient({ adapter, log }) as unknown as PostgresPrismaClient;
  }

  const adapter = new PrismaPg({ connectionString });
  return new PostgresPrismaClient({ adapter, log });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
