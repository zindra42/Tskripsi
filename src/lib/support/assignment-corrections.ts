import "server-only";
import { z } from "zod";
import { ensure } from "@/lib/accounts/store";
import { idSchema } from "@/lib/accounts/validation";
import { currentTitle } from "@/lib/academic/policy";
import { cancelSupervisor, event, guidanceRecord, supervisorLoad, type Context, type Input } from "@/lib/academic/store";
import { reason } from "@/lib/academic/validation";
import { sidangRecord, sidangEvent } from "@/lib/sidang/store";
import { activeLecturers, invalidateSchedule } from "@/lib/sidang/scheduling";

export async function correctAssignment(context: Context, input: Input) {
  ensure(context.actor.role === "superadmin", "Koreksi penugasan memerlukan superadmin.");
  const note = reason.parse(input.reason), slot = z.coerce.number().int().min(1).max(2).parse(input.slot);
  const next = input.dosenId ? idSchema.parse(input.dosenId) : null;
  if (next) await activeLecturers(context, [next]);
  if (input.correction === "correct-supervisor") {
    const b = await guidanceRecord(context, idSchema.parse(input.bimbinganId));
    ensure(next !== (slot === 1 ? b.idDosenPembimbing2 : b.idDosenPembimbing) || next === null, "Pembimbing tidak boleh merangkap kedua slot.");
    const old = slot === 1 ? b.idDosenPembimbing : b.idDosenPembimbing2;
    ensure(old !== next, "Penugasan tidak berubah.");
    const lecturer = next ? await context.tx.pengguna.findUniqueOrThrow({ where: { id: next }, include: { dosen: true } }) : null;
    const full = Boolean(lecturer?.dosen && await supervisorLoad(context.tx, next!, b.id) >= lecturer.dosen.kuotaBimbingan);
    if (old) await cancelSupervisor(context, b.id, slot as 1 | 2, note);
    if (next) await context.tx.bimbingan.update({ where: { id: b.id }, data: slot === 1
      ? { idDosenPembimbing: next, updatedAt: new Date() } : { idDosenPembimbing2: next, updatedAt: new Date() } });
    await event(context, "koreksi_pembimbing", `bimbingan:${b.id}`, b, { slot, dosenId: next, reason: note, quotaWarning: full },
      [b.pengajuan.idMahasiswa, old, next], `Koreksi pembimbing: ${note}`, `/bimbingan/${b.id}`);
    return { message: full ? "Koreksi tersimpan. Dosen telah mencapai kuota bimbingan." : "Koreksi penugasan tersimpan." };
  }
  if (input.correction === "sidang-examiner") {
    const row = await sidangRecord(context, idSchema.parse(input.id));
    ensure(!row.jadwalList.some((j) => j.penilaianList.some((p) => ["disimpan", "terkunci"].includes(p.status)) || j.beritaAcaraList.some((b) => b.hasil)),
      "Nilai/hasil telah tersimpan. Buka ulang penilaian sebelum koreksi penguji.");
    const b = row.pengajuan.bimbingan;
    ensure(!next || ![b?.idDosenPembimbing, b?.idDosenPembimbing2, row.idDosenPembimbingSidang].includes(next), "Pembimbing tidak boleh menjadi penguji.");
    ensure(!next || !row.penguji.some((p) => !p.isPengganti && p.nomorPenguji !== slot && p.idDosenPenguji === next), "Penguji harus berbeda.");
    if (row.jadwalList[0]) await invalidateSchedule(context, row.jadwalList[0], note, "draft");
    await context.tx.penugasanPenguji.updateMany({ where: { idSidangDaftar: row.id, nomorPenguji: slot, isPengganti: false }, data: { isPengganti: true, updatedAt: new Date() } });
    if (next) await context.tx.penugasanPenguji.create({ data: { idSidangDaftar: row.id, idDosenPenguji: next, nomorPenguji: slot, jenis: "sidang", catatan: note, createdAt: new Date() } });
    await sidangEvent(context, "koreksi_penguji_sidang", row, row.penguji, { slot, dosenId: next, reason: note }, next ? [next] : []);
    return;
  }
  ensure(input.correction === "sempro-examiner", "Jenis koreksi tidak dikenal.");
  const sempro = await context.tx.pendaftaranSempro.findUnique({ where: { id: idSchema.parse(input.semproId) }, include: {
    penguji: true, pengajuan: { include: { bimbingan: true } }, jadwal: { include: { beritaAcara: true } } } });
  ensure(sempro && currentTitle(sempro.pengajuan), "Sempro aktif tidak ditemukan.");
  const j = sempro.jadwal, ba = j?.beritaAcara, b = sempro.pengajuan.bimbingan;
  ensure(!ba?.hasil && !ba?.statusDinilaiPembimbing && ba?.nilaiPenguji1 == null && ba?.nilaiPenguji2 == null
    && !sempro.penguji.some((p) => !p.isPengganti && p.statusDinilai), "Penilaian sempro sudah dimulai atau hasil resmi terbit.");
  ensure(!next || ![b?.idDosenPembimbing, b?.idDosenPembimbing2, sempro.idDosenPembimbingSempro].includes(next), "Pembimbing tidak boleh menjadi penguji.");
  ensure(!next || !sempro.penguji.some((p) => !p.isPengganti && p.nomorPenguji !== slot && p.idDosenPenguji === next), "Penguji harus berbeda.");
  await context.tx.penugasanPenguji.updateMany({ where: { idSempro: sempro.id, nomorPenguji: slot, isPengganti: false }, data: { isPengganti: true, updatedAt: new Date() } });
  if (next) await context.tx.penugasanPenguji.create({ data: { idSempro: sempro.id, idDosenPenguji: next,
    nomorPenguji: slot, jenis: "sempro", peran: slot === 1 ? "ketua" : "anggota", catatan: note, createdAt: new Date() } });
  if (j) {
    await context.tx.dokumenVerifikasi.updateMany({ where: { idJadwal: j.id, jenisDokumen: "undangan", status: "sah" },
      data: { status: "dicabut", dicabutAt: new Date(), dicabutOlehId: context.actor.id, alasanPencabutan: note, updatedAt: new Date() } });
    await context.tx.riwayatJadwalSempro.create({ data: { jadwalSemproId: j.id, versi: j.versi, tanggal: j.tanggal,
      jamMulai: j.waktuMulai, jamSelesai: j.waktuSelesai, ruang: j.ruang, alasanPerubahan: note, diubahOlehId: context.actor.id, createdAt: new Date() } });
    await context.tx.jadwalSempro.update({ where: { id: j.id }, data: { versi: { increment: 1 }, status: "draft", statusKonfirmasiDosen: "menunggu", updatedAt: new Date() } });
  }
  await event(context, "koreksi_penguji_sempro", `sempro:${sempro.id}`, sempro.penguji, { slot, dosenId: next, reason: note },
    [sempro.pengajuan.idMahasiswa, next], `Koreksi penguji seminar proposal: ${note}`, "/sempro/jadwal");
}
