"use server";

import { redirect } from "next/navigation";
import { database } from "@/lib/db";
import { availableRoles, canAuthenticate, isRole, landingPath } from "@/lib/auth/policy";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { hasTrustedOrigin } from "@/lib/auth/origin";
import { allowLogin, allowPasswordChange } from "@/lib/auth/rate-limit";
import {
  clearSessionCookie, createSession, currentTokenHash, publicUserSelect,
  requireSession, setSessionCookie,
} from "@/lib/auth/session";
import { loginSchema, passwordSchema } from "@/lib/auth/validation";
import { ensureSuperadmin, isSuperadminEmail } from "@/lib/auth/superadmin";

export type FormState = { error: string };
const unavailable = { error: "Layanan autentikasi belum tersedia. Silakan coba kembali atau hubungi pengelola SIAS." };
const invalidCredentials = { error: "Email atau password tidak sesuai, atau akun tidak dapat digunakan. Hubungi pengelola jika akun dinonaktifkan." };
const untrustedOrigin = { error: "Permintaan tidak dapat diverifikasi. Muat ulang halaman dan coba kembali." };
const throttled = { error: "Terlalu banyak percobaan. Silakan coba kembali setelah satu menit." };
const dummyHash = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5BxLdFUHGY7/E.LwEZ7vMn9ffkQQhLa";

export async function login(_state: FormState, formData: FormData): Promise<FormState> {
  if (!await hasTrustedOrigin()) return untrustedOrigin;
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: formData.get("password"),
    remember: formData.get("remember") === "on",
  });
  if (!parsed.success) return { error: "Masukkan email yang valid dan password Anda." };
  let destination: string;
  try {
    if (!await allowLogin(parsed.data.email)) return throttled;
    const db = database();
    if (isSuperadminEmail(parsed.data.email)) {
      await ensureSuperadmin(db);
    }
    const user = await db.pengguna.findUnique({
      where: { email: parsed.data.email },
      select: { ...publicUserSelect, password: true },
    });
    const validPassword = await verifyPassword(parsed.data.password, user?.password ?? dummyHash);
    if (!user || !validPassword || !canAuthenticate(user)) return invalidCredentials;
    const previousHash = await currentTokenHash();
    const created = await db.$transaction(async (tx) => {
      // Serialize session issuance with password changes and account updates.
      await tx.$queryRaw`SELECT id FROM pengguna WHERE id = ${user.id} FOR UPDATE`;
      const fresh = await tx.pengguna.findUnique({
        where: { id: user.id }, select: { ...publicUserSelect, password: true },
      });
      if (!fresh || fresh.password !== user.password || !canAuthenticate(fresh)) return null;
      return createSession(tx, fresh, parsed.data.remember, previousHash);
    });
    if (!created) return invalidCredentials;
    await setSessionCookie(created.token, parsed.data.remember, created.expiresAt);
    destination = created.destination;
  } catch {
    return unavailable;
  }
  redirect(destination);
}

export async function logout(): Promise<FormState> {
  if (!await hasTrustedOrigin()) return untrustedOrigin;
  try {
    const hash = await currentTokenHash();
    if (hash) await database().authSession.deleteMany({ where: { tokenHash: hash } });
    await clearSessionCookie();
  } catch {
    return unavailable;
  }
  redirect("/login");
}

export async function changePassword(_state: FormState, formData: FormData): Promise<FormState> {
  if (!await hasTrustedOrigin()) return untrustedOrigin;
  const session = await requireSession("password");
  if (session.user.role === "superadmin" || isSuperadminEmail(session.user.email)) {
    return { error: "Password akun Super Admin dikelola langsung melalui berkas environment (.env) dan tidak dapat diubah di sini." };
  }
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Password baru minimal 8 karakter dan maksimal 72 byte UTF-8, berbeda dari password saat ini, serta cocok dengan konfirmasi." };
  }
  let destination: string;
  try {
    if (!await allowPasswordChange(session.user.id)) return throttled;
    const db = database();
    const account = await db.pengguna.findUnique({ where: { id: session.user.id }, select: { password: true } });
    if (!account || !await verifyPassword(parsed.data.currentPassword, account.password)) {
      return { error: "Password saat ini tidak sesuai." };
    }
    // Bcrypt treats bytes after byte 72 as identical, even in old passwords.
    if (await verifyPassword(parsed.data.newPassword, account.password)) {
      return { error: "Password baru harus berbeda dari password saat ini." };
    }
    const password = await hashPassword(parsed.data.newPassword);
    const created = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pengguna WHERE id = ${session.user.id} FOR UPDATE`;
      const liveSession = await tx.authSession.findFirst({ where: {
        tokenHash: session.tokenHash,
        authVersion: session.authVersion,
        expiresAt: { gt: new Date() },
      } });
      if (!liveSession) throw new Error("Sesi telah berubah.");
      const changed = await tx.pengguna.updateMany({
        where: {
          id: session.user.id, password: account.password, authVersion: session.authVersion,
          deletedAt: null, statusAkun: "aktif",
        },
        data: { password, wajibGantiPassword: false, rememberToken: null, authVersion: { increment: 1 }, updatedAt: new Date() },
      });
      if (changed.count !== 1) throw new Error("Akun telah berubah.");
      const fresh = await tx.pengguna.findUniqueOrThrow({ where: { id: session.user.id }, select: publicUserSelect });
      await tx.authSession.deleteMany({ where: { penggunaId: fresh.id } });
      return createSession(tx, fresh, session.remember, null, session.activeRole);
    });
    await setSessionCookie(created.token, session.remember, created.expiresAt);
    destination = created.destination;
  } catch {
    return unavailable;
  }
  redirect(destination);
}

export async function switchRole(_state: FormState, formData: FormData): Promise<FormState> {
  if (!await hasTrustedOrigin()) return untrustedOrigin;
  const session = await requireSession();
  const target = String(formData.get("role") ?? "");
  const roles = availableRoles(session.user);
  if (!isRole(target) || !roles.includes(target) || !roles.some((role) => role === "kaprodi" || role === "sekpro")) {
    return { error: "Anda tidak memiliki kewenangan untuk peran tersebut." };
  }
  try {
    const result = await database().authSession.updateMany({
      where: { tokenHash: session.tokenHash, authVersion: session.authVersion, expiresAt: { gt: new Date() } },
      data: { activeRole: target },
    });
    if (result.count !== 1) return { error: "Sesi telah berakhir. Silakan masuk kembali." };
  } catch {
    return unavailable;
  }
  redirect(landingPath(session.user, target));
}
