import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { database } from "@/lib/db";
import { publicUserSelect, type AuthenticatedSession } from "@/lib/auth/session";
import { canAuthenticate } from "@/lib/auth/policy";
import { canManage, type AccountPermission } from "./policy";

export class AccountError extends Error {}
export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AccountError(message);
}

export const accountSelect = {
  ...publicUserSelect,
  emailArsip: true,
  dibuatOlehSuperAdmin: true,
  mahasiswa: true,
  dosen: { include: { keahlian: { include: { bidang: true } } } },
} satisfies Prisma.PenggunaSelect;
export type Account = Prisma.PenggunaGetPayload<{ select: typeof accountSelect }>;
export type Tx = Prisma.TransactionClient;

export async function accountTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  return database().$transaction(async (tx) => {
    // One program's account mutations share a lock, including identity checks and leadership transfer.
    // READ COMMITTED ensures each read after waiting sees the preceding transaction's commit.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(736427003)`;
    return work(tx);
  }, { maxWait: 10000, timeout: 20000 });
}

export async function lockedAccount(tx: Tx, id: bigint) {
  await tx.$queryRaw`SELECT id FROM pengguna WHERE id = ${id} FOR UPDATE`;
  const user = await tx.pengguna.findUnique({ where: { id }, select: accountSelect });
  ensure(user, "Akun tidak ditemukan.");
  return user;
}

export async function checkedActor(tx: Tx, session: AuthenticatedSession, permission?: AccountPermission) {
  const user = await lockedAccount(tx, session.user.id);
  await tx.$queryRaw`SELECT token_hash FROM auth_sessions WHERE token_hash = ${session.tokenHash} FOR UPDATE`;
  const live = await tx.authSession.findUnique({ where: { tokenHash: session.tokenHash } });
  ensure(live && live.penggunaId === user.id && live.authVersion === user.authVersion
    && user.authVersion === session.authVersion && live.expiresAt > new Date()
    && canAuthenticate(user) && user.statusAkun === "aktif" && !user.wajibGantiPassword,
  "Sesi telah berubah. Silakan masuk kembali.");
  if (permission) ensure(canManage(user, live.activeRole, permission), "Anda tidak memiliki kewenangan untuk tindakan ini.");
  return user;
}

export async function invalidateSessions(tx: Tx, id: bigint) {
  await tx.pengguna.update({ where: { id }, data: { authVersion: { increment: 1 }, rememberToken: null, updatedAt: new Date() } });
  await tx.authSession.deleteMany({ where: { penggunaId: id } });
  // Outstanding reset links cannot outlive another security change.
  await tx.passwordResetRequest.updateMany({ where: { penggunaId: id, status: "disetujui" }, data: {
    status: "kedaluwarsa", tokenHash: null, token: null, updatedAt: new Date(),
  } });
}

export function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item));
}

export async function audit(tx: Tx, actorId: bigint | null, aksi: string, entity: string, detail: unknown = {}) {
  await tx.logAktivitas.create({ data: { penggunaId: actorId, aksi, entitasTerkait: entity, detail: jsonValue(detail) } });
  const actor = actorId ? await tx.pengguna.findUnique({ where: { id: actorId }, select: { role: true } }) : null;
  if (actor?.role === "superadmin") await tx.logSuperAdmin.create({ data: {
    aksi, targetType: entity.split(":")[0], targetIdentifier: entity,
    dataSesudah: jsonValue({ actorId, detail }), createdAt: new Date(), updatedAt: new Date(),
  } });
}

export function identitySnapshot(user: Account) {
  return {
    id: user.id, nama: user.nama, email: user.email, emailArsip: user.emailArsip,
    role: user.role, statusAkun: user.statusAkun, deletedAt: user.deletedAt,
    mahasiswa: user.mahasiswa, dosen: user.dosen,
  };
}

export async function settingsValues(tx: Pick<Tx, "pengaturanSistem">) {
  const rows = await tx.pengaturanSistem.findMany();
  return Object.fromEntries(rows.map((row) => [row.kunci, row.nilai]));
}

export async function assertIdentities(tx: Tx, id: bigint | undefined, values: { email?: string | null; nim?: string | null; nidn?: string | null }) {
  const otherUser = id ? { id: { not: id } } : {};
  if (values.email) ensure(!await tx.pengguna.findFirst({ where: { ...otherUser, email: values.email } }), "Email sudah digunakan. Hubungi pengelola untuk pemulihan akun.");
  if (values.nim) ensure(!await tx.mahasiswa.findFirst({ where: { nim: values.nim, ...(id ? { penggunaId: { not: id } } : {}) } }), "NIM sudah digunakan. Hubungi pengelola untuk pemulihan akun.");
  if (values.nidn) ensure(!await tx.dosen.findFirst({ where: { nidn: values.nidn, ...(id ? { penggunaId: { not: id } } : {}) } }), "NIDN sudah digunakan. Hubungi pengelola untuk pemulihan akun.");
}

export async function assertSingleKaprodi(tx: Tx, except?: bigint) {
  ensure(!await tx.pengguna.findFirst({ where: {
    deletedAt: null, statusAkun: "aktif", ...(except ? { id: { not: except } } : {}),
    OR: [{ role: "kaprodi" }, { role: "dosen", dosen: { isKaprodi: true } }],
  } }), "Sudah ada Kaprodi aktif. Gunakan penetapan peran untuk mengalihkan jabatan.");
}

export async function syncExpertise(tx: Tx, id: bigint, bidang: bigint[]) {
  ensure(bidang.length >= 2 && bidang.length <= 3 && new Set(bidang).size === bidang.length, "Pilih 2 sampai 3 bidang keahlian berbeda.");
  ensure(await tx.bidangKeahlian.count({ where: { id: { in: bidang } } }) === bidang.length, "Bidang keahlian tidak ditemukan.");
  await tx.dosenKeahlian.deleteMany({ where: { dosenId: id } });
  await tx.dosenKeahlian.createMany({ data: bidang.map((bidangId) => ({ dosenId: id, bidangId })) });
}
