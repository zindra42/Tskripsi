import "server-only";
import { z } from "zod";
import type { AuthenticatedSession } from "@/lib/auth/session";
import { idSchema, reasonSchema, validateSettings } from "./validation";
import { AccountError, accountTransaction, audit, checkedActor, ensure, settingsValues } from "./store";
import { activeProgram } from "@/lib/organization/store";
import { matrixExpertiseIds } from "./expertise";

export async function saveSettings(session: AuthenticatedSession, input: Record<string, unknown>, reason: string) {
  reasonSchema.parse(reason);
  let settings: Record<string, string>;
  try { settings = validateSettings(input); }
  catch (error) {
    if (error instanceof z.ZodError) throw error;
    throw new AccountError((error as Error).message);
  }
  return accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session, "settings");
    const before = await settingsValues(tx);
    for (const [kunci, nilai] of Object.entries(settings)) {
      await tx.pengaturanSistem.upsert({ where: { kunci }, create: { kunci, nilai, createdAt: new Date(), updatedAt: new Date() }, update: { nilai, updatedAt: new Date() } });
    }
    await tx.pengaturanSistem.upsert({ where: { kunci: "minimal_kehadiran_sempro" },
      create: { kunci: "minimal_kehadiran_sempro", nilai: settings.minimal_hadir_seminar_lain }, update: { nilai: settings.minimal_hadir_seminar_lain } });
    await tx.dosen.updateMany({ where: { pengguna: { deletedAt: null, statusAkun: "aktif", role: { in: ["dosen", "kaprodi", "sekpro"] } } }, data: { kuotaBimbingan: Number(settings.kuota_bimbingan_default), updatedAt: new Date() } });
    await audit(tx, actor.id, "update_pengaturan_sistem", "pengaturan_sistem", { reason, before, after: settings });
  });
}

export async function addExpertise(session: AuthenticatedSession, name: string, programId: bigint, reason: string) {
  const namaBidang = z.string().trim().min(3).max(255).parse(name);
  reasonSchema.parse(reason);
  return accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session, "superadmin");
    const program = await activeProgram(tx, programId);
    const bidang = await tx.bidangKeahlian.create({ data: { namaBidang, programStudiId: program.id, createdAt: new Date(), updatedAt: new Date() } });
    await audit(tx, actor.id, "tambah_bidang_keahlian", `bidang:${bidang.id}`, { namaBidang, programStudiId: program.id, reason });
  });
}

export async function linkLegacyExpertise(session: AuthenticatedSession, id: bigint, programId: bigint, reason: string) {
  reasonSchema.parse(reason);
  return accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session, "superadmin");
    const program = await activeProgram(tx, programId);
    const field = await tx.bidangKeahlian.findUnique({ where: { id } });
    ensure(field && field.programStudiId === null, "Hanya bidang legacy yang belum terpetakan dapat ditautkan.");
    const check = (ownerProgram: bigint | null | undefined) => ensure(ownerProgram === program.id,
      "Referensi historis bidang berada di prodi lain atau belum terpetakan. Tautkan profil yang sesuai atau buat bidang baru per prodi.");
    const pivots = await tx.dosenKeahlian.findMany({ where: { bidangId: id }, include: { dosen: { select: { programStudiId: true } } } });
    for (const pivot of pivots) check(pivot.dosen.programStudiId);
    // Include archived/soft-deleted owners and every matrix row, not just the scalar first row.
    const titles = await tx.pengajuanJudul.findMany({ select: {
      bidangKeahlianId: true, bidangKeahlian2Id: true, matriksPenelitian: true, draftData: true,
      mahasiswa: { select: { mahasiswa: { select: { programStudiId: true } } } },
    } });
    for (const title of titles) {
      const draft = title.draftData;
      const draftMatrix = draft && typeof draft === "object" && !Array.isArray(draft) ? draft.matriks : null;
      if ([title.bidangKeahlianId, title.bidangKeahlian2Id, ...matrixExpertiseIds(title.matriksPenelitian), ...matrixExpertiseIds(draftMatrix)].includes(id)) {
        check(title.mahasiswa.mahasiswa?.programStudiId);
      }
    }
    const changes = await tx.pengajuanPerubahanJudul.findMany({ select: {
      bidangKeahlianIdBaru: true, bidangKeahlian2IdBaru: true, matriksLama: true, matriksBaru: true,
      bimbingan: { select: { pengajuan: { select: { mahasiswa: { select: { mahasiswa: { select: { programStudiId: true } } } } } } } },
    } });
    for (const change of changes) {
      if ([change.bidangKeahlianIdBaru, change.bidangKeahlian2IdBaru, ...matrixExpertiseIds(change.matriksLama), ...matrixExpertiseIds(change.matriksBaru)].includes(id)) {
        check(change.bimbingan.pengajuan.mahasiswa.mahasiswa?.programStudiId);
      }
    }
    const requests = await tx.keahlianChangeRequest.findMany({ select: {
      keahlianLama: true, keahlianDiajukan: true, programStudiLamaId: true, programStudiBaruId: true, ubahProgramStudi: true,
      dosen: { select: { dosen: { select: { programStudiId: true } } } },
    } });
    for (const request of requests) {
      for (const key of ["keahlianLama", "keahlianDiajukan"] as const) {
        const values = request[key];
        if (!Array.isArray(values)) continue;
        const ids = values.map((value) => {
          ensure(typeof value === "string" || typeof value === "number" && Number.isSafeInteger(value), "ID keahlian historis tidak valid.");
          return idSchema.parse(String(value));
        });
        if (ids.includes(id)) check(key === "keahlianDiajukan" && request.ubahProgramStudi
          ? request.programStudiBaruId : request.programStudiLamaId ?? request.dosen.dosen?.programStudiId);
      }
    }
    const result = await tx.bidangKeahlian.updateMany({ where: { id, programStudiId: null }, data: { programStudiId: program.id, updatedAt: new Date() } });
    ensure(result.count === 1, "Pemetaan bidang telah berubah. Muat ulang halaman.");
    await audit(tx, actor.id, "tautkan_bidang_prodi", `bidang:${id}`, { before: field, after: { ...field, programStudiId: program.id }, reason });
  });
}
