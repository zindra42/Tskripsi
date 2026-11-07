import "server-only";
import { compare, hash } from "bcryptjs";
import { verify } from "@node-rs/argon2";

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  try {
    // PHP's $2y$ has the same corrected bcrypt semantics as $2b$.
    if (/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(encoded)) {
      return await compare(password, encoded.replace(/^\$2y\$/, "$2b$"));
    }
    if (/^\$argon2(id|i)\$/.test(encoded)) return await verify(encoded, password);
    return false;
  } catch {
    return false;
  }
}

export function hashPassword(password: string): Promise<string> {
  // New passwords are capped at 72 UTF-8 bytes before reaching this function.
  return hash(password, 12);
}
