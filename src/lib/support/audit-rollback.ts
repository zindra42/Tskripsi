import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { ensure, audit, assertIdentities, invalidateSessions } from "@/lib/accounts/store";
import { idSchema, emailSchema, identifierSchema } from "@/lib/accounts/validation";
import { reason } from "@/lib/academic/validation";
import { cancelSupervisor, type Context, type Input } from "@/lib/academic/store";

const aliases: Record<string, string> = {
  approve_akun: "account", reject_akun: "account",
  verifikasi_pembayaran_disetujui: "administration", verifikasi_pembayaran_ditolak: "administration",
  judul_skripsi_disetujui: "title", judul_skripsi_minta_revisi: "title", judul_approve: "title", judul_revise: "title",
  terbit_acc_sempro: "acc", acc_diterbitkan: "acc",
  selesaikan_jadwal_bimbingan: "schedule", konfirmasi_jadwal_bimbingan: "schedule", batalkan_jadwal_bimbingan: "schedule",
  jadwal_complete: "schedule", jadwal_confirm: "schedule", jadwal_cancel: "schedule",
  setujui_perubahan_judul: "change", tolak_perubahan_judul: "change", keputusan_perubahan_judul: "change",
  penetapan_dosen_pembimbing: "supervisor", update_profil: "profile", superadmin_update_profil: "profile",
  setujui_dispensasi_kehadiran: "dispensation", tolak_dispensasi_kehadiran: "dispensation",
  override_keputusan_dispensasi_kehadiran: "dispensation", DispensasiKehadiranDiputuskan: "dispensation",
};
export function reversibleAction(action: string) { return Object.hasOwn(aliases, action.replace(/^\[Super Admin\] /, "")); }
const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export async function rollbackAudit(context: Context, input: Input) {
  ensure(context.actor.role === "superadmin", "Pembatalan audit memerlukan superadmin.");
  ensure(String(input.confirmation).trim().toUpperCase() === "BATALKAN", "Ketik BATALKAN untuk mengonfirmasi.");
  const note = reason.parse(input.reason), canceller = idSchema.parse(input.cancellerId);
  ensure(await context.tx.pengguna.findUnique({ where: { id: canceller } }), "Pihak pembatal tidak ditemukan.");
  const log = await context.tx.logAktivitas.findUnique({ where: { id: idSchema.parse(input.logId) } });
  ensure(log && log.status !== "dibatalkan" && reversibleAction(log.aksi), "Aksi tidak dapat dibatalkan atau sudah dibatalkan.");
  ensure(!await context.tx.logAktivitas.findFirst({ where: { entitasTerkait: log.entitasTerkait, id: { gt: log.id }, status: { not: "dibatalkan" } } }),
    "Ada aktivitas lebih baru pada entitas ini. Gunakan koreksi proses sesuai keadaan terbaru.");
  const action = log.aksi.replace(/^\[Super Admin\] /, ""), kind = aliases[action];
  const payload = record(log.detail ?? log.data), previous = record(payload.before);
  const match = log.entitasTerkait?.match(/(?:pengguna:|administrasi:|judul:|dokumen:|jadwal:|perubahan:|bimbingan:|dispensasi_kehadiran_sempro:|VerifikasiPembayaran #|PengajuanJudul #|DokumenVerifikasi #|Pengajuan Perubahan Judul #|Bimbingan #|Dispensasi #)([1-9]\d*)/);
  const id = match ? idSchema.parse(match[1]) : kind === "profile" ? idSchema.parse(String(payload.user_id)) : null;
  ensure(id, "Referensi historis tidak dapat dipetakan; perlu rekonsiliasi.");
  let before: unknown, after: unknown;
  if (kind === "account") {
    const user = await context.tx.pengguna.findUnique({ where: { id } });
    ensure(user && user.id !== context.actor.id && user.role !== "superadmin" && !user.deletedAt, "Akun tidak dapat dibatalkan melalui audit ini.");
    before = { statusAkun: user.statusAkun, catatanPenolakan: user.catatanPenolakan };
    after = await context.tx.pengguna.update({ where: { id }, data: { statusAkun: "menunggu_persetujuan", catatanPenolakan: null } });
    await invalidateSessions(context.tx, id);
    // Never copy password/session fields into audit snapshots.
    after = { statusAkun: "menunggu_persetujuan", catatanPenolakan: null };
  } else if (kind === "administration") {
    before = await context.tx.verifikasiPembayaran.findUnique({ where: { id } }); ensure(before, "Administrasi tidak ditemukan.");
    after = await context.tx.verifikasiPembayaran.update({ where: { id }, data: { statusVerifikasi: "menunggu_verifikasi", catatanPenolakan: null,
      perluVerifikasiUlang: false, revision: { increment: 1 }, updatedAt: new Date() } });
  } else if (kind === "title") {
    before = await context.tx.pengajuanJudul.findUnique({ where: { id } }); ensure(before, "Judul tidak ditemukan.");
    after = await context.tx.pengajuanJudul.update({ where: { id }, data: { status: "diajukan", updatedAt: new Date() } });
  } else if (kind === "acc") {
    const doc = await context.tx.dokumenVerifikasi.findUnique({ where: { id } });
    ensure(doc?.jenisDokumen === "acc" && doc.status === "sah", "ACC sempro aktif tidak ditemukan.");
    before = doc;
    after = await context.tx.dokumenVerifikasi.update({ where: { id }, data: { status: "dicabut", dicabutAt: new Date(), dicabutOlehId: context.actor.id,
      alasanPencabutan: note, updatedAt: new Date() } });
    if (doc.idSempro) await context.tx.checklistDokumen.updateMany({ where: { idSempro: doc.idSempro, nomorItem: 1 }, data: { statusItem: "kosong", updatedAt: new Date() } });
  } else if (kind === "schedule") {
    const schedule = await context.tx.jadwalBimbingan.findUnique({ where: { id } }); ensure(schedule && !schedule.deletedAt, "Jadwal bimbingan tidak ditemukan.");
    before = schedule;
    const status = typeof previous.status === "string" ? previous.status : ["konfirmasi_jadwal_bimbingan", "jadwal_confirm"].includes(action) ? "diajukan" : "dikonfirmasi_mahasiswa";
    after = await context.tx.jadwalBimbingan.update({ where: { id }, data: { status, updatedAt: new Date() } });
  } else if (kind === "change") {
    const change = await context.tx.pengajuanPerubahanJudul.findUnique({ where: { id }, include: { bimbingan: { include: { pengajuan: true } } } });
    ensure(change && ["disetujui", "ditolak_kaprodi"].includes(change.status), "Keputusan perubahan judul tidak ditemukan.");
    before = change;
    if (change.status === "disetujui") await context.tx.pengajuanJudul.update({ where: { id: change.bimbingan.idPengajuan }, data: {
      judul: change.judulLama, matriksPenelitian: change.matriksLama === null ? Prisma.JsonNull : change.matriksLama,
      updatedAt: new Date(),
    } });
    after = await context.tx.pengajuanPerubahanJudul.update({ where: { id }, data: { status: "menunggu_kaprodi", updatedAt: new Date() } });
  } else if (kind === "supervisor") {
    const guidance = await context.tx.bimbingan.findUnique({ where: { id } }); ensure(guidance, "Bimbingan tidak ditemukan.");
    before = guidance;
    // Preserve guidance/logbook identities instead of Laravel's physical delete.
    if (guidance.idDosenPembimbing) await cancelSupervisor(context, id, 1, note);
    if (guidance.idDosenPembimbing2) await cancelSupervisor(context, id, 2, note);
    after = await context.tx.bimbingan.findUnique({ where: { id } });
  } else if (kind === "profile") {
    const user = await context.tx.pengguna.findUnique({ where: { id }, include: { mahasiswa: true, dosen: true } });
    ensure(user && !user.deletedAt, "Profil aktif tidak ditemukan.");
    const values = Object.keys(record(payload.old_values)).length ? record(payload.old_values) : previous;
    const nama = typeof payload.before === "string" ? payload.before : values.nama;
    const email = values.email === undefined ? undefined : emailSchema.parse(values.email);
    const nim = values.nim === undefined ? undefined : identifierSchema.parse(values.nim);
    const nidn = values.nidn === undefined ? undefined : identifierSchema.parse(values.nidn);
    ensure(nama !== undefined || email !== undefined || nim !== undefined || nidn !== undefined || values.semester !== undefined || values.no_hp !== undefined || values.kuota_bimbingan !== undefined,
      "Snapshot profil lama tidak tersedia; perlu rekonsiliasi.");
    await assertIdentities(context.tx, id, { email, nim, nidn });
    before = { nama: user.nama, email: user.email, mahasiswa: user.mahasiswa, dosen: user.dosen };
    await context.tx.pengguna.update({ where: { id }, data: { ...(nama === undefined ? {} : { nama: z.string().trim().min(3).max(255).parse(nama) }), email, updatedAt: new Date() } });
    const noHp = values.no_hp === undefined ? undefined : values.no_hp === null ? null : z.string().regex(/^\d{9,15}$/).parse(values.no_hp);
    if (user.mahasiswa) await context.tx.mahasiswa.update({ where: { penggunaId: id }, data: { nim, noHp,
      ...(values.semester === undefined ? {} : { semester: z.coerce.number().int().min(1).max(14).parse(values.semester) }), updatedAt: new Date() } });
    if (user.dosen) await context.tx.dosen.update({ where: { penggunaId: id }, data: { nidn, noHp,
      ...(values.kuota_bimbingan === undefined ? {} : { kuotaBimbingan: z.coerce.number().int().min(0).max(1000).parse(values.kuota_bimbingan) }), updatedAt: new Date() } });
    after = { nama, email, nim, nidn, noHp };
  } else {
    const dispensation = await context.tx.dispensasiKehadiranSempro.findUnique({ where: { id }, include: { sempro: { include: { jadwal: { include: { beritaAcara: true } } } } } });
    ensure(dispensation && !dispensation.sempro.jadwal?.beritaAcara?.hasil, "Dispensasi tidak tersedia atau berita acara telah resmi.");
    before = dispensation;
    after = await context.tx.dispensasiKehadiranSempro.update({ where: { id }, data: { status: "menunggu", diputuskanOleh: null, peranPemutus: null,
      alasanKeputusan: null, diputuskanPada: null, updatedAt: new Date() } });
    const sempro = dispensation.sempro;
    if (sempro.dispensasiId === id) await context.tx.pendaftaranSempro.update({ where: { id: sempro.id }, data: { dispensasiId: null,
      statusFinal: (sempro.terkumpulFinal ?? 0) < (sempro.syaratFinal ?? 0) ? "tertahan" : "terpenuhi", updatedAt: new Date() } });
  }
  await context.tx.logAktivitas.update({ where: { id: log.id }, data: { status: "dibatalkan", dibatalkanAt: new Date(), dibatalkanOlehId: canceller,
    pelakuAsliId: context.actor.id, alasanPembatalan: note } });
  await audit(context.tx, context.actor.id, "batalkan_aksi_log", `log:${log.id}`, { sourceAction: log.aksi, displayedCancellerId: canceller, before, after, reason: note });
}
