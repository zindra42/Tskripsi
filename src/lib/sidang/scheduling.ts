import "server-only";
import { z } from "zod";
import { AccountError, ensure, jsonValue, settingsValues } from "@/lib/accounts/store";
import { idSchema } from "@/lib/accounts/validation";
import { dateOnly, reason } from "@/lib/academic/validation";
import { requireManager, managers, notify, type Context, type Input } from "@/lib/academic/store";
import { boardIds, validateBoard, validateSlot, slotSchema, overlap, type Board, type Slot } from "./policy";
import { currentBoard, sidangRecord, scheduleRecord, snapshotBoard, assertVersion, requireBoardActor, requireOwner, sidangEvent, type Schedule } from "./store";
import { assertEligibility } from "./registration";
import { issueDocument, revokeInvitations } from "./documents";

export async function activeLecturers(context: Context, ids: bigint[]) {
  const rows = await context.tx.pengguna.findMany({ where: { id: { in: ids }, statusAkun: "aktif", deletedAt: null,
    role: { in: ["dosen", "kaprodi", "sekpro"] }, dosen: { isNot: null } } });
  ensure(rows.length === new Set(ids).size, "Dewan harus dosen aktif dengan profil dosen.");
}
export async function checkConflicts(context: Pick<Context, "tx">, slot: Slot, ids: bigint[], except?: { sidang?: bigint; sempro?: bigint }) {
  const tanggal = dateOnly.parse(slot.tanggal);
  const sempros = await context.tx.jadwalSempro.findMany({ where: { tanggal,
    status: { notIn: ["draft", "dibatalkan", "ditunda", "tidak_terlaksana"] }, statusPelaksanaan: { notIn: ["dibatalkan", "tidak_terlaksana"] },
    ...(except?.sempro ? { id: { not: except.sempro } } : {}) }, include: { sempro: { include: { penguji: true } } } });
  for (const j of sempros) {
    if (!overlap(j, slot.mulai, slot.selesai)) continue;
    const others = [j.sempro?.idDosenPembimbingSempro, ...j.sempro?.penguji.filter((p) => !p.isPengganti).map((p) => p.idDosenPenguji) ?? []];
    ensure(j.ruang !== slot.ruang && !others.some((id) => id && ids.includes(id)), "Bentrok ruang atau dosen dengan seminar proposal.");
  }
  const sidangs = await context.tx.jadwalSidang.findMany({ where: { tanggal,
    status: { notIn: ["draft", "dibatalkan", "ditunda", "tidak_terlaksana"] }, statusPelaksanaan: { notIn: ["dibatalkan", "tidak_terlaksana"] },
    ...(except?.sidang ? { id: { not: except.sidang } } : {}) }, include: { konfirmasiList: true,
    sidang: { include: { penguji: true, pengajuan: { include: { bimbingan: true } } } } } });
  for (const j of sidangs) {
    if (!overlap(j, slot.mulai, slot.selesai)) continue;
    const b = j.sidang.pengajuan.bimbingan;
    const others = j.konfirmasiList.filter((c) => c.versi === j.versi && c.status !== "diganti").map((c) => c.dosenId);
    if (!others.length) others.push(...[b?.idDosenPembimbing, b?.idDosenPembimbing2, j.sidang.idDosenPembimbingSidang,
      ...j.sidang.penguji.filter((p) => !p.isPengganti).map((p) => p.idDosenPenguji)].filter((id): id is bigint => Boolean(id)));
    ensure(j.ruang !== slot.ruang && !others.some((id) => ids.includes(id)), "Bentrok ruang atau dosen dengan sidang.");
  }
}

export async function assignExaminers(context: Context, input: Input) {
  requireManager(context);
  const row = await sidangRecord(context, idSchema.parse(input.id));
  const ids = [idSchema.parse(input.penguji1Id), idSchema.parse(input.penguji2Id)];
  const b = row.pengajuan.bimbingan;
  ensure(ids[0] !== ids[1] && !ids.some((id) => [b?.idDosenPembimbing, b?.idDosenPembimbing2, row.idDosenPembimbingSidang].includes(id)),
    "Dua penguji harus berbeda dan tidak boleh menjadi pembimbing.");
  await activeLecturers(context, ids);
  ensure(!row.jadwalList.some((j) => j.penilaianList.some((p) => p.status !== "draft") || j.beritaAcaraList.some((ba) => ba.hasil)),
    "Nilai/hasil telah tersimpan. Perubahan dewan harus melalui koreksi proses.");
  if (row.jadwalList[0] && row.jadwalList[0].status !== "draft") {
    const note = reason.parse(input.reason);
    await invalidateSchedule(context, row.jadwalList[0], note, "draft");
  }
  await context.tx.penugasanPenguji.updateMany({ where: { idSidangDaftar: row.id, isPengganti: false }, data: { isPengganti: true, updatedAt: new Date() } });
  for (let i = 0; i < 2; i++) await context.tx.penugasanPenguji.create({ data: { idSidangDaftar: row.id,
    idDosenPenguji: ids[i], jenis: "sidang", nomorPenguji: i + 1, createdAt: new Date() } });
  await sidangEvent(context, "dewan_sidang_ditetapkan", row, row.penguji, { penguji1: ids[0], penguji2: ids[1] }, ids);
}

async function archive(context: Context, j: Schedule, note: string) {
  await context.tx.riwayatJadwalSidang.create({ data: { jadwalSidangId: j.id, versi: j.versi, tanggal: j.tanggal,
    jamMulai: j.waktuMulai, jamSelesai: j.waktuSelesai, ruang: j.ruang, alasanPerubahan: note,
    diubahOleh: context.actor.id, createdAt: new Date() } });
  await context.tx.permohonanSidang.updateMany({ where: { jadwalSidangId: j.id, status: "menunggu" },
    data: { status: "kedaluwarsa", aktifKey: null, updatedAt: new Date() } });
}
export async function invalidateSchedule(context: Context, j: Schedule, note: string, status: string) {
  ensure(!j.beritaAcaraList.some((ba) => ba.hasil), "Hasil resmi sudah diterbitkan.");
  await archive(context, j, note);
  await revokeInvitations(context, j.id, note);
  await context.tx.jadwalSidang.update({ where: { id: j.id }, data: { status, versi: { increment: 1 },
    statusKonfirmasiDosen: "menunggu", statusPelaksanaan: ["tidak_terlaksana", "dibatalkan"].includes(status) ? status : "terjadwal", updatedAt: new Date() } });
}

export async function schedule(context: Context, input: Input, boardOverride?: Board, draft = false) {
  requireManager(context);
  const row = await sidangRecord(context, idSchema.parse(input.id));
  ensure(row.statusBerkas === "lengkap", "Berkas harus diverifikasi lengkap.");
  await assertEligibility(context, row);
  const board = validateBoard(boardOverride ?? currentBoard(row));
  await activeLecturers(context, boardIds(board).map(BigInt));
  const slot = validateSlot({ tanggal: input.tanggal, mulai: input.mulai, selesai: input.selesai, ruang: input.ruang });
  let j = row.jadwalList[0];
  const note = j ? reason.parse(input.reason) : "Jadwal sidang pertama diterbitkan";
  if (j) {
    assertVersion(j, z.coerce.number().int().positive().parse(input.versi));
    ensure(!j.penilaianList.some((p) => p.status !== "draft") && !j.beritaAcaraList.some((ba) => ba.hasil), "Jadwal sudah dinilai atau selesai.");
  }
  await checkConflicts(context, slot, boardIds(board).map(BigInt), { sidang: j?.id });
  const values = { tanggal: dateOnly.parse(slot.tanggal), waktuMulai: slot.mulai, waktuSelesai: slot.selesai, ruang: slot.ruang,
    status: draft ? "draft" : "menunggu_konfirmasi", statusKonfirmasiDosen: "menunggu", statusPelaksanaan: "terjadwal", dewanSnapshot: jsonValue(board),
    periodeSnapshot: row.periodeSnapshot, diterbitkanAt: new Date(), pengujiDikonfirmasiUlang: false, updatedAt: new Date() };
  if (j) {
    await archive(context, j, note);
    await revokeInvitations(context, j.id, note);
    await context.tx.jadwalSidang.update({ where: { id: j.id }, data: { ...values, versi: { increment: 1 } } });
  } else {
    const created = await context.tx.jadwalSidang.create({ data: { ...values, idSidang: row.id, createdAt: new Date() } });
    j = (await sidangRecord(context, row.id)).jadwalList.find((s) => s.id === created.id)!;
  }
  const fresh = await context.tx.jadwalSidang.findUniqueOrThrow({ where: { id: j.id } });
  if (!draft) await context.tx.konfirmasiJadwalSidang.createMany({ data: Object.entries(board).map(([peran, id]) => ({
    jadwalSidangId: fresh.id, versi: fresh.versi, dosenId: BigInt(id), peran, createdAt: new Date(),
  })) });
  await sidangEvent(context, draft ? "draf_jadwal_sidang_disimpan" : "jadwal_sidang_diterbitkan", row,
    row.jadwalList[0] ?? null, fresh, draft ? [] : boardIds(board).map(BigInt));
}

export async function recommendSlots(context: Pick<Context, "tx" | "actor" | "role">, input: Input) {
  requireManager(context);
  const row = await sidangRecord(context, idSchema.parse(input.id), false);
  const ids = boardIds(currentBoard(row)).map(BigInt);
  const slots = [];
  for (const [mulai, selesai] of [["08:30", "10:00"], ["10:00", "11:30"], ["11:30", "13:00"], ["13:30", "15:00"], ["15:00", "16:30"]]) {
    const slot = validateSlot({ tanggal: input.tanggal, ruang: input.ruang, mulai, selesai });
    try {
      await checkConflicts(context, slot, ids, { sidang: row.jadwalList[0]?.id });
      slots.push(slot);
    } catch (error) {
      if (!(error instanceof AccountError) || !error.message.startsWith("Bentrok")) throw error;
    }
  }
  return slots;
}

export async function emergencyAssignment(context: Context, input: Input) {
  requireManager(context);
  const { row, jadwal } = await scheduleRecord(context, idSchema.parse(input.jadwalId));
  assertVersion(jadwal, z.coerce.number().int().positive().parse(input.versi));
  ensure(["final", "menunggu_konfirmasi"].includes(jadwal.status) && !jadwal.beritaAcaraList.some((b) => b.hasil || b.keputusanPenguji1),
    "Penggantian darurat ditutup setelah keputusan atau pembatalan jadwal.");
  const board = snapshotBoard(jadwal), old = idSchema.parse(input.dosenLamaId), next = idSchema.parse(input.dosenId);
  const slot = Object.keys(board).find((s) => board[s] === String(old));
  ensure(slot && slot.startsWith("penguji_"), "Penugasan darurat hanya dapat mengganti penguji.");
  ensure(!jadwal.penilaianList.some((p) => p.penilaiId === old && ["disimpan", "terkunci"].includes(p.status)),
    "Nilai penguji tersimpan harus dibuka ulang melalui koreksi sebelum penggantian.");
  const note = reason.parse(input.reason);
  board[slot] = String(next);
  validateBoard(board);
  await activeLecturers(context, [next]);
  await checkConflicts(context, { tanggal: jadwal.tanggal!.toISOString().slice(0, 10), mulai: jadwal.waktuMulai!,
    selesai: jadwal.waktuSelesai!, ruang: jadwal.ruang }, boardIds(board).map(BigInt), { sidang: jadwal.id });
  await archive(context, jadwal, note);
  await revokeInvitations(context, jadwal.id, note);
  await context.tx.penugasanPenguji.updateMany({ where: { idSidangDaftar: row.id, idDosenPenguji: old, isPengganti: false },
    data: { isPengganti: true, updatedAt: new Date() } });
  await context.tx.penugasanPenguji.create({ data: { idSidangDaftar: row.id, idDosenPenguji: next, jenis: "sidang",
    nomorPenguji: Number(slot.slice(-1)), statusApproval: "bersedia", catatan: note, createdAt: new Date() } });
  await context.tx.konfirmasiJadwalSidang.updateMany({ where: { jadwalSidangId: jadwal.id, versi: jadwal.versi, dosenId: old },
    data: { status: "diganti", catatan: note, updatedAt: new Date() } });
  await context.tx.konfirmasiJadwalSidang.create({ data: { jadwalSidangId: jadwal.id, versi: jadwal.versi, dosenId: next,
    peran: slot, status: "bersedia", ditetapkanKaprodi: true, catatan: note, respondedAt: new Date(), createdAt: new Date() } });
  const complete = Object.entries(board).every(([role, id]) => role === slot || jadwal.konfirmasiList.some((c) =>
    c.versi === jadwal.versi && String(c.dosenId) === id && c.status === "bersedia"));
  await context.tx.jadwalSidang.update({ where: { id: jadwal.id }, data: { dewanSnapshot: jsonValue(board),
    status: complete ? "final" : "menunggu_konfirmasi", statusKonfirmasiDosen: complete ? "terkonfirmasi" : "menunggu", updatedAt: new Date() } });
  if (complete) await issueDocument(context, row, jadwal.id, "undangan_sidang");
  await sidangEvent(context, "penugasan_darurat_sidang", row, { board: snapshotBoard(jadwal), reason: note }, { board, reason: note }, [old, next]);
}

export async function confirm(context: Context, input: Input) {
  const { row, jadwal } = await scheduleRecord(context, idSchema.parse(input.jadwalId));
  requireBoardActor(context, jadwal);
  assertVersion(jadwal, z.coerce.number().int().positive().parse(input.versi));
  ensure(["menunggu_konfirmasi", "final"].includes(jadwal.status) && !jadwal.beritaAcaraList.some((b) => b.hasil), "Konfirmasi sudah ditutup.");
  ensure(!jadwal.penilaianList.some((p) => ["disimpan", "terkunci"].includes(p.status)), "Konfirmasi ditutup setelah penilaian tersimpan.");
  const records = jadwal.konfirmasiList.filter((c) => c.versi === jadwal.versi && c.dosenId === context.actor.id && c.status !== "diganti");
  ensure(records.length === 1, "Konfirmasi tidak ditemukan atau ganda; rekonsiliasi diperlukan.");
  const status = z.enum(["bersedia", "tidak_bersedia"]).parse(input.status);
  const catatan = status === "tidak_bersedia" ? reason.parse(input.reason) : null;
  await context.tx.konfirmasiJadwalSidang.update({ where: { id: records[0].id }, data: { status, catatan, respondedAt: new Date(), updatedAt: new Date() } });
  const confirmations = jadwal.konfirmasiList.filter((c) => c.versi === jadwal.versi && c.status !== "diganti")
    .map((c) => c.id === records[0].id ? { ...c, status } : c);
  const board = snapshotBoard(jadwal);
  const complete = boardIds(board).every((id) => confirmations.filter((c) => String(c.dosenId) === id && c.status === "bersedia").length === 1);
  await context.tx.jadwalSidang.update({ where: { id: jadwal.id }, data: { status: complete ? "final" : "menunggu_konfirmasi",
    statusKonfirmasiDosen: complete ? "terkonfirmasi" : confirmations.some((c) => c.status === "tidak_bersedia") ? "ada_penolakan" : "menunggu", updatedAt: new Date() } });
  if (complete) {
    await checkConflicts(context, { tanggal: jadwal.tanggal!.toISOString().slice(0, 10), mulai: jadwal.waktuMulai!, selesai: jadwal.waktuSelesai!, ruang: jadwal.ruang }, boardIds(board).map(BigInt), { sidang: jadwal.id });
    await issueDocument(context, row, jadwal.id, "undangan_sidang");
  } else if (status === "tidak_bersedia") await revokeInvitations(context, jadwal.id, catatan!);
  await sidangEvent(context, "konfirmasi_sidang", row, records[0], { status, catatan }, await managers(context.tx));
}

export async function cancelSchedule(context: Context, input: Input) {
  requireManager(context);
  const { row, jadwal } = await scheduleRecord(context, idSchema.parse(input.jadwalId));
  assertVersion(jadwal, z.coerce.number().int().positive().parse(input.versi));
  const note = reason.parse(input.reason);
  const status = z.enum(["ditunda", "tidak_terlaksana", "dibatalkan"]).parse(input.status);
  ensure(!jadwal.penilaianList.some((p) => p.status !== "draft"), "Nilai telah tersimpan; perlu koreksi proses.");
  await invalidateSchedule(context, jadwal, note, status);
  await sidangEvent(context, `jadwal_sidang_${status}`, row, jadwal, { status, note }, boardIds(snapshotBoard(jadwal)).map(BigInt));
}

export async function requestChange(context: Context, input: Input) {
  const { row, jadwal } = await scheduleRecord(context, idSchema.parse(input.jadwalId));
  assertVersion(jadwal, z.coerce.number().int().positive().parse(input.versi));
  const isStudent = context.actor.role === "mahasiswa";
  if (isStudent) requireOwner(context, row); else requireBoardActor(context, jadwal);
  ensure(["menunggu_konfirmasi", "final"].includes(jadwal.status) && !jadwal.penilaianList.some((p) => p.status !== "draft"), "Permohonan sudah ditutup.");
  const jenis = z.enum(["ubah_jadwal", "pengganti"]).parse(input.jenis);
  ensure(!isStudent || jenis === "ubah_jadwal", "Mahasiswa hanya dapat mengusulkan perubahan jadwal.");
  const note = reason.parse(input.reason);
  const settings = await settingsValues(context.tx);
  if (isStudent) ensure(jadwal.tanggal && jadwal.tanggal.getTime() - Date.now() >= Number(settings.sidang_min_hari_sebelum ?? 2) * 86400000,
    "Permohonan mahasiswa harus sebelum batas minimal hari pengajuan.");
  const replacement = jenis === "pengganti" ? idSchema.parse(input.dosenId) : null;
  const slots = jenis === "ubah_jadwal" ? z.array(slotSchema).min(1).max(3).parse(input.slots) : [];
  for (const slot of slots) validateSlot(slot);
  if (replacement) await activeLecturers(context, [replacement]);
  ensure(!await context.tx.permohonanSidang.findFirst({ where: { jadwalSidangId: jadwal.id, versiJadwal: jadwal.versi,
    pemohonUserId: context.actor.id, status: "menunggu" } }), "Masih ada permohonan menunggu keputusan.");
  const data = { jadwalSidangId: jadwal.id, versiJadwal: jadwal.versi, jenis, pemohonTipe: isStudent ? "mahasiswa" : "dosen",
    pemohonUserId: context.actor.id, alasan: note, dosenPenggantiId: replacement, slotUsulan: jsonValue(slots),
    aktifKey: `${jadwal.id}:${context.actor.id}:v${jadwal.versi}`, createdAt: new Date() };
  await context.tx.permohonanSidang.create({ data });
  await sidangEvent(context, "permohonan_sidang_diajukan", row, null, data, await managers(context.tx));
}

export async function decideRequest(context: Context, input: Input) {
  const request = await context.tx.permohonanSidang.findUnique({ where: { id: idSchema.parse(input.requestId) } });
  ensure(request && request.status === "menunggu", "Permohonan sudah diputuskan.");
  const { row, jadwal } = await scheduleRecord(context, request.jadwalSidangId);
  assertVersion(jadwal, request.versiJadwal);
  const status = z.enum(["disetujui", "ditolak", "ditarik"]).parse(input.status);
  if (status === "ditarik") ensure(request.pemohonUserId === context.actor.id, "Hanya pemohon dapat menarik permohonan.");
  else {
    requireManager(context);
    ensure(request.pemohonUserId !== context.actor.id, "Permohonan sendiri harus diputuskan pengelola lain.");
  }
  const note = reason.parse(input.reason);
  await context.tx.permohonanSidang.update({ where: { id: request.id }, data: { status, aktifKey: null, keputusanOleh: context.actor.id,
    alasanKeputusan: note, diputuskanAt: new Date(), updatedAt: new Date() } });
  if (status === "disetujui") {
    if (request.jenis === "ubah_jadwal") {
      const slots = z.array(slotSchema).parse(request.slotUsulan);
      const index = z.coerce.number().int().min(0).max(slots.length - 1).parse(input.slotIndex);
      await schedule(context, { id: String(row.id), versi: jadwal.versi, ...slots[index], reason: note });
    } else {
      const board = snapshotBoard(jadwal);
      const slot = Object.keys(board).find((key) => board[key] === String(request.pemohonUserId));
      ensure(slot && slot.startsWith("penguji_") && request.dosenPenggantiId, "Penggantian pembimbing memerlukan koreksi pembimbing.");
      board[slot] = String(request.dosenPenggantiId);
      validateBoard(board);
      await assignExaminers(context, { id: String(row.id), penguji1Id: board.penguji_1, penguji2Id: board.penguji_2, reason: note });
      const latest = (await sidangRecord(context, row.id)).jadwalList[0];
      await schedule(context, { id: String(row.id), versi: latest.versi, tanggal: jadwal.tanggal!.toISOString().slice(0, 10),
        mulai: jadwal.waktuMulai, selesai: jadwal.waktuSelesai, ruang: jadwal.ruang, reason: note });
    }
  }
  await sidangEvent(context, "permohonan_sidang_diputuskan", row, request, { status, note }, [request.pemohonUserId]);
}

export async function remind(context: Context, input: Input) {
  requireManager(context);
  const { row, jadwal } = await scheduleRecord(context, idSchema.parse(input.jadwalId));
  const ids = jadwal.konfirmasiList.filter((c) => c.versi === jadwal.versi && c.status === "menunggu").map((c) => c.dosenId);
  await notify(context.tx, ids, "pengingat_sidang", "Konfirmasi jadwal sidang menunggu tanggapan Anda.", `/sidang/${row.id}`);
  await sidangEvent(context, "pengingat_sidang_dikirim", row, null, { recipients: ids });
}
