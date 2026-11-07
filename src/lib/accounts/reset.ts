import "server-only";
import { z } from "zod";
import { database } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { newSessionToken, tokenHash } from "@/lib/auth/tokens";
import type { AuthenticatedSession } from "@/lib/auth/session";
import { canDecideReset } from "./policy";
import { newPasswordSchema, reasonSchema } from "./validation";
import { accountTransaction, audit, checkedActor, ensure, invalidateSessions, lockedAccount } from "./store";

export async function requestPasswordReset(identity: string) {
  const identitas = z.string().trim().min(1).max(255).parse(identity);
  const where = {
    deletedAt: null, statusAkun: "aktif", role: { not: "superadmin" },
    OR: [{ email: identitas }, { mahasiswa: { nim: identitas } }, { dosen: { nidn: identitas } }],
  } satisfies Prisma.PenggunaWhereInput;
  // Unknown/ambiguous public identities need no account mutation or shared lock.
  const candidates = await database().pengguna.findMany({ where, select: { id: true }, take: 2 });
  if (candidates.length !== 1) return;
  return accountTransaction(async (tx) => {
    // Identity/status can change while waiting. Never redirect a stale request to a new owner.
    const matches = await tx.pengguna.findMany({ where, select: { id: true }, take: 2 });
    if (matches.length !== 1 || matches[0].id !== candidates[0].id) return;
    const user = await lockedAccount(tx, matches[0].id);
    if (user.deletedAt || user.statusAkun !== "aktif" || user.role === "superadmin") return;
    const now = new Date();
    await tx.passwordResetRequest.updateMany({ where: {
      penggunaId: user.id, status: "disetujui",
      OR: [{ expiresAt: { lte: now } }, { expiresAt: null }, { tokenHash: null },
        { authVersion: null }, { authVersion: { not: user.authVersion } }],
    }, data: { status: "kedaluwarsa", tokenHash: null, token: null, updatedAt: now } });
    const existing = await tx.passwordResetRequest.findFirst({ where: {
      penggunaId: user.id, status: { in: ["menunggu", "disetujui"] },
    } });
    if (existing) return;
    const request = await tx.passwordResetRequest.create({ data: {
      penggunaId: user.id, identitas, createdAt: now, updatedAt: now,
    } });
    await audit(tx, user.id, "pengajuan_reset_password", `reset_request:${request.id}`);
  });
}

export async function decidePasswordReset(session: AuthenticatedSession, id: bigint, approve: boolean, reason: string) {
  return accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session, "manage");
    const request = await tx.passwordResetRequest.findUnique({ where: { id } });
    ensure(request?.status === "menunggu", "Permohonan sudah diproses atau tidak ditemukan.");
    const target = await lockedAccount(tx, request.penggunaId);
    ensure(target.deletedAt === null && target.statusAkun === "aktif", "Akun tujuan harus aktif.");
    ensure(canDecideReset(actor, target), "Reset Kaprodi memerlukan Sekpro atau superadmin. Reset akun sendiri tidak diizinkan.");
    if (!approve) reasonSchema.parse(reason);
    const token = approve ? newSessionToken() : null;
    const now = new Date();
    await tx.passwordResetRequest.update({ where: { id }, data: {
      status: approve ? "disetujui" : "ditolak", approvedBy: actor.id, approvedAt: now,
      alasanPenolakan: approve ? null : reason, tokenHash: token ? tokenHash(token) : null,
      token: null, authVersion: target.authVersion,
      expiresAt: approve ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : null,
      updatedAt: now,
    } });
    await audit(tx, actor.id, approve ? "approve_reset_password" : "reject_reset_password", `reset_request:${id}`, { reason: approve ? null : reason });
    return token;
  });
}

export async function completePasswordReset(input: unknown) {
  const data = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: newPasswordSchema, confirmation: z.string() })
    .refine((value) => value.password === value.confirmation).parse(input);
  const hash = tokenHash(data.token);
  const candidate = await database().passwordResetRequest.findUnique({ where: { tokenHash: hash } });
  ensure(candidate && candidate.status === "disetujui" && candidate.expiresAt && candidate.expiresAt > new Date(), "Token tidak valid atau kedaluwarsa.");
  const password = await hashPassword(data.password);
  return accountTransaction(async (tx) => {
    // Preflight is only admission: recheck under the same mutation lock for single-use/security races.
    const request = await tx.passwordResetRequest.findUnique({ where: { tokenHash: hash } });
    ensure(request && request.status === "disetujui" && request.expiresAt && request.expiresAt > new Date(), "Token tidak valid atau kedaluwarsa.");
    const user = await lockedAccount(tx, request.penggunaId);
    ensure(user.deletedAt === null && user.statusAkun === "aktif" && user.role !== "superadmin"
      && user.authVersion === request.authVersion, "Token tidak valid atau kedaluwarsa.");
    await tx.pengguna.update({ where: { id: user.id }, data: { password, wajibGantiPassword: false } });
    await tx.passwordResetRequest.update({ where: { id: request.id }, data: { status: "selesai", tokenHash: null, token: null, updatedAt: new Date() } });
    await invalidateSessions(tx, user.id);
    await audit(tx, user.id, "reset_password_selesai", `reset_request:${request.id}`);
  });
}
