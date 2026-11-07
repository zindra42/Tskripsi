import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ensure, jsonValue, settingsValues } from "@/lib/accounts/store";
import { idSchema } from "@/lib/accounts/validation";
import { canManage } from "@/lib/accounts/policy";
import { isAssigned } from "./policy";
import { dateOnly, localDateTime, reason } from "./validation";
import { event, guidanceRecord, requireSupervisor, type Context, type Input } from "./store";

export async function addLog(context: Context, input: Input) {
  const b = await guidanceRecord(context, idSchema.parse(input.id));
  const owner = context.actor.role === "mahasiswa" && b.pengajuan.idMahasiswa === context.actor.id;
  if (!owner) requireSupervisor(context, b);
  const dosenId = owner ? idSchema.parse(input.dosenId) : context.actor.id;
  ensure(isAssigned(dosenId, b), "Dosen harus merupakan pembimbing yang ditetapkan.");
  const phase = z.enum(["sempro", "skripsi"]).parse(input.fase);
  ensure(phase === "sempro" || b.faseSkripsiAt, "Fase skripsi menunggu hasil resmi sempro lulus dan revisi selesai.");
  const row = await context.tx.logbookBimbingan.create({ data: {
    idBimbingan: b.id, idDosen: dosenId, tanggal: dateOnly.parse(input.tanggal), catatan: z.string().trim().min(3).max(5000).parse(input.catatan),
    statusSelesai: z.boolean().parse(input.selesai), fase: phase, siklusKe: b.siklusKe, createdAt: new Date(), updatedAt: new Date(),
  } });
  // The source allows either participant to record a completed session. Lecturers can cancel invalid entries.
  await event(context, "tambah_logbook_bimbingan", `logbook:${row.id}`, null, row,
    owner ? [dosenId] : [b.pengajuan.idMahasiswa], "Sesi bimbingan baru telah dicatat.", `/bimbingan/${b.id}`);
}

export async function updateLog(context: Context, input: Input, cancel: boolean) {
  const row = await context.tx.logbookBimbingan.findUnique({ where: { id: idSchema.parse(input.id) } });
  ensure(row, "Logbook tidak ditemukan.");
  const b = await guidanceRecord(context, row.idBimbingan);
  ensure(!row.isDibatalkan && row.siklusKe === b.siklusKe, "Logbook dibatalkan atau merupakan arsip siklus sebelumnya.");
  const note = cancel ? reason.parse(input.reason) : z.string().trim().min(3).max(1000).parse(input.catatan);
  if (cancel) {
    if (!canManage(context.actor, context.role, "settings")) requireSupervisor(context, b);
  } else ensure(context.actor.role === "mahasiswa" && context.actor.id === b.pengajuan.idMahasiswa, "Catatan hanya dapat diisi mahasiswa pemilik.");
  const data = cancel ? { isDibatalkan: true, dibatalkanAt: new Date(), dibatalkanOlehId: context.actor.id, alasanPembatalan: note, updatedAt: new Date() }
    : { catatanMahasiswa: note, updatedAt: new Date() };
  await context.tx.logbookBimbingan.update({ where: { id: row.id }, data });
  await event(context, cancel ? "pembatalan_sesi_bimbingan" : "isi_catatan_mahasiswa_logbook", `logbook:${row.id}`, row, data,
    [b.pengajuan.idMahasiswa, row.idDosen], note, `/bimbingan/${b.id}`);
}

export async function acc(context: Context, input: Input, cancel: boolean) {
  const b = await guidanceRecord(context, idSchema.parse(input.id));
  requireSupervisor(context, b);
  const phase = z.enum(["sempro", "skripsi"]).parse(input.fase);
  const jenisDokumen = phase === "sempro" ? "acc" : "acc_sidang";
  const { tx, actor } = context;
  const existing = await tx.dokumenVerifikasi.findFirst({ where: { idBimbingan: b.id, penandatanganUserId: actor.id, jenisDokumen, status: "sah" } });
  if (cancel) {
    ensure(existing, "ACC aktif tidak ditemukan.");
    // Sidang registration locks are added by its lifecycle. Until then only sempro cancellation is exposed.
    ensure(phase === "sempro", "Pembatalan ACC sidang memerlukan pemeriksaan pendaftaran pada modul sidang.");
    const note = reason.parse(input.reason);
    await tx.dokumenVerifikasi.update({ where: { id: existing.id }, data: { status: "dicabut", dicabutAt: new Date(), dicabutOlehId: actor.id, alasanPencabutan: note, updatedAt: new Date() } });
    await event(context, "acc_sempro_dibatalkan", `dokumen:${existing.id}`, existing, { status: "dicabut", note }, [b.pengajuan.idMahasiswa], note, `/bimbingan/${b.id}`);
    return;
  }
  if (existing) return;
  const settings = await settingsValues(tx);
  const minimum = Number(settings[phase === "sempro" ? "minimal_sesi_bimbingan_acc_sempro" : "minimal_sesi_bimbingan_skripsi"] || "7");
  const count = await tx.logbookBimbingan.count({ where: { idBimbingan: b.id, fase: phase, statusSelesai: true, isDibatalkan: false,
    ...(phase === "skripsi" ? { siklusKe: b.siklusKe } : {}),
  } });
  ensure(Number.isInteger(minimum) && minimum > 0 && count >= minimum, "Jumlah minimum sesi bimbingan selesai belum terpenuhi.");
  ensure(phase === "sempro" || b.faseSkripsiAt, "Hasil sempro resmi belum memenuhi syarat fase skripsi.");
  const previous = await tx.dokumenVerifikasi.findFirst({ where: { idBimbingan: b.id, penandatanganUserId: actor.id, jenisDokumen }, orderBy: { versi: "desc" } });
  const document = await tx.dokumenVerifikasi.create({ data: {
    jenisDokumen, token: randomBytes(24).toString("hex"), idPengajuan: b.idPengajuan, idBimbingan: b.id,
    penandatanganUserId: actor.id, namaPenandatangan: actor.nama, peran: b.idDosenPembimbing === actor.id ? "pembimbing_1" : "pembimbing_2",
    jabatanSnapshot: b.idDosenPembimbing === actor.id ? "Dosen Pembimbing Utama" : "Dosen Pembimbing Pendamping",
    status: "sah", versi: (previous?.versi ?? 0) + 1, diterbitkanAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    snapshotJson: jsonValue({ snapshot_version: "sias-ts-academic-v1", judul: b.pengajuan.judul, mahasiswa_id: b.pengajuan.idMahasiswa,
      pembimbing_1_id: b.idDosenPembimbing, pembimbing_2_id: b.idDosenPembimbing2, fase: phase, siklus_ke: b.siklusKe, jumlah_sesi: count, minimal_sesi: minimum }),
  } });
  await event(context, "acc_diterbitkan", `dokumen:${document.id}`, null, { id: document.id, fase: phase, versi: document.versi }, [b.pengajuan.idMahasiswa], "ACC bimbingan telah diterbitkan.", `/bimbingan/${b.id}`);
}

export async function saveSchedule(context: Context, input: Input, edit: boolean) {
  const { tx, actor } = context;
  const previous = edit ? await tx.jadwalBimbingan.findUnique({ where: { id: idSchema.parse(input.id) } }) : null;
  if (edit) ensure(previous && previous.dosenId === actor.id && !previous.deletedAt && !["selesai", "dibatalkan"].includes(previous.status), "Jadwal sudah selesai, dibatalkan, atau milik dosen lain.");
  const b = await guidanceRecord(context, edit ? previous!.bimbinganId! : idSchema.parse(input.id));
  requireSupervisor(context, b);
  const start = localDateTime.parse(input.mulai);
  const end = localDateTime.parse(input.selesai);
  ensure(start > new Date() && end > start, "Waktu mulai harus mendatang dan selesai sesudah mulai.");
  const data = { waktuMulai: start, waktuSelesai: end, lokasi: z.string().trim().min(1).max(255).parse(input.lokasi),
    catatan: z.string().max(1000).parse(input.catatan ?? ""), status: "diajukan", alasanReschedule: null, usulanWaktuReschedule: null, updatedAt: new Date() };
  const schedule = previous ? await tx.jadwalBimbingan.update({ where: { id: previous.id }, data })
    : await tx.jadwalBimbingan.create({ data: { ...data, dosenId: actor.id, mahasiswaId: b.pengajuan.idMahasiswa, bimbinganId: b.id, createdAt: new Date() } });
  await event(context, edit ? "ubah_jadwal_bimbingan" : "buat_jadwal_bimbingan", `jadwal:${schedule.id}`, previous, schedule,
    [b.pengajuan.idMahasiswa], "Jadwal bimbingan menunggu konfirmasi mahasiswa.", `/bimbingan/${b.id}`);
}

export async function transitionSchedule(context: Context, input: Input, command: "confirm" | "reschedule" | "complete" | "cancel") {
  const { tx, actor } = context;
  const row = await tx.jadwalBimbingan.findUnique({ where: { id: idSchema.parse(input.id) } });
  ensure(row && row.bimbinganId && !row.deletedAt && !["selesai", "dibatalkan"].includes(row.status), "Jadwal tidak tersedia untuk tindakan ini.");
  const b = await guidanceRecord(context, row.bimbinganId);
  const student = command === "confirm" || command === "reschedule";
  if (student) ensure(actor.role === "mahasiswa" && row.mahasiswaId === actor.id, "Hanya mahasiswa pemilik jadwal yang dapat mengonfirmasi.");
  else {
    requireSupervisor(context, b);
  }
  const note = command === "reschedule" ? reason.parse(input.reason) : null;
  const proposed = command === "reschedule" && input.usulan ? localDateTime.parse(input.usulan) : null;
  if (proposed) ensure(proposed > new Date(), "Usulan jadwal harus mendatang.");
  const status = { confirm: "dikonfirmasi_mahasiswa", reschedule: "reschedule_diminta", complete: "selesai", cancel: "dibatalkan" }[command];
  await tx.jadwalBimbingan.update({ where: { id: row.id }, data: { status, ...(command === "reschedule" ? { alasanReschedule: note, usulanWaktuReschedule: proposed } : {}), updatedAt: new Date() } });
  await event(context, `jadwal_${command}`, `jadwal:${row.id}`, row, { status, note, proposed },
    student ? [row.dosenId] : [row.mahasiswaId], "Status jadwal bimbingan diperbarui.", `/bimbingan/${b.id}`);
}
