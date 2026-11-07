import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ensure, audit } from "@/lib/accounts/store";
import { idSchema } from "@/lib/accounts/validation";
import { reason } from "@/lib/academic/validation";
import { type Context, notify } from "@/lib/academic/store";

export async function correctSempro(context: Context, input: Record<string, unknown>) {
  ensure(context.actor.role === "superadmin", "Koreksi proses memerlukan superadmin.");
  const note = reason.parse(input.reason);
  const action = z.enum(["sempro-reopen-score", "sempro-reissue-minutes", "sempro-cancel-schedule"]).parse(input.correction);
  const j = await context.tx.jadwalSempro.findUnique({ where: { id: idSchema.parse(input.jadwalId) },
    include: { beritaAcara: true, sempro: { include: { pengajuan: true, penguji: { where: { isPengganti: false } } } } } });
  ensure(j?.sempro, "Jadwal sempro tidak ditemukan.");
  const ba = j.beritaAcara, recipients = [j.sempro.pengajuan.idMahasiswa, j.sempro.idDosenPembimbingSempro,
    ...j.sempro.penguji.map((p) => p.idDosenPenguji)];
  if (action === "sempro-reissue-minutes") {
    ensure(ba?.hasil, "Berita acara resmi belum terbit.");
    const previous = await context.tx.dokumenVerifikasi.findFirst({ where: { idJadwal: j.id, jenisDokumen: "berita_acara" },
      orderBy: [{ versi: "desc" }, { id: "desc" }] });
    ensure(previous, "Dokumen historis perlu direkonsiliasi sebelum penerbitan ulang.");
    const { id: previousId, ...copy } = previous;
    const document = await context.tx.dokumenVerifikasi.create({ data: { ...copy, token: randomBytes(24).toString("hex"),
      penandatanganUserId: context.actor.id, namaPenandatangan: context.actor.nama, peran: "superadmin", status: "sah",
      versi: previous.versi + 1, digantikanOlehId: null, dicabutAt: null, dicabutOlehId: null, alasanPencabutan: null,
      diterbitkanAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
      snapshotJson: previous.snapshotJson ?? undefined } });
    await context.tx.dokumenVerifikasi.updateMany({ where: { idJadwal: j.id, jenisDokumen: "berita_acara", id: { not: document.id }, status: "sah" },
      data: { status: "tidak_berlaku", dicabutAt: new Date(), dicabutOlehId: context.actor.id, alasanPencabutan: note, digantikanOlehId: document.id } });
    await audit(context.tx, context.actor.id, "koreksi_terbit_ulang_berita_acara_sempro", `jadwal_sempro:${j.id}`, { before: previousId, after: document.id, reason: note });
  } else if (action === "sempro-reopen-score") {
    ensure(ba && !ba.hasil, "Hasil resmi telah terbit; nilai per dosen tidak dapat dibuka ulang.");
    const id = idSchema.parse(input.dosenId);
    const p = j.sempro.penguji.find((p) => p.idDosenPenguji === id);
    const isSupervisor = j.sempro.idDosenPembimbingSempro === id;
    ensure(p || isSupervisor, "Dosen bukan penilai yang ditetapkan.");
    const data = { ...(isSupervisor ? { nilaiPembimbingTotal: null, statusDinilaiPembimbing: false }
      : p!.nomorPenguji === 1 ? { nilaiPenguji1: null } : { nilaiPenguji2: null }), nilai: null, nilaiAkhirPenguji: null,
      keputusanPenguji1: null, diputuskanPenguji1At: null, statusPersetujuan: "menunggu_nilai_lengkap", updatedAt: new Date() };
    if (p) await context.tx.penugasanPenguji.update({ where: { id: p.id }, data: {
      statusDinilai: false, catatan: `Nilai dibuka ulang: ${note}`, updatedAt: new Date(),
    } });
    await context.tx.beritaAcara.update({ where: { id: ba.id }, data });
    await context.tx.dokumenVerifikasi.updateMany({ where: { idJadwal: j.id, jenisDokumen: "form_nilai", penandatanganUserId: id, status: "sah" },
      data: { status: "tidak_berlaku", dicabutAt: new Date(), dicabutOlehId: context.actor.id, alasanPencabutan: note } });
    await audit(context.tx, context.actor.id, "koreksi_buka_nilai_sempro", `jadwal_sempro:${j.id}`, {
      before: { beritaAcara: ba, penugasan: p ?? null }, after: data, reason: note,
    });
  } else {
    ensure(!ba?.hasil, "Jadwal tidak dapat dibatalkan setelah hasil resmi.");
    ensure(j.versi === z.coerce.number().int().positive().parse(input.versi), "Jadwal sudah berubah.");
    await context.tx.dokumenVerifikasi.updateMany({ where: { idJadwal: j.id, jenisDokumen: "undangan", status: "sah" },
      data: { status: "dibatalkan", dicabutAt: new Date(), dicabutOlehId: context.actor.id, alasanPencabutan: note } });
    await context.tx.jadwalSempro.update({ where: { id: j.id }, data: { status: "dibatalkan", statusPelaksanaan: "dibatalkan",
      versi: { increment: 1 }, catatan: note, updatedAt: new Date() } });
    await audit(context.tx, context.actor.id, "koreksi_batal_jadwal_sempro", `jadwal_sempro:${j.id}`, { before: j, after: { status: "dibatalkan" }, reason: note });
  }
  await notify(context.tx, recipients, action, `Koreksi proses seminar proposal: ${note}`, "/sempro/status");
}
