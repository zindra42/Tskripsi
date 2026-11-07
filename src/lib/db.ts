import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalDatabase = globalThis as unknown as { siasDatabase?: PrismaClient };

export function database(): PrismaClient {
  if (!globalDatabase.siasDatabase) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL belum dikonfigurasi.");
    const schema = new URL(connectionString).searchParams.get("schema") ?? "public";
    if (schema !== "public") throw new Error("Fondasi SIAS memerlukan schema public.");
    const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 }, { schema });
    globalDatabase.siasDatabase = new PrismaClient({ adapter, log: [] });
  }
  return globalDatabase.siasDatabase;
}
