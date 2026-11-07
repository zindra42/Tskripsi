import "server-only";
import { headers } from "next/headers";

export async function hasTrustedOrigin(): Promise<boolean> {
  const configuredOrigin = process.env.APP_ORIGIN;
  const origin = (await headers()).get("origin");
  if (!configuredOrigin || !origin) return false;
  try {
    const expected = new URL(configuredOrigin);
    if (process.env.NODE_ENV === "production" && expected.protocol !== "https:") return false;
    return new URL(origin).origin === expected.origin;
  } catch {
    return false;
  }
}
