import "server-only";
import { z } from "zod";
import { ensure, settingsValues } from "@/lib/accounts/store";
import { idSchema } from "@/lib/accounts/validation";
import { periodCode, administrationValid } from "@/lib/academic/policy";
import { requireManager, requireStudent, type Context, type Input, type Uploads, event, managers } from "@/lib/academic/store";
import { storePrivateUpload } from "@/lib/academic/files";
import { reason } from "@/lib/academic/validation";
import { SIDANG_ITEMS, revisionComplete, hundredths, decimal } from "./policy";
import { sidangRecord, requireOwner, sidangEvent, sidangInclude } from "./store";

export async function initialize(context: Context) {
  requireStudent(context);
  const { tx, actor } = context;
  const title = await tx.pengajuanJudul.findFirst({ where: { idMahasiswa: actor.id, status: "disetujui",
    deletedAt: null, isDiarsipkan: false, statusDraft: "diajukan" }, include: { bimbingan: true,
    sempro: { include: { jadwal: { include: { beritaAcara: true } }, penguji: true } } }, orderBy: { id: "desc" } });
  ensure(title?.bimbingan, "Judul disetujui dan bimbingan diperlukan.");
  const ba = title.sempro?.jadwal?.beritaAcara;
  ensure(ba && revisionComplete(ba), "Sempro resmi harus lulus dan seluruh revisi sempro selesai.");
  const matches = await tx.pendaftaranSidang.findMany({ where: { idPengajuan: title.id, siklusKe: title.siklusKe } });
  ensure(matches.length <= 1, "Pendaftaran historis ganda perlu direkonsiliasi.");
  if (matches[0]) return { id: String(matches[0].id) };
  const settings = await settingsValues(tx);
  const row = await tx.pendaftaranSidang.create({ data: { idPengajuan: title.id, siklusKe: title.siklusKe,
    periodeSnapshot: periodCode(settings), tanggalDaftar: new Date(), createdAt: new Date() } });
  await tx.checklistDokumen.createMany({ data: SIDANG_ITEMS.map((namaDokumen, i) => ({
    idSidangDaftar: row.id, nomorItem: i + 1, namaDokumen, jenisBentuk: i === 2 ? "otomatis" : i === 10 ? "centang" : "asli",
    statusUnggahan: i === 2 ? "otomatis_sistem" : i === 10 ? "centang_mandiri" : null, createdAt: new Date(),
  })) });
  // Copy active sempro examiners; do not delete historical assignments when the board changes later.
  for (const p of title.sempro?.penguji.filter((p) => !p.isPengganti && [1, 2].includes(p.nomorPenguji ?? 0)) ?? []) {
    if ([title.bimbingan.idDosenPembimbing, title.bimbingan.idDosenPembimbing2].includes(p.idDosenPenguji)) continue;
    await tx.penugasanPenguji.create({ data: { idSidangDaftar: row.id, idDosenPenguji: p.idDosenPenguji,
      nomorPenguji: p.nomorPenguji, jenis: "sidang", createdAt: new Date() } });
  }
  await event(context, "pendaftaran_sidang_dibuat", `sidang:${row.id}`, null, row, [actor.id], "Draf pendaftaran sidang tersedia.", `/sidang/${row.id}`);
  return { id: String(row.id) };
}

export async function assertEligibility(context: Context, row: Awaited<ReturnType<typeof sidangRecord>>) {
  const ba = row.pengajuan.sempro?.jadwal?.beritaAcara;
  ensure(ba && revisionComplete(ba), "Hasil resmi dan revisi sempro belum memenuhi syarat.");
  const b = row.pengajuan.bimbingan;
  ensure(b?.idDosenPembimbing, "Pembimbing utama belum ditetapkan.");
  const ids = [b.idDosenPembimbing, b.idDosenPembimbing2].filter((id): id is bigint => Boolean(id));
  const accs = await context.tx.dokumenVerifikasi.findMany({ where: { idBimbingan: b.id, jenisDokumen: "acc_sidang", status: "sah",
    penandatanganUserId: { in: ids } } });
  ensure(ids.every((id) => accs.some((doc) => doc.penandatanganUserId === id)), "ACC Sidang seluruh pembimbing belum lengkap.");
  const failed = await context.tx.pendaftaranSidang.findFirst({ where: { idPengajuan: row.idPengajuan, siklusKe: row.siklusKe,
    OR: [{ statusBerkas: "tidak_lulus" }, { jadwalList: { some: { beritaAcaraList: { some: { hasil: "tidak_lulus" } } } } }] } });
  ensure(!failed, "Tidak lulus: sidang ulang harus pada periode berikutnya melalui pembayaran awal baru dan siklus baru.");
  const settings = await settingsValues(context.tx);
  const payment = await context.tx.verifikasiPembayaran.findFirst({ where: { idMahasiswa: row.pengajuan.idMahasiswa }, orderBy: { id: "desc" } });
  ensure(administrationValid(payment, settings) && payment?.siklusKe === row.siklusKe, "Administrasi awal siklus aktif belum sah.");
}

export async function updateChecklist(context: Context, input: Input, uploads: Uploads) {
  const row = await sidangRecord(context, idSchema.parse(input.id));
  requireOwner(context, row);
  ensure(["draft", "dikembalikan"].includes(row.statusBerkas), "Berkas sudah diajukan; menunggu verifikasi atau pengembalian.");
  const number = z.coerce.number().int().min(1).max(11).parse(input.nomorItem);
  ensure(number !== 3, "ACC otomatis hanya dapat diterbitkan pembimbing.");
  const item = row.checklist.filter((c) => c.nomorItem === number);
  ensure(item.length === 1, "Checklist hilang atau ganda; perlu rekonsiliasi.");
  let filePindaian: string | undefined;
  const ipk = number === 2 ? decimal(hundredths(input.ipk, 4)) : undefined;
  if (ipk) ensure(Number(ipk) >= 2, "IPK minimal 2.00.");
  if (number !== 11) {
    const file = uploads.file;
    ensure(file, "Pilih berkas.");
    ensure(file.bytes.length <= (number === 1 ? 20 : 2) * 1024 * 1024, "Ukuran berkas melebihi batas.");
    ensure(![1, 2].includes(number) || file.extension === "pdf", "Naskah dan transkrip wajib PDF.");
    filePindaian = await storePrivateUpload(file, "checklist_sidang");
  } else ensure(input.centang === "true", "Konfirmasi penggandaan skripsi diperlukan.");
  const data = { ...(filePindaian ? { filePindaian } : {}), statusItem: "terisi", catatanVerifikator: null, updatedAt: new Date() };
  await context.tx.checklistDokumen.update({ where: { id: item[0].id }, data });
  if (number <= 2) await context.tx.pendaftaranSidang.update({ where: { id: row.id }, data: number === 1
    ? { fileNaskah: filePindaian, updatedAt: new Date() } : { fileTranskrip: filePindaian, ipk, updatedAt: new Date() } });
  await sidangEvent(context, "checklist_sidang_diisi", row, item[0], data);
}

export async function submit(context: Context, input: Input) {
  const row = await sidangRecord(context, idSchema.parse(input.id));
  requireOwner(context, row);
  ensure(["draft", "dikembalikan"].includes(row.statusBerkas), "Pendaftaran sudah diajukan.");
  await assertEligibility(context, row);
  for (let n = 1; n <= 11; n++) {
    const items = row.checklist.filter((c) => c.nomorItem === n);
    ensure(items.length === 1 && (n === 3 || ["terisi", "diverifikasi"].includes(items[0].statusItem)), `Butir ${n} belum lengkap atau ganda.`);
  }
  ensure(row.ipk && Number(row.ipk) >= 2 && Number(row.ipk) <= 4, "IPK belum memenuhi syarat.");
  await context.tx.checklistDokumen.updateMany({ where: { idSidangDaftar: row.id, nomorItem: 3 }, data: { statusItem: "diverifikasi", updatedAt: new Date() } });
  const data = { statusDraft: "diajukan", statusBerkas: "menunggu_verifikasi", tanggalSubmit: new Date(), updatedAt: new Date() };
  await context.tx.pendaftaranSidang.update({ where: { id: row.id }, data });
  await sidangEvent(context, "sidang_diajukan", row, row, data, await managers(context.tx));
}

export async function verifyChecklist(context: Context, input: Input) {
  requireManager(context);
  const row = await sidangRecord(context, idSchema.parse(input.id));
  ensure(row.statusDraft === "diajukan" && row.statusBerkas !== "tidak_lulus", "Pendaftaran belum diajukan atau tidak lulus.");
  ensure(!row.jadwalList.some((j) => j.beritaAcaraList.some((b) => b.hasil)), "Hasil sudah resmi; gunakan koreksi yang diaudit.");
  const itemId = idSchema.parse(input.itemId);
  const item = row.checklist.find((c) => c.id === itemId);
  ensure(item && item.nomorItem !== 3 && item.nomorItem !== 11, "Butir otomatis dan penggandaan bukan verifikasi manual.");
  const statusItem = z.enum(["diverifikasi", "ditolak"]).parse(input.status);
  ensure(item.filePindaian && ["terisi", "diverifikasi", "ditolak"].includes(item.statusItem), "Berkas belum tersedia.");
  const catatanVerifikator = statusItem === "ditolak" ? reason.parse(input.reason) : null;
  await context.tx.checklistDokumen.update({ where: { id: item.id }, data: { statusItem, catatanVerifikator,
    lastVerifierId: context.actor.id, lastVerifierRole: context.role, updatedAt: new Date() } });
  const fresh = await context.tx.pendaftaranSidang.findUniqueOrThrow({ where: { id: row.id }, include: sidangInclude });
  const complete = Array.from({ length: 11 }, (_, i) => i + 1).every((n) => {
    const list = fresh.checklist.filter((c) => c.nomorItem === n);
    return list.length === 1 && (n === 11 ? ["terisi", "diverifikasi"].includes(list[0].statusItem) : list[0].statusItem === "diverifikasi");
  });
  if (complete) await assertEligibility(context, fresh);
  const data = { statusBerkas: statusItem === "ditolak" ? "dikembalikan" : complete ? "lengkap" : "menunggu_verifikasi",
    ...(complete ? { diverifikasiAt: new Date(), diverifikasiOlehId: context.actor.id } : {}), updatedAt: new Date() };
  await context.tx.pendaftaranSidang.update({ where: { id: row.id }, data });
  await sidangEvent(context, "berkas_sidang_diverifikasi", row, item, { statusItem, catatanVerifikator, ...data });
}

export async function verifyBatch(context: Context, input: Input) {
  requireManager(context);
  const ids = z.array(idSchema).min(1).max(9).parse(input.itemIds);
  ensure(new Set(ids).size === ids.length, "Butir verifikasi tidak boleh ganda.");
  for (const id of ids) await verifyChecklist(context, { ...input, itemId: String(id), status: "diverifikasi" });
}

export async function returnRegistration(context: Context, input: Input) {
  requireManager(context);
  const row = await sidangRecord(context, idSchema.parse(input.id));
  ensure(row.statusDraft === "diajukan" && !row.jadwalList.some((j) => !["draft", "dibatalkan", "ditunda", "tidak_terlaksana"].includes(j.status)),
    "Berkas hanya dapat dikembalikan sebelum jadwal aktif.");
  ensure(!row.jadwalList.some((j) => j.beritaAcaraList.some((b) => b.hasil)), "Hasil sudah resmi.");
  const data = { statusBerkas: "dikembalikan", catatanVerifikasi: reason.parse(input.reason), updatedAt: new Date() };
  await context.tx.pendaftaranSidang.update({ where: { id: row.id }, data });
  await sidangEvent(context, "berkas_sidang_dikembalikan", row, row, data);
}
