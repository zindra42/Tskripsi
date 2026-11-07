import "server-only";
import { z } from "zod";
import type { AuthenticatedSession } from "@/lib/auth/session";
import { reasonSchema, validateSettings } from "./validation";
import { AccountError, accountTransaction, audit, checkedActor, settingsValues } from "./store";

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

export async function addExpertise(session: AuthenticatedSession, name: string, reason: string) {
  const namaBidang = z.string().trim().min(3).max(255).parse(name);
  reasonSchema.parse(reason);
  return accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session, "superadmin");
    const bidang = await tx.bidangKeahlian.create({ data: { namaBidang, createdAt: new Date(), updatedAt: new Date() } });
    await audit(tx, actor.id, "tambah_bidang_keahlian", `bidang:${bidang.id}`, { namaBidang, reason });
  });
}
