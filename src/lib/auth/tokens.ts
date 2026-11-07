import "server-only";
import { createHash, randomBytes } from "node:crypto";

export const IDLE_MILLISECONDS = 5 * 60 * 1000;
export const REMEMBER_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function sessionExpiry(now: Date, remember: boolean): Date {
  return new Date(now.getTime() + (remember ? REMEMBER_MILLISECONDS : IDLE_MILLISECONDS));
}
