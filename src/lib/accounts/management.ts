import "server-only";
import { activeProgram, hasLeadership, clearLeadership, rotateLeadership } from "@/lib/organization/store";
import { z } from "zod";
import type { AuthenticatedSession } from "@/lib/auth/session";
import { canDecideAccount, hasAuthority, restoredIdentity } from "./policy";
import { reasonSchema, identifierSchema, idSchema } from "./validation";
import { accountTransaction, assertIdentities, assertSingleKaprodi, audit, checkedActor, ensure, identitySnapshot, invalidateSessions, lockedAccount, settingsValues } from "./store";

export async function decideAccounts(session: AuthenticatedSession, ids: bigint[], approve: boolean, reason: string) {
  ensure(ids.length >= 1 && ids.length <= 50 && new Set(ids).size === ids.length, "Pilih 1 sampai 50 akun berbeda.");
  if (!approve) reasonSchema.parse(reason);
  return accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session, "manage");
    const settings = await settingsValues(tx);
    for (const id of ids) {
      const target = await lockedAccount(tx, id);
      ensure(target.deletedAt === null && target.statusAkun === "menunggu_persetujuan", "Akun sudah diproses atau terhapus. Muat ulang daftar.");
      ensure(canDecideAccount(actor, target), "Persetujuan akun pimpinan memerlukan Kaprodi atau superadmin.");
      if (approve) {
        if (["mahasiswa", "dosen", "kaprodi", "sekpro"].includes(target.role)) await activeProgram(tx, target.role === "mahasiswa" ? target.mahasiswa?.programStudiId : target.dosen?.programStudiId);
        for (const office of ["kaprodi", "sekpro"] as const) if (target.role === office || target.dosen?.[office === "kaprodi" ? "isKaprodi" : "isSekpro"]) await assertSingleKaprodi(tx, id, target.dosen?.programStudiId, office);
      }
      await tx.pengguna.update({ where: { id }, data: { statusAkun: approve ? "aktif" : "ditolak", catatanPenolakan: approve ? null : reason } });
      if (approve && target.dosen) await tx.dosen.update({ where: { penggunaId: id }, data: { kuotaBimbingan: Number(settings.kuota_bimbingan_default ?? 10) } });
      await invalidateSessions(tx, id);
      await audit(tx, actor.id, approve ? "approve_akun" : "reject_akun", `pengguna:${id}`, { before: target.statusAkun, after: approve ? "aktif" : "ditolak", reason });
    }
  });
}

export async function changeAccountStatus(session: AuthenticatedSession, id: bigint, action: "delete" | "restore" | "activate" | "deactivate", reason: string, confirmation: string) {
  reasonSchema.parse(reason);
  if (action === "restore" || action === "delete") ensure(confirmation === "KONFIRMASI", "Ketik KONFIRMASI untuk melanjutkan.");
  return accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session, action === "delete" ? "manage" : "superadmin");
    const target = await lockedAccount(tx, id);
    ensure(actor.id !== id && target.role !== "superadmin", "Tindakan terhadap akun sendiri atau superadmin tidak diizinkan.");
    if (action === "delete") ensure(canDecideAccount(actor, target), "Akun berada di luar kewenangan Anda.");
    const before = identitySnapshot(target);
    if (target.role === "dekan" && (action === "restore" || action === "activate")) {
      const faculty = target.fakultasId ? await tx.fakultas.findUnique({ where: { id: target.fakultasId } }) : null;
      ensure(faculty?.aktif, "Penempatan Dekan memerlukan fakultas aktif. Tetapkan melalui tata kelola.");
      ensure(!await tx.pengguna.findFirst({ where: { id: { not: id }, role: "dekan", fakultasId: target.fakultasId, statusAkun: "aktif", deletedAt: null } }), "Fakultas sudah mempunyai Dekan aktif.");
    }
    if (action === "delete" || action === "deactivate") {
      ensure(target.deletedAt === null, "Akun sudah terhapus.");
      ensure(!hasLeadership(target), "Alihkan atau berhentikan jabatan Kaprodi/Sekpro sebelum menonaktifkan atau menghapus akunnya.");
    }
    if (action === "delete") {
      // Preserve both versions if a legacy row contains active and archived credentials.
      await tx.pengguna.update({ where: { id }, data: { emailArsip: target.emailArsip || target.email, email: null, deletedAt: new Date() } });
      if (target.mahasiswa) await tx.mahasiswa.update({ where: { penggunaId: id }, data: { nimArsip: target.mahasiswa.nimArsip || target.mahasiswa.nim, nim: null } });
      if (target.dosen) await tx.dosen.update({ where: { penggunaId: id }, data: { nidnArsip: target.dosen.nidnArsip || target.dosen.nidn, nidn: null } });
    } else if (action === "restore") {
      ensure(target.deletedAt !== null, "Akun sudah dipulihkan.");
      const email = restoredIdentity(target.email, target.emailArsip, "email");
      const nim = restoredIdentity(target.mahasiswa?.nim ?? null, target.mahasiswa?.nimArsip ?? null, "identifier");
      const nidn = restoredIdentity(target.dosen?.nidn ?? null, target.dosen?.nidnArsip ?? null, "identifier");
      ensure(email && z.email().safeParse(email).success, "Email pemulihan tidak tersedia atau tidak valid.");
      await assertIdentities(tx, id, { email, nim, nidn });
      for (const office of ["kaprodi", "sekpro"] as const) if (target.role === office || target.dosen?.[office === "kaprodi" ? "isKaprodi" : "isSekpro"]) await assertSingleKaprodi(tx, id, target.dosen?.programStudiId, office);
      await tx.pengguna.update({ where: { id }, data: { email, emailArsip: null, deletedAt: null, statusAkun: "aktif", catatanPenolakan: null } });
      if (target.mahasiswa) await tx.mahasiswa.update({ where: { penggunaId: id }, data: { nim, nimArsip: null } });
      if (target.dosen) await tx.dosen.update({ where: { penggunaId: id }, data: { nidn, nidnArsip: null } });
    } else {
      ensure(target.deletedAt === null && target.statusAkun === (action === "activate" ? "nonaktif" : "aktif"), "Status akun sudah berubah. Muat ulang daftar.");
      if (action === "activate") for (const office of ["kaprodi", "sekpro"] as const) if (target.role === office || target.dosen?.[office === "kaprodi" ? "isKaprodi" : "isSekpro"]) await assertSingleKaprodi(tx, id, target.dosen?.programStudiId, office);
      await tx.pengguna.update({ where: { id }, data: { statusAkun: action === "activate" ? "aktif" : "nonaktif" } });
    }
    await invalidateSessions(tx, id);
    await audit(tx, actor.id, `${action}_akun`, `pengguna:${id}`, { reason, before, after: identitySnapshot(await lockedAccount(tx, id)), transformation: action === "restore" ? "archive-verbatim-or-terminal-active-suffix-v2" : null });
  });
}

export async function assignRole(session: AuthenticatedSession, id: bigint, input: unknown, reason: string, confirmation: string) {
  const data = z.object({ role: z.enum(["mahasiswa", "dosen", "kaprodi", "sekpro"]), identifier: identifierSchema.optional(), programStudiId: idSchema.optional() }).parse(input);
  reasonSchema.parse(reason);
  ensure(confirmation === "UBAH PERAN", "Ketik UBAH PERAN untuk melanjutkan.");
  return accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session, "superadmin");
    const target = await lockedAccount(tx, id);
    ensure(target.role !== "superadmin" && target.deletedAt === null && target.statusAkun === "aktif", "Penetapan memerlukan akun aktif selain superadmin.");
    const effectiveRole = hasAuthority(target, "kaprodi") ? "kaprodi" : hasAuthority(target, "sekpro") ? "sekpro" : target.role;
    ensure(data.role !== effectiveRole, "Peran tujuan harus berbeda dari peran saat ini.");
    const before = identitySnapshot(target);
    if (data.role === "kaprodi" || data.role === "sekpro") {
      ensure(target.dosen && ["dosen", "kaprodi", "sekpro"].includes(target.role), "Pejabat harus akun dosen aktif; ubah peran dan afiliasi terlebih dahulu.");
      const program = await activeProgram(tx, target.dosen.programStudiId);
      await rotateLeadership(tx, actor, program.id, data.role, id, reason);
      return;
    }
    const existingProfile = data.role === "mahasiswa" ? target.mahasiswa : target.dosen;
    const program = await activeProgram(tx, data.programStudiId ?? existingProfile?.programStudiId);
    await clearLeadership(tx, target);
    const now = new Date();
    if (data.role === "mahasiswa") {
      if (!target.mahasiswa) {
        ensure(data.identifier, "NIM wajib diisi untuk profil mahasiswa baru.");
        await assertIdentities(tx, id, { nim: data.identifier });
        await tx.mahasiswa.create({ data: { penggunaId: id, programStudiId: program.id, prodi: program.nama, nim: data.identifier, semester: 1, noHp: null, createdAt: now, updatedAt: now } });
      }
      await tx.mahasiswa.update({ where: { penggunaId: id }, data: { programStudiId: program.id, prodi: program.nama } });
    } else {
      if (!target.dosen) {
        ensure(data.identifier, "NIDN wajib diisi untuk profil dosen baru.");
        await assertIdentities(tx, id, { nidn: data.identifier });
        const settings = await settingsValues(tx);
        await tx.dosen.create({ data: { penggunaId: id, programStudiId: program.id, prodi: program.nama, nidn: data.identifier, kuotaBimbingan: Number(settings.kuota_bimbingan_default ?? 10), createdAt: now, updatedAt: now } });
      }
      await tx.dosen.update({ where: { penggunaId: id }, data: { isKaprodi: false, isSekpro: false, programStudiId: program.id, prodi: program.nama } });
    }
    // Historical profiles stay attached to the source ID for phased migration.
    await tx.pengguna.update({ where: { id }, data: { role: data.role === "mahasiswa" ? "mahasiswa" : "dosen", fakultasId: null } });
    await invalidateSessions(tx, id);
    // Requests from the former role must never apply to the new role.
    await tx.biodataChangeRequest.updateMany({ where: { mahasiswaId: id, status: "pending" }, data: { status: "ditolak", catatanKaprodi: "Peran akun telah berubah.", diputuskanOleh: actor.id, diputuskanAt: now } });
    await tx.keahlianChangeRequest.updateMany({ where: { dosenId: id, status: "pending" }, data: { status: "ditolak", catatanKaprodi: "Peran akun telah berubah.", diputuskanOleh: actor.id, diputuskanAt: now } });
    await audit(tx, actor.id, "penetapan_peran_pengguna", `pengguna:${id}`, { reason, before, after: identitySnapshot(await lockedAccount(tx, id)) });
  });
}
