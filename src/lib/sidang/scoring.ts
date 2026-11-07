import "server-only";
import { z } from "zod";
import { ensure, jsonValue, settingsValues } from "@/lib/accounts/store";
import { idSchema } from "@/lib/accounts/validation";
import { dateOnly, reason } from "@/lib/academic/validation";
import { requireManager, managers, type Context, type Input, type Uploads } from "@/lib/academic/store";
import { storePrivateUpload } from "@/lib/academic/files";
import { canManage } from "@/lib/accounts/policy";
import { decisionSchema, formScore, scoreRole, recap, grade, officialResult, witaToday, revisionApprovers } from "./policy";
import { scheduleRecord, snapshotBoard, assertVersion, requireBoardActor, requireOwner, sidangEvent, type Schedule } from "./store";
import { issueDocument } from "./documents";

export function lockedScores(jadwal: Schedule) {
  const board = snapshotBoard(jadwal);
  const rows = ["penguji_1", "penguji_2", "pembimbing"].map((role) => jadwal.penilaianList.find((p) => p.peran === role
    && String(p.penilaiId) === board[role === "pembimbing" ? "pembimbing_1" : role] && ["disimpan", "terkunci"].includes(p.status)));
  ensure(rows.every(Boolean), "Ketiga nilai penilai aktif harus lengkap dan tersimpan.");
  return rows.map((r) => r!);
}

export async function score(context: Context, input: Input) {
  const { row, jadwal } = await scheduleRecord(context, idSchema.parse(input.jadwalId));
  const board = requireBoardActor(context, jadwal);
  assertVersion(jadwal, z.coerce.number().int().positive().parse(input.versi));
  ensure(jadwal.status === "final" && !jadwal.beritaAcaraList.some((b) => b.hasil || b.keputusanPenguji1), "Jadwal belum final atau keputusan sudah dikirim.");
  const peran = scoreRole(board, context.actor.id);
  ensure(peran, "Penilaian hanya untuk pembimbing utama dan kedua penguji.");
  const existing = jadwal.penilaianList.find((p) => p.penilaiId === context.actor.id);
  ensure(!existing || existing.status === "draft", "Nilai terkunci; koreksi memerlukan kewenangan dan alasan.");
  ensure(jadwal.tanggal && jadwal.waktuMulai && jadwal.waktuSelesai, "Jadwal belum lengkap.");
  const date = jadwal.tanggal.toISOString().slice(0, 10);
  const start = new Date(`${date}T${jadwal.waktuMulai.slice(0, 5)}:00+08:00`);
  const deadline = new Date(`${date}T${jadwal.waktuSelesai.slice(0, 5)}:00+08:00`).getTime() + 3600000;
  ensure(Date.now() >= start.getTime(), "Penilaian dibuka saat pelaksanaan sidang.");
  ensure(Date.now() <= deadline || existing?.izinSusulan && (!existing.izinBerlakuSampai || existing.izinBerlakuSampai > new Date()),
    "Toleransi satu jam terlewati; minta izin susulan.");
  const result = formScore(peran, input);
  const perluRevisi = input.perluRevisi === "true";
  const catatanRevisi = perluRevisi ? reason.parse(input.catatanRevisi) : null;
  const data = { peran, nilaiKomponen: jsonValue(result.components), nilaiAkhir: result.total, perluRevisi, catatanRevisi,
    rubrikSnapshot: jsonValue({ version: "source-kalkulasi-sidang-v1", arithmetic: "php-8.4-half-away", weights: result.weights, divisor: 10 }),
    catatanUmum: z.string().max(5000).parse(input.catatan ?? ""), status: "terkunci", disimpanAt: new Date(), updatedAt: new Date() };
  if (existing) await context.tx.penilaianSidang.update({ where: { id: existing.id }, data });
  else await context.tx.penilaianSidang.create({ data: { ...data, idJadwalSidang: jadwal.id, penilaiId: context.actor.id, createdAt: new Date() } });
  await issueDocument(context, row, jadwal.id, "form_nilai_sidang", context.actor.id);
  const fresh = (await scheduleRecord(context, jadwal.id)).jadwal;
  const complete = ["penguji_1", "penguji_2", "pembimbing"].every((role) => fresh.penilaianList.some((p) => p.peran === role && p.status === "terkunci"));
  if (complete) {
    const ba = fresh.beritaAcaraList[0];
    const data = { statusPersetujuan: "menunggu_keputusan_penguji_1", updatedAt: new Date() };
    ensure(fresh.beritaAcaraList.length <= 1, "Berita acara historis ganda perlu direkonsiliasi.");
    if (ba) await context.tx.beritaAcara.update({ where: { id: ba.id }, data });
    else await context.tx.beritaAcara.create({ data: { ...data, jenis: "sidang", idJadwalSidang: jadwal.id, createdAt: new Date() } });
  }
  await sidangEvent(context, "nilai_sidang_terkunci", row, existing, data, complete ? await managers(context.tx) : []);
}

export async function latePermission(context: Context, input: Input) {
  requireManager(context);
  const { row, jadwal } = await scheduleRecord(context, idSchema.parse(input.jadwalId));
  const scorer = idSchema.parse(input.dosenId);
  const peran = scoreRole(snapshotBoard(jadwal), scorer);
  ensure(peran && !jadwal.beritaAcaraList.some((b) => b.hasil || b.keputusanPenguji1), "Penilai tidak valid atau keputusan sudah dikirim.");
  const note = reason.parse(input.reason);
  const existing = jadwal.penilaianList.find((p) => p.penilaiId === scorer);
  ensure(!existing || existing.status === "draft", "Izin susulan tidak membuka nilai terkunci.");
  const data = { izinSusulan: true, izinBerlakuSampai: new Date(Date.now() + 15 * 60000), diizinkanOlehId: context.actor.id, updatedAt: new Date() };
  if (existing) await context.tx.penilaianSidang.update({ where: { id: existing.id }, data });
  else await context.tx.penilaianSidang.create({ data: { ...data, idJadwalSidang: jadwal.id, penilaiId: scorer, peran, createdAt: new Date() } });
  await sidangEvent(context, "izin_susulan_sidang", row, existing, { ...data, note }, [scorer]);
}

export async function examinerDecision(context: Context, input: Input) {
  const { row, jadwal } = await scheduleRecord(context, idSchema.parse(input.jadwalId));
  assertVersion(jadwal, z.coerce.number().int().positive().parse(input.versi));
  const board = requireBoardActor(context, jadwal);
  ensure(board.penguji_1 === String(context.actor.id), "Keputusan tingkat pertama hanya oleh Penguji 1.");
  lockedScores(jadwal);
  const ba = jadwal.beritaAcaraList[0];
  ensure(ba && !ba.hasil && ba.statusPersetujuan === "menunggu_keputusan_penguji_1", "Keputusan sudah dikirim atau nilai belum lengkap.");
  const keputusanPenguji1 = decisionSchema.parse(input.hasil);
  const note = z.string().trim().max(5000).parse(input.catatan ?? "");
  if (keputusanPenguji1 === "lulus_revisi") ensure(note.length >= 5, "Catatan revisi diperlukan.");
  const deadline = keputusanPenguji1 === "lulus_revisi" ? dateOnly.parse(input.tenggat) : null;
  ensure(!deadline || deadline.toISOString().slice(0, 10) >= witaToday(), "Tenggat revisi tidak boleh lampau.");
  const data = { penguji1Id: context.actor.id, keputusanPenguji1, catatanPenguji1: note, tenggatRevisiPenguji1: deadline,
    diputuskanPenguji1At: new Date(), statusPersetujuan: "menunggu_persetujuan_kaprodi", updatedAt: new Date() };
  await context.tx.beritaAcara.update({ where: { id: ba.id }, data });
  await sidangEvent(context, "keputusan_penguji_1_sidang", row, ba, data, await managers(context.tx));
}

export async function approveResult(context: Context, input: Input) {
  requireManager(context);
  const { row, jadwal } = await scheduleRecord(context, idSchema.parse(input.jadwalId));
  assertVersion(jadwal, z.coerce.number().int().positive().parse(input.versi));
  const scores = lockedScores(jadwal);
  const ba = jadwal.beritaAcaraList[0];
  ensure(ba?.keputusanPenguji1 && ["menunggu_persetujuan_kaprodi", "disetujui_kaprodi"].includes(ba.statusPersetujuan), "Keputusan Penguji 1 belum tersedia.");
  const oldSnapshot = ba.snapshotKeputusan as { authority?: string } | null;
  if (ba.hasil) {
    ensure(context.role !== "sekpro" && canManage(context.actor, context.role, "settings"), "Keputusan resmi hanya dapat ditimpa Kaprodi atau superadmin.");
    reason.parse(input.reason);
    ensure(oldSnapshot?.authority === "sekpro", "Koreksi keputusan Kaprodi harus melalui koreksi proses yang diaudit.");
    ensure(!ba.revisiList.length, "Revisi sudah diajukan; keputusan tidak dapat ditimpa melalui alur normal.");
  }
  const settings = await settingsValues(context.tx);
  const method = settings.metode_bobot_sidang || "proporsional_34_33_33";
  const nilai = recap(scores[0].nilaiAkhir.toString(), scores[1].nilaiAkhir.toString(), scores[2].nilaiAkhir.toString(), method);
  const suggested = Number(nilai) < Number(settings.nilai_batas_lulus_sidang ?? 51) ? "tidak_lulus"
    : scores.some((s) => s.perluRevisi) ? "lulus_revisi" : "lulus";
  const hasil = decisionSchema.parse(input.hasil);
  const override = hasil !== suggested;
  const note = z.string().trim().max(5000).parse(input.catatan ?? "");
  const overrideReason = override ? reason.parse(input.reason) : null;
  const days = z.coerce.number().int().min(1).max(365).parse(settings.tenggat_revisi_sidang_hari ?? 14);
  const deadline = hasil === "lulus_revisi" ? (input.tenggat ? dateOnly.parse(input.tenggat)
    : ba.tenggatRevisiPenguji1 ?? new Date(`${witaToday(new Date(Date.now() + days * 86400000))}T00:00:00Z`)) : null;
  ensure(!deadline || deadline.toISOString().slice(0, 10) >= witaToday(), "Tenggat revisi tidak boleh lampau.");
  const data = { hasil, nilai, nilaiPenguji1: scores[0].nilaiAkhir, nilaiPenguji2: scores[1].nilaiAkhir,
    nilaiPembimbing: scores[2].nilaiAkhir, predikatHuruf: grade(nilai), saranHasil: suggested, isOverrideSaran: override,
    alasanOverride: overrideReason, catatanRevisi: note || ba.catatanPenguji1, tenggatRevisi: deadline,
    statusRevisi: hasil === "lulus" ? "revisi_selesai" : hasil === "lulus_revisi" ? "menunggu_revisi" : null,
    statusPersetujuan: "disetujui_kaprodi", disetujuiKaprodiAt: new Date(), ditetapkanOlehId: context.actor.id,
    ditetapkanAt: new Date(), isLocked: true, snapshotKeputusan: jsonValue({ authority: context.role, method, passMark: settings.nilai_batas_lulus_sidang ?? "51",
      board: snapshotBoard(jadwal), period: row.periodeSnapshot, scores, overrideReason, decidedBy: String(context.actor.id) }), updatedAt: new Date() };
  await context.tx.beritaAcara.update({ where: { id: ba.id }, data });
  await context.tx.jadwalSidang.update({ where: { id: jadwal.id }, data: { statusPelaksanaan: "selesai", updatedAt: new Date() } });
  if (hasil === "tidak_lulus") await context.tx.pendaftaranSidang.update({ where: { id: row.id }, data: { statusBerkas: "tidak_lulus", updatedAt: new Date() } });
  await issueDocument(context, row, jadwal.id, "berita_acara_sidang");
  await issueDocument(context, row, jadwal.id, "rekap_nilai_sidang");
  await sidangEvent(context, "hasil_sidang_ditetapkan", row, ba, data, Object.values(snapshotBoard(jadwal)).map(BigInt));
}

type Approval = { dosen_id: string; peran: string; status: string; catatan?: string | null; at?: string | null };
export async function uploadRevision(context: Context, input: Input, uploads: Uploads) {
  const { row, jadwal } = await scheduleRecord(context, idSchema.parse(input.jadwalId));
  requireOwner(context, row);
  const ba = jadwal.beritaAcaraList[0];
  ensure(ba && officialResult(ba) && ba.hasil === "lulus_revisi" && ba.statusRevisi !== "revisi_selesai", "Revisi tidak diperlukan atau sudah selesai.");
  ensure(!ba.revisiList.some((r) => r.status === "menunggu_persetujuan"), "Versi sebelumnya masih menunggu persetujuan.");
  const file = uploads.file;
  ensure(file && file.extension === "pdf" && file.bytes.length <= 20 * 1024 * 1024, "Revisi wajib PDF maksimal 20 MB.");
  const scores = lockedScores(jadwal);
  const persetujuan = revisionApprovers(scores);
  const data = { tipe: "sidang", beritaAcaraId: ba.id, mahasiswaId: context.actor.id, versi: (ba.revisiList[0]?.versi ?? 0) + 1,
    fileDraft: await storePrivateUpload(file, "revisi_sidang"), fileUkuranBytes: BigInt(file.bytes.length),
    catatanMahasiswa: z.string().max(1000).parse(input.catatan ?? ""), persetujuan: jsonValue(persetujuan), createdAt: new Date() };
  await context.tx.revisiDokumen.create({ data });
  await context.tx.beritaAcara.update({ where: { id: ba.id }, data: { statusRevisi: "dalam_revisi", updatedAt: new Date() } });
  await sidangEvent(context, "revisi_sidang_diajukan", row, null, data, Object.values(persetujuan).map((a) => BigInt(a.dosen_id)));
}

export async function reviewRevision(context: Context, input: Input) {
  const revision = await context.tx.revisiDokumen.findUnique({ where: { id: idSchema.parse(input.revisiId) }, include: { beritaAcara: true } });
  ensure(revision?.tipe === "sidang" && revision.beritaAcara.idJadwalSidang, "Revisi sidang tidak ditemukan.");
  const { row, jadwal } = await scheduleRecord(context, revision.beritaAcara.idJadwalSidang);
  requireBoardActor(context, jadwal);
  const ba = jadwal.beritaAcaraList.find((b) => b.id === revision.beritaAcaraId)!;
  ensure(revision.status === "menunggu_persetujuan" && ba.revisiList[0]?.id === revision.id, "Revisi sudah diputuskan atau bukan versi terbaru.");
  const approvals = revision.persetujuan as Record<string, Approval> | null;
  ensure(approvals && Object.values(approvals).length, "Persetujuan historis kosong perlu rekonsiliasi.");
  const own = Object.values(approvals).filter((a) => String(a.dosen_id) === String(context.actor.id));
  ensure(own.length && own.every((a) => a.status === "menunggu"), "Hanya penilai peminta revisi dapat memutuskan slot sendiri sekali.");
  const status = z.enum(["disetujui", "ditolak"]).parse(input.status);
  const note = status === "ditolak" ? reason.parse(input.reason) : z.string().max(1000).parse(input.catatan ?? "");
  for (const approval of own) { approval.status = status; approval.catatan = note; approval.at = new Date().toISOString(); }
  const complete = Object.values(approvals).every((a) => a.status === "disetujui");
  const data = { persetujuan: jsonValue(approvals), status: status === "ditolak" ? "ditolak" : complete ? "disetujui" : "menunggu_persetujuan",
    ...(status === "ditolak" ? { alasanPenolakan: note, ditolakOlehId: context.actor.id, ditolakAt: new Date() } : {}),
    ...(complete ? { disetujuiAt: new Date() } : {}), updatedAt: new Date() };
  await context.tx.revisiDokumen.update({ where: { id: revision.id }, data });
  if (complete) await context.tx.beritaAcara.update({ where: { id: ba.id }, data: { statusRevisi: "revisi_selesai", isLocked: true, updatedAt: new Date() } });
  await sidangEvent(context, "revisi_sidang_diputuskan", row, revision, data, complete ? await managers(context.tx) : []);
}
