import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ensure, jsonValue, audit } from "@/lib/accounts/store";
import { type Context } from "@/lib/academic/store";
import { getOrCreateNomorDasar, getOrCreateNomorDokumen } from "@/lib/sempro/documents";
import { SimplePdfDocument } from "@/lib/sempro/pdf";
import { sidangRecord, snapshotBoard, type Sidang } from "./store";
import { officialResult } from "./policy";

export async function revokeInvitations(context: Context, scheduleId: bigint, note: string) {
  // Use the same FK for issuance, revocation and replacement. Never match sempro's id_jadwal.
  await context.tx.dokumenVerifikasi.updateMany({ where: { idJadwalSidang: scheduleId, jenisDokumen: "undangan_sidang", status: "sah" },
    data: { status: "dicabut", dicabutAt: new Date(), dicabutOlehId: context.actor.id, alasanPencabutan: note, updatedAt: new Date() } });
}
export async function issueDocument(context: Context, original: Sidang, scheduleId: bigint,
  kind: "undangan_sidang" | "berita_acara_sidang" | "rekap_nilai_sidang" | "form_nilai_sidang", scorer?: bigint) {
  const row = await sidangRecord(context, original.id, false);
  const j = row.jadwalList.find((j) => j.id === scheduleId);
  ensure(j, "Jadwal tidak ditemukan.");
  const board = snapshotBoard(j);
  const ba = j.beritaAcaraList[0];
  if (kind === "undangan_sidang") ensure(j.status === "final", "Undangan hanya terbit setelah seluruh dewan bersedia.");
  if (kind === "berita_acara_sidang") ensure(ba && officialResult(ba) && ba.hasil && j.statusPelaksanaan === "selesai", "Keputusan resmi diperlukan.");
  const score = scorer ? j.penilaianList.find((p) => p.penilaiId === scorer && p.status === "terkunci") : null;
  if (kind === "form_nilai_sidang") ensure(score, "Nilai harus terkunci sebelum dokumen terbit.");
  const previous = await context.tx.dokumenVerifikasi.findFirst({ where: { idJadwalSidang: j.id, jenisDokumen: kind,
    ...(scorer ? { penandatanganUserId: scorer } : {}) }, orderBy: [{ versi: "desc" }, { id: "desc" }] });
  const dewan = await context.tx.pengguna.findMany({ where: { id: { in: Object.values(board).map(BigInt) } },
    select: { id: true, nama: true, dosen: { select: { nidn: true } } } });
  const officer = kind === "undangan_sidang" ? await context.tx.pengguna.findFirst({ where: { statusAkun: "aktif", deletedAt: null,
    role: { in: ["dosen", "kaprodi", "sekpro"] }, OR: [{ role: "kaprodi" }, { dosen: { isKaprodi: true } }] }, include: { dosen: true } })
    ?? await context.tx.pengguna.findFirst({ where: { statusAkun: "aktif", deletedAt: null,
      role: { in: ["dosen", "kaprodi", "sekpro"] }, OR: [{ role: "sekpro" }, { dosen: { isSekpro: true } }] }, include: { dosen: true } }) : null;
  const signer = scorer ? dewan.find((u) => u.id === scorer) : kind === "undangan_sidang" ? officer : context.actor;
  ensure(signer, "Penandatangan tidak ditemukan.");
  const signerRole = scorer ? score!.peran : kind === "undangan_sidang"
    ? officer!.role === "kaprodi" || officer!.dosen?.isKaprodi ? "kaprodi" : "sekpro" : context.role;
  const base = await getOrCreateNomorDasar(context.tx, row.idPengajuan);
  const number = await getOrCreateNomorDokumen(context.tx, base.id, kind === "undangan_sidang" ? "b" : kind === "form_nilai_sidang" ? "c" : "d");
  const snapshot = jsonValue({ snapshotVersion: "sias-ts-sidang-v1", nomorSurat: number.nomorLengkap,
    mahasiswaNama: row.pengajuan.mahasiswa.nama, mahasiswaNim: row.pengajuan.mahasiswa.mahasiswa?.nim ?? "-", judul: row.pengajuan.judul,
    penandatangan: { id: String(signer.id), nama: signer.nama, peran: signerRole },
    jadwalId: String(j.id), versiJadwal: j.versi, tanggal: j.tanggal?.toISOString().slice(0, 10), waktuMulai: j.waktuMulai,
    waktuSelesai: j.waktuSelesai, ruang: j.ruang, siklusKe: row.siklusKe, periode: row.periodeSnapshot,
    dewan: Object.fromEntries(Object.entries(board).map(([role, id]) => [role, { id, nama: dewan.find((u) => String(u.id) === id)?.nama,
      nidn: dewan.find((u) => String(u.id) === id)?.dosen?.nidn }])),
    ...(kind === "form_nilai_sidang" ? { score } : {}),
    ...(["berita_acara_sidang", "rekap_nilai_sidang"].includes(kind) ? { hasil: ba?.hasil, nilai: ba?.nilai?.toString(), predikat: ba?.predikatHuruf,
      catatan: ba?.catatanRevisi, tenggat: ba?.tenggatRevisi?.toISOString().slice(0, 10), nilaiDewan: j.penilaianList.map((p) => ({
        penilaiId: String(p.penilaiId), peran: p.peran, nilai: p.nilaiAkhir.toString(), rubrik: p.rubrikSnapshot, komponen: p.nilaiKomponen,
      })) } : {}),
  });
  const hashSha256 = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  if (previous?.status === "sah" && previous.hashSha256 === hashSha256) return previous;
  const doc = await context.tx.dokumenVerifikasi.create({ data: { jenisDokumen: kind, token: randomBytes(24).toString("hex"),
    idPengajuan: row.idPengajuan, idSidang: row.id, idJadwalSidang: j.id, penandatanganUserId: signer.id,
    namaPenandatangan: signer.nama, jabatanSnapshot: scorer ? score!.peran : signerRole === "sekpro" ? "Sekretaris Program Studi" : "Ketua Program Studi",
    peran: signerRole, nomorSurat: number.nomorLengkap, status: "sah", versi: (previous?.versi ?? 0) + 1,
    snapshotJson: snapshot, hashSha256, diterbitkanAt: new Date(), createdAt: new Date() } });
  if (previous) await context.tx.dokumenVerifikasi.update({ where: { id: previous.id }, data: { status: "digantikan",
    digantikanOlehId: doc.id, dicabutAt: previous.dicabutAt ?? new Date(), alasanPencabutan: previous.alasanPencabutan ?? "Versi dokumen baru diterbitkan", updatedAt: new Date() } });
  await audit(context.tx, context.actor.id, `terbit_${kind}`, `dokumen:${doc.id}`, { before: previous, after: doc });
  return doc;
}

export function renderSidangPdf(doc: { jenisDokumen: string; token: string; status: string; versi: number;
  nomorSurat: string | null; namaPenandatangan: string; snapshotJson: unknown }) {
  const data = (doc.snapshotJson ?? {}) as Record<string, unknown>;
  // Legacy snapshots use nested mahasiswa/jadwal/nilai/dewan. Render them without rewriting the stored JSON or hash.
  const student = (data.mahasiswa ?? {}) as Record<string, unknown>;
  const schedule = (data.jadwal ?? {}) as Record<string, unknown>;
  const result = typeof data.nilai === "object" && data.nilai ? data.nilai as Record<string, unknown> : {};
  const titles: Record<string, string> = { undangan_sidang: "UNDANGAN SIDANG SKRIPSI", berita_acara_sidang: "BERITA ACARA SIDANG SKRIPSI",
    rekap_nilai_sidang: "REKAP NILAI SIDANG SKRIPSI", form_nilai_sidang: "FORM PENILAIAN SIDANG SKRIPSI", acc_sidang: "PERSETUJUAN SIDANG SKRIPSI" };
  const pdf = new SimplePdfDocument();
  pdf.drawKopSurat();
  pdf.drawText(titles[doc.jenisDokumen] ?? "DOKUMEN SIDANG", 298, 714, 12, true, "center");
  pdf.drawText(`Nomor: ${doc.nomorSurat ?? "-"} / Versi ${doc.versi}`, 298, 695, 9, false, "center");
  let y = 665;
  function line(label: string, value: unknown) {
    const text = `${label}: ${String(value ?? "-")}`;
    const pieces = text.match(/.{1,85}(?:\s|$)|.{1,85}/g) ?? [text];
    for (const part of pieces) {
      if (y < 180) { pdf.addPage(); pdf.drawKopSurat(); y = 700; }
      pdf.drawText(part.trim(), 50, y, 10); y -= 15;
    }
  }
  if (doc.status !== "sah") line("STATUS", doc.status.toUpperCase());
  line("Mahasiswa", data.mahasiswaNama ?? student.nama ?? data.mahasiswa_id);
  line("NIM", data.mahasiswaNim ?? student.nim);
  line("Judul", data.judul ?? student.judul);
  line("Tanggal", data.tanggal ?? schedule.tanggal);
  line("Waktu WITA", `${data.waktuMulai ?? schedule.waktu_mulai ?? "-"} - ${data.waktuSelesai ?? schedule.waktu_selesai ?? "-"}`);
  line("Ruang", data.ruang ?? schedule.ruang);
  const board = data.dewan;
  if (board && typeof board === "object") for (const [role, person] of Object.entries(board)) {
    line(role.replaceAll("_", " "), (person as { nama?: string }).nama);
  }
  if (data.hasil ?? result.hasil) { line("Keputusan", data.hasil ?? result.hasil); line("Nilai akhir / predikat", `${typeof data.nilai === "string" ? data.nilai : result.nilai_akhir ?? "-"} / ${data.predikat ?? result.predikat_huruf ?? "-"}`); line("Tenggat revisi", data.tenggat); }
  if (data.catatan) line("Catatan keputusan", data.catatan);
  if (Array.isArray(data.nilaiDewan)) for (const score of data.nilaiDewan) line(score.peran, score.nilai);
  const score = data.score as { peran?: string; nilaiKomponen?: Record<string, string>; nilaiAkhir?: string } | undefined;
  if (score) { line("Peran penilai", score.peran); for (const [code, value] of Object.entries(score.nilaiKomponen ?? {})) line(code, value); line("Nilai akhir", score.nilaiAkhir); }
  line("Penandatangan", doc.namaPenandatangan);
  const origin = process.env.APP_ORIGIN || "http://localhost:3000";
  pdf.drawQrCode(`${origin}/verifikasi/${doc.token}`, 450, 55, 85);
  pdf.drawText("Keaslian, status, dan versi dokumen diperiksa melalui QR SIAS.", 50, 40, 8);
  return pdf.build();
}
