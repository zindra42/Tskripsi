import "server-only";
import { z } from "zod";
import type { AuthenticatedSession } from "@/lib/auth/session";
import { idSchema, reasonSchema } from "@/lib/accounts/validation";
import { accountTransaction, audit, checkedActor, ensure, identitySnapshot, invalidateSessions, lockedAccount, type Account, type Tx } from "@/lib/accounts/store";
import { canGovern } from "./policy";

const kode = z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9.-]+$/).transform((v) => v.toUpperCase());
export const facultySchema = z.object({ kode, nama: z.string().trim().min(3).max(100), aktif: z.boolean() });
export const programSchema = facultySchema.extend({ fakultasId: idSchema, jenjang: z.enum(["D1", "D2", "D3", "D4", "S1", "S2", "S3", "Profesi"]) });

export async function activeProgram(tx: Tx, id: bigint | null | undefined) {
  ensure(id, "Pilih program studi master yang aktif. Data lama perlu ditautkan oleh superadmin.");
  const program = await tx.programStudi.findUnique({ where: { id }, include: { fakultas: true } });
  ensure(program?.aktif && program.fakultas.aktif, "Program studi atau fakultas tidak aktif/tidak ditemukan.");
  return program;
}

export function hasLeadership(user: Account) {
  return Boolean(user.dosen?.isKaprodi || user.dosen?.isSekpro || ["kaprodi", "sekpro"].includes(user.role));
}

export async function clearLeadership(tx: Tx, user: Account) {
  if (user.dosen) await tx.dosen.update({ where: { penggunaId: user.id }, data: { isKaprodi: false, isSekpro: false } });
  if (["kaprodi", "sekpro"].includes(user.role)) await tx.pengguna.update({ where: { id: user.id }, data: { role: "dosen" } });
}

export async function governor(tx: Tx, session: AuthenticatedSession, facultyId?: bigint) {
  const actor = await checkedActor(tx, session);
  const live = await tx.authSession.findUniqueOrThrow({ where: { tokenHash: session.tokenHash } });
  ensure(canGovern(actor, live.activeRole, facultyId), "Anda tidak berwenang mengelola fakultas ini.");
  return actor;
}

export async function rotateLeadership(tx: Tx, actor: Account, programId: bigint, office: "kaprodi" | "sekpro", targetId: bigint | null, reason: string) {
  if (targetId) await activeProgram(tx, programId);
  const target = targetId ? await lockedAccount(tx, targetId) : null;
  if (target) ensure(target.dosen?.programStudiId === programId && target.deletedAt === null && target.statusAkun === "aktif"
    && ["dosen", "kaprodi", "sekpro"].includes(target.role), "Pejabat harus dosen aktif dari program studi tujuan.");
  const key = office === "kaprodi" ? "isKaprodi" : "isSekpro";
  const old = await tx.pengguna.findMany({ where: { dosen: { programStudiId: programId }, OR: [{ role: office }, { dosen: { [key]: true } }] }, select: { id: true } });
  // Clear the unique slot before setting its replacement. Shared advisory lock serializes all entry points.
  for (const row of old) {
    const user = await lockedAccount(tx, row.id), before = identitySnapshot(user);
    await tx.dosen.update({ where: { penggunaId: row.id }, data: {
      isKaprodi: office === "kaprodi" ? false : user.dosen!.isKaprodi || user.role === "kaprodi",
      isSekpro: office === "sekpro" ? false : user.dosen!.isSekpro || user.role === "sekpro",
    } });
    if (["kaprodi", "sekpro"].includes(user.role)) await tx.pengguna.update({ where: { id: row.id }, data: { role: "dosen" } });
    await invalidateSessions(tx, row.id);
    await audit(tx, actor.id, `pemberhentian_${office}`, `pengguna:${row.id}`, { programId, replacementId: targetId, before, after: identitySnapshot(await lockedAccount(tx, row.id)), reason });
  }
  if (target) {
    const current = await lockedAccount(tx, target.id), before = identitySnapshot(current);
    await tx.dosen.update({ where: { penggunaId: target.id }, data: {
      isKaprodi: office === "kaprodi" || current.dosen!.isKaprodi || current.role === "kaprodi",
      isSekpro: office === "sekpro" || current.dosen!.isSekpro || current.role === "sekpro",
    } });
    await tx.pengguna.update({ where: { id: target.id }, data: { role: "dosen", fakultasId: null } });
    if (!old.some((u) => u.id === target.id)) await invalidateSessions(tx, target.id);
    await audit(tx, actor.id, `penetapan_${office}`, `pengguna:${target.id}`, { programId, before, after: identitySnapshot(await lockedAccount(tx, target.id)), reason });
  }
}

export async function appointLeadership(session: AuthenticatedSession, programId: bigint, office: "kaprodi" | "sekpro", targetId: bigint | null, reason: string) {
  reasonSchema.parse(reason);
  return accountTransaction(async (tx) => {
    const program = await tx.programStudi.findUnique({ where: { id: programId } });
    ensure(program, "Program studi tidak ditemukan.");
    const actor = await governor(tx, session, program.fakultasId);
    await rotateLeadership(tx, actor, program.id, office, targetId, reason);
  });
}

export async function saveFaculty(session: AuthenticatedSession, id: bigint | undefined, input: unknown, reason: string) {
  const data = facultySchema.parse(input); reasonSchema.parse(reason);
  return accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session, "superadmin");
    const before = id ? await tx.fakultas.findUnique({ where: { id } }) : null;
    ensure(!id || before, "Fakultas tidak ditemukan.");
    if (id && !data.aktif) {
      ensure(!await tx.programStudi.count({ where: { fakultasId: id, aktif: true } }), "Nonaktifkan prodi fakultas terlebih dahulu.");
      ensure(!await tx.pengguna.count({ where: { fakultasId: id, role: "dekan", statusAkun: "aktif", deletedAt: null } }), "Berhentikan Dekan terlebih dahulu.");
    }
    const after = id ? await tx.fakultas.update({ where: { id }, data }) : await tx.fakultas.create({ data });
    // Every affiliated identity loses its old session when faculty metadata/status changes.
    if (id) {
      const users = await tx.pengguna.findMany({ where: { OR: [{ fakultasId: id }, { dosen: { programStudi: { fakultasId: id } } }, { mahasiswa: { programStudi: { fakultasId: id } } }] }, select: { id: true } });
      for (const user of users) await invalidateSessions(tx, user.id);
    }
    await audit(tx, actor.id, "simpan_fakultas", `fakultas:${after.id}`, { before, after, reason });
  });
}

export async function saveProgram(session: AuthenticatedSession, id: bigint | undefined, input: unknown, reason: string) {
  const data = programSchema.parse(input); reasonSchema.parse(reason);
  return accountTransaction(async (tx) => {
    const before = id ? await tx.programStudi.findUnique({ where: { id } }) : null;
    ensure(!id || before, "Program studi tidak ditemukan.");
    const actor = await governor(tx, session, before?.fakultasId ?? data.fakultasId);
    ensure(!before || before.fakultasId === data.fakultasId, "Fakultas prodi tidak dapat dipindahkan. Tautkan ulang profil secara eksplisit.");
    const faculty = await tx.fakultas.findUnique({ where: { id: data.fakultasId } });
    ensure(faculty?.aktif, "Fakultas tidak aktif atau tidak ditemukan.");
    if (id && !data.aktif) ensure(!await tx.dosen.count({ where: { programStudiId: id, OR: [{ isKaprodi: true }, { isSekpro: true }, { pengguna: { role: { in: ["kaprodi", "sekpro"] } } }] } }), "Berhentikan Kaprodi dan Sekpro terlebih dahulu.");
    const after = id ? await tx.programStudi.update({ where: { id }, data }) : await tx.programStudi.create({ data });
    if (id) {
      const users = await tx.pengguna.findMany({ where: { OR: [{ dosen: { programStudiId: id } }, { mahasiswa: { programStudiId: id } }] }, select: { id: true } });
      for (const user of users) await invalidateSessions(tx, user.id);
      // Labels support legacy consumers; snapshots and archives are deliberately untouched.
      await tx.dosen.updateMany({ where: { programStudiId: id }, data: { prodi: data.nama } });
      await tx.mahasiswa.updateMany({ where: { programStudiId: id }, data: { prodi: data.nama } });
    }
    await audit(tx, actor.id, "simpan_program_studi", `program_studi:${after.id}`, { before, after, reason });
  });
}

export async function assignDean(session: AuthenticatedSession, facultyId: bigint, targetId: bigint | null, reason: string) {
  reasonSchema.parse(reason);
  return accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session, "superadmin");
    const faculty = await tx.fakultas.findUnique({ where: { id: facultyId } });
    ensure(faculty && (!targetId || faculty.aktif), "Fakultas tujuan harus aktif.");
    const target = targetId ? await lockedAccount(tx, targetId) : null;
    if (target) ensure(target.deletedAt === null && target.statusAkun === "aktif" && target.dosen && ["dosen", "kaprodi", "sekpro", "dekan"].includes(target.role), "Calon Dekan harus akun dosen aktif.");
    const old = await tx.pengguna.findMany({ where: { role: "dekan", fakultasId: facultyId } });
    for (const dean of old) {
      const before = identitySnapshot(await lockedAccount(tx, dean.id));
      await tx.pengguna.update({ where: { id: dean.id }, data: { role: "dosen", fakultasId: null } });
      await invalidateSessions(tx, dean.id);
      await audit(tx, actor.id, "pemberhentian_dekan", `pengguna:${dean.id}`, { before, after: identitySnapshot(await lockedAccount(tx, dean.id)), reason });
    }
    if (target) {
      const before = identitySnapshot(target);
      await clearLeadership(tx, target);
      await tx.pengguna.update({ where: { id: target.id }, data: { role: "dekan", fakultasId: facultyId } });
      await invalidateSessions(tx, target.id);
      await tx.biodataChangeRequest.updateMany({ where: { mahasiswaId: target.id, status: "pending" }, data: { status: "ditolak", catatanKaprodi: "Peran akun telah berubah." } });
      await tx.keahlianChangeRequest.updateMany({ where: { dosenId: target.id, status: "pending" }, data: { status: "ditolak", catatanKaprodi: "Peran akun telah berubah." } });
      await audit(tx, actor.id, "penetapan_dekan", `pengguna:${target.id}`, { before, after: identitySnapshot(await lockedAccount(tx, target.id)), reason });
    }
  });
}

export async function linkProfile(session: AuthenticatedSession, id: bigint, kind: "mahasiswa" | "dosen", programId: bigint, reason: string) {
  reasonSchema.parse(reason);
  return accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session, "superadmin");
    const user = await lockedAccount(tx, id);
    ensure(user[kind], "Profil historis yang dipilih tidak ditemukan.");
    const program = await activeProgram(tx, programId);
    const before = identitySnapshot(user);
    ensure(user[kind]!.programStudiId !== program.id, "Profil sudah terhubung ke prodi ini.");
    ensure(!hasLeadership(user) || !user.dosen?.programStudiId, "Berhentikan jabatan sebelum memindahkan afiliasi.");
    // Unmapped imported flags are historical evidence, never an appointment in a guessed faculty.
    if (hasLeadership(user)) await clearLeadership(tx, user);
    const data = { programStudiId: program.id, prodi: program.nama };
    if (kind === "mahasiswa") await tx.mahasiswa.update({ where: { penggunaId: id }, data });
    else await tx.dosen.update({ where: { penggunaId: id }, data });
    await invalidateSessions(tx, id);
    await audit(tx, actor.id, "tautkan_profil_prodi", `pengguna:${id}`, { before, after: identitySnapshot(await lockedAccount(tx, id)), reason });
  });
}

export async function organizationData(session: AuthenticatedSession) {
  return accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session);
    ensure(["superadmin", "dekan"].includes(actor.role), "Area tata kelola tidak tersedia.");
    const admin = actor.role === "superadmin";
    if (!canGovern(actor, session.activeRole)) return { actor, faculties: [], programs: [], candidates: [], profiles: [] };
    const faculties = await tx.fakultas.findMany({ where: admin ? {} : { id: actor.fakultasId! }, orderBy: { nama: "asc" }, include: { pengguna: { where: { role: "dekan", deletedAt: null }, select: { id: true, nama: true } } } });
    const programs = await tx.programStudi.findMany({ where: admin ? {} : { fakultasId: actor.fakultasId! }, include: { fakultas: true, dosen: { where: { OR: [{ isKaprodi: true }, { isSekpro: true }, { pengguna: { role: { in: ["kaprodi", "sekpro"] } } }] }, select: { penggunaId: true, isKaprodi: true, isSekpro: true, pengguna: { select: { nama: true, role: true } } } } }, orderBy: { nama: "asc" } });
    const candidates = await tx.pengguna.findMany({ where: { statusAkun: "aktif", deletedAt: null, role: { in: admin ? ["dosen", "kaprodi", "sekpro", "dekan"] : ["dosen", "kaprodi", "sekpro"] }, dosen: admin ? { isNot: null } : { programStudi: { fakultasId: actor.fakultasId!, aktif: true } } }, select: { id: true, nama: true, role: true, dosen: { select: { programStudiId: true } } }, orderBy: { nama: "asc" } });
    return { actor, faculties, programs, candidates, profiles: [] };
  });
}

export async function activeProgramOptions() {
  const { database } = await import("@/lib/db");
  return (await database().programStudi.findMany({ where: { aktif: true, fakultas: { aktif: true } }, include: { fakultas: true }, orderBy: [{ fakultasId: "asc" }, { nama: "asc" }] })).map((p) => ({ id: String(p.id), label: `${p.fakultas.nama} / ${p.nama} (${p.jenjang}, ${p.kode})` }));
}
