import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Prisma, Role } from "@/generated/prisma/client";
import { database } from "@/lib/db";
import { availableRoles, canAccessArea, canAuthenticate, landingPath } from "./policy";
import { newSessionToken, sessionExpiry, tokenHash } from "./tokens";

export const publicUserSelect = {
  id: true,
  nama: true,
  email: true,
  role: true,
  statusAkun: true,
  catatanPenolakan: true,
  wajibGantiPassword: true,
  authVersion: true,
  deletedAt: true,
  dosen: { select: { isKaprodi: true, isSekpro: true, prodi: true } },
  mahasiswa: { select: { prodi: true } },
} satisfies Prisma.PenggunaSelect;

export type SessionUser = Prisma.PenggunaGetPayload<{ select: typeof publicUserSelect }>;

export function sessionCookieName(): string {
  return process.env.NODE_ENV === "production" ? "__Host-sias_session" : "sias_session";
}

export async function currentTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(sessionCookieName())?.value;
  return token && /^[a-f0-9]{64}$/.test(token) ? tokenHash(token) : null;
}

export async function getSession() {
  const hash = await currentTokenHash();
  if (!hash) return null;
  const db = database();
  const session = await db.authSession.findUnique({
    where: { tokenHash: hash },
    include: { pengguna: { select: publicUserSelect } },
  });
  const now = new Date();
  if (!session) return null;
  if (session.expiresAt <= now || !canAuthenticate(session.pengguna)
      || session.authVersion !== session.pengguna.authVersion) {
    await db.authSession.deleteMany({ where: { tokenHash: hash } });
    return null;
  }
  const roles = availableRoles(session.pengguna);
  const activeRole = roles.includes(session.activeRole) ? session.activeRole : roles[0];
  // A role switch may commit after this read. Activity refresh must preserve its saved role.
  const refreshed = await db.authSession.updateMany({
    where: { tokenHash: hash, expiresAt: { gt: now }, authVersion: session.pengguna.authVersion },
    data: {
      lastActivity: now,
      expiresAt: session.remember ? session.expiresAt : sessionExpiry(now, false),
    },
  });
  if (refreshed.count !== 1) return null;
  return { ...session, activeRole, user: session.pengguna };
}

export type AuthenticatedSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export async function requireSession(scope: "status" | "password" | "work" = "work") {
  const session = await getSession();
  if (!session) redirect("/login?session=expired");
  if (scope !== "status" && session.user.statusAkun !== "aktif") redirect("/menunggu-persetujuan");
  if (scope === "work" && session.user.wajibGantiPassword) redirect("/ganti-password");
  return session;
}

export async function requireArea(area: Role) {
  const session = await requireSession();
  if (!canAccessArea(session.user, session.activeRole, area)) notFound();
  return session;
}

export async function createSession(
  tx: Prisma.TransactionClient,
  user: SessionUser,
  remember: boolean,
  previousHash: string | null,
  activeRole: Role = availableRoles(user)[0],
) {
  const token = newSessionToken();
  const now = new Date();
  if (previousHash) await tx.authSession.deleteMany({ where: { tokenHash: previousHash } });
  const session = await tx.authSession.create({ data: {
    tokenHash: tokenHash(token),
    penggunaId: user.id,
    authVersion: user.authVersion,
    activeRole,
    remember,
    lastActivity: now,
    expiresAt: sessionExpiry(now, remember),
  } });
  return { token, expiresAt: session.expiresAt, destination: landingPath(user, activeRole) };
}

export async function setSessionCookie(token: string, remember: boolean, expires: Date) {
  (await cookies()).set(sessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(remember ? { expires } : {}),
  });
}

export async function clearSessionCookie() {
  (await cookies()).set(sessionCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
}
