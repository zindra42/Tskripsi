import "server-only";
import { z } from "zod";
import { ensure, audit } from "@/lib/accounts/store";
import { idSchema } from "@/lib/accounts/validation";
import { reason } from "@/lib/academic/validation";
import { requireManager, type Context, type Input } from "@/lib/academic/store";
import { scheduleRecord, sidangEvent, snapshotBoard } from "@/lib/sidang/store";
import { issueDocument } from "@/lib/sidang/documents";
import { scoreRole } from "@/lib/sidang/policy";
import { assignExaminers, cancelSchedule } from "@/lib/sidang/scheduling";
import { correctSempro } from "./sempro-corrections";
import { correctAssignment } from "./assignment-corrections";

export async function correctSidang(context: Context, input: Input) {
  requireManager(context);
  ensure(context.actor.role === "superadmin", "Koreksi proses memerlukan superadmin.");
  if (["correct-supervisor", "sempro-examiner", "sidang-examiner"].includes(String(input.correction))) return correctAssignment(context, input);
  if (typeof input.correction === "string" && input.correction.startsWith("sempro-")) return correctSempro(context, input);
  const note = reason.parse(input.reason);
  const command = z.enum(["reopen-score", "reissue-minutes", "revoke-document", "replace-examiners", "cancel-schedule"]).parse(input.correction);
  if (command === "revoke-document") {
    const doc = await context.tx.dokumenVerifikasi.findUnique({ where: { id: idSchema.parse(input.documentId) } });
    ensure(doc && doc.status === "sah", "Dokumen aktif tidak ditemukan.");
    const data = { status: "dicabut", dicabutAt: new Date(), dicabutOlehId: context.actor.id, alasanPencabutan: note, updatedAt: new Date() };
    await context.tx.dokumenVerifikasi.update({ where: { id: doc.id }, data });
    await audit(context.tx, context.actor.id, "koreksi_cabut_dokumen", `dokumen:${doc.id}`, { before: doc, after: data, reason: note });
    return;
  }
  if (command === "replace-examiners") return assignExaminers(context, input);
  if (command === "cancel-schedule") return cancelSchedule(context, { ...input, status: "dibatalkan" });
  const { row, jadwal } = await scheduleRecord(context, idSchema.parse(input.jadwalId));
  const ba = jadwal.beritaAcaraList[0];
  if (command === "reopen-score") {
    ensure(!ba?.hasil, "Berita acara resmi telah terbit; penilaian per dosen tidak dapat dibuka ulang.");
    const scorer = idSchema.parse(input.dosenId);
    ensure(scoreRole(snapshotBoard(jadwal), scorer), "Dosen bukan penilai yang ditetapkan.");
    const previous = jadwal.penilaianList.find((p) => p.penilaiId === scorer);
    ensure(previous && ["terkunci", "disimpan"].includes(previous.status), "Nilai tersimpan tidak ditemukan.");
    await context.tx.dokumenVerifikasi.updateMany({ where: { idJadwalSidang: jadwal.id,
      jenisDokumen: { in: ["form_nilai_sidang", "form_penilaian_sidang"] }, penandatanganUserId: scorer, status: "sah" },
    data: { status: "tidak_berlaku", dicabutAt: new Date(), dicabutOlehId: context.actor.id, alasanPencabutan: note, updatedAt: new Date() } });
    const data = { status: "draft", catatanUmum: note, updatedAt: new Date() };
    await context.tx.penilaianSidang.update({ where: { id: previous.id }, data });
    if (ba) await context.tx.beritaAcara.update({ where: { id: ba.id }, data: { statusPersetujuan: "menunggu_nilai_lengkap",
      keputusanPenguji1: null, catatanPenguji1: null, diputuskanPenguji1At: null, updatedAt: new Date() } });
    await sidangEvent(context, "koreksi_buka_ulang_nilai_sidang", row, previous, { ...data, reason: note }, [scorer]);
  } else {
    ensure(ba?.hasil, "Berita acara resmi belum tersedia.");
    await context.tx.dokumenVerifikasi.updateMany({ where: { idJadwalSidang: jadwal.id,
      jenisDokumen: { in: ["berita_acara_sidang", "rekap_nilai_sidang"] }, status: "sah" },
    data: { status: "tidak_berlaku", dicabutAt: new Date(), dicabutOlehId: context.actor.id, alasanPencabutan: note, updatedAt: new Date() } });
    const doc = await issueDocument(context, row, jadwal.id, "berita_acara_sidang");
    await issueDocument(context, row, jadwal.id, "rekap_nilai_sidang");
    await sidangEvent(context, "koreksi_terbit_ulang_berita_acara_sidang", row, ba, { documentId: String(doc.id), version: doc.versi, reason: note });
  }
}
