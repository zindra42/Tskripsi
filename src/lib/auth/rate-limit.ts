import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { database } from "@/lib/db";

async function consumeBucket(identity: string, limit: number): Promise<boolean> {
  const secret = process.env.AUTH_RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_RATE_LIMIT_SECRET minimal 32 karakter.");
  const key = createHmac("sha256", secret).update(identity).digest("hex");
  // PostgreSQL's row-level ON CONFLICT lock makes admission atomic across workers.
  const rows = await database().$queryRaw<{ attempts: number }[]>`
    INSERT INTO auth_rate_limits (key, attempts, window_start)
    VALUES (${key}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE
        WHEN auth_rate_limits.window_start <= CURRENT_TIMESTAMP - INTERVAL '60 seconds' THEN 1
        ELSE LEAST(auth_rate_limits.attempts + 1, 10000) END,
      window_start = CASE
        WHEN auth_rate_limits.window_start <= CURRENT_TIMESTAMP - INTERVAL '60 seconds' THEN CURRENT_TIMESTAMP
        ELSE auth_rate_limits.window_start END
    RETURNING attempts
  `;
  return rows[0].attempts <= limit;
}

export async function allowLogin(email: string): Promise<boolean> {
  const requestHeaders = await headers();
  const ip = process.env.TRUST_PROXY === "true"
    ? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    : undefined;
  const clientAllowed = await consumeBucket(ip ? `login-ip:${ip}` : "login-global", ip ? 30 : 120);
  if (!clientAllowed) return false;
  return consumeBucket(`login-email:${email}`, 5);
}

export function allowPasswordChange(userId: bigint): Promise<boolean> {
  return consumeBucket(`password:${userId}`, 5);
}
