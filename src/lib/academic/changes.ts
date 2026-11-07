import "server-only";
import { z } from "zod";
import { ensure, jsonValue } from "@/lib/accounts/store";
import { idSchema } from "@/lib/accounts/validation";
import { titleSchema, reason } from "./validation";
import { similarity, similarityColumns } from "./similarity";
import { cancelSupervisor, event, guidanceRecord, managers, requireManager, requireStudent, requireSupervisor, type Context, type Input } from "./store";

export async function submitChange(context: Context, input: Input) {
  requireStudent(context);
  const b = await guidanceRecord(context, idSchema.parse(input.id));
  ensure(b.pengajuan.idMahasiswa === context.actor.id, "Anda bukan mahasiswa pemilik.");
  ensure(b.idDosenPembimbing, "Pembimbing utama belum ditetapkan.");
  for (const id of [b.idDosenPembimbing, b.idDosenPembimbing2]) {
    if (!id) continue;
    const lecturer = await context.tx.pengguna.findUnique({ where: { id }, select: { role: true, statusAkun: true, deletedAt: true } });
    ensure(lecturer && lecturer.statusAkun === "aktif" && !lecturer.deletedAt && ["dosen", "kaprodi", "sekpro"].includes(lecturer.role),
      "Pembimbing tidak aktif. Hubungi pengelola untuk penetapan kembali.");
  }
  const data = titleSchema.parse(input);
  const kind = z.enum(["revisi_minor", "seminar_ulang"]).parse(input.jenis);
  const note = z.string().trim().min(10).max(5000).parse(input.reason);
  ensure(data.judul !== b.pengajuan.judul, "Judul baru harus berbeda.");
  ensure(!await context.tx.pengajuanPerubahanJudul.findFirst({ where: { bimbinganId: b.id, status: { in: ["diajukan", "menunggu_dospem", "menunggu_kaprodi"] } } }), "Masih ada perubahan judul menunggu keputusan.");
  const fieldIds = [...new Set(data.matriks.flatMap((row) => [row.bidang_keahlian_id, row.bidang_keahlian_2_id]).filter((id): id is bigint => id !== null))];
  ensure(await context.tx.bidangKeahlian.count({ where: { id: { in: fieldIds } } }) === fieldIds.length, "Bidang keahlian tidak ditemukan.");
  const result = similarity(data.judul, await context.tx.arsipJudulSkripsi.findMany({ orderBy: { id: "asc" } }));
  const row = await context.tx.pengajuanPerubahanJudul.create({ data: { bimbinganId: b.id, judulLama: b.pengajuan.judul,
    judulBaru: data.judul, alasan: note, jenisPerubahan: kind, matriksLama: jsonValue(b.pengajuan.matriksPenelitian), matriksBaru: jsonValue(data.matriks),
    bidangKeahlianIdBaru: data.matriks[0].bidang_keahlian_id, bidangKeahlian2IdBaru: data.matriks[0].bidang_keahlian_2_id,
    status: "menunggu_dospem", skorKemiripan: result.skor, createdAt: new Date(), updatedAt: new Date(),
  } });
  await event(context, "ajukan_perubahan_judul", `perubahan:${row.id}`, null, row, [b.idDosenPembimbing, b.idDosenPembimbing2], "Perubahan judul menunggu review pembimbing.", `/bimbingan/${b.id}`);
}

export async function decideChange(context: Context, input: Input, approve: boolean, final: boolean) {
  const { tx, actor } = context;
  const row = await tx.pengajuanPerubahanJudul.findUnique({ where: { id: idSchema.parse(input.id) } });
  ensure(row, "Perubahan judul tidak ditemukan.");
  const b = await guidanceRecord(context, row.bimbinganId);
  const note = approve ? z.string().max(1000).parse(input.reason ?? "") : reason.parse(input.reason);
  if (!final) {
    requireSupervisor(context, b);
    ensure(row.status === "menunggu_dospem", "Perubahan judul sudah diputuskan atau diteruskan ke pengelola.");
    const primary = b.idDosenPembimbing === actor.id;
    ensure(!(primary ? row.konfirmasiDospem1At : row.konfirmasiDospem2At), "Persetujuan pembimbing sudah tercatat.");
    const agreed = approve && (primary ? (!b.idDosenPembimbing2 || row.disetujuiDospem2) : row.disetujuiDospem1);
    const data = { ...(primary ? { disetujuiDospem1: approve, konfirmasiDospem1At: new Date() } : { disetujuiDospem2: approve, konfirmasiDospem2At: new Date() }),
      status: !approve ? "ditolak_dospem" : agreed ? "menunggu_kaprodi" : "menunggu_dospem", catatanDospem: note,
      catatanInternalDospem: z.string().max(5000).parse(input.internal ?? ""), keputusanAt: !approve ? new Date() : null, updatedAt: new Date(),
    };
    await tx.pengajuanPerubahanJudul.update({ where: { id: row.id }, data });
    await event(context, "review_perubahan_judul_dospem", `perubahan:${row.id}`, row, data,
      [b.pengajuan.idMahasiswa, ...(agreed ? await managers(tx) : [])], "Review pembimbing perubahan judul telah dicatat.", `/bimbingan/${b.id}`);
    return;
  }
  requireManager(context);
  ensure(row.status === "menunggu_kaprodi" && row.disetujuiDospem1 && (!b.idDosenPembimbing2 || row.disetujuiDospem2), "Persetujuan seluruh pembimbing belum lengkap.");
  ensure(row.judulLama === b.pengajuan.judul, "Snapshot judul telah berubah. Ajukan permohonan baru.");
  if (approve) {
    const result = similarity(row.judulBaru, await tx.arsipJudulSkripsi.findMany({ orderBy: { id: "asc" } }));
    if (row.jenisPerubahan === "seminar_ulang") {
      if (b.idDosenPembimbing) await cancelSupervisor(context, b.id, 1, "Disetujui seminar ulang oleh program studi");
      if (b.idDosenPembimbing2) await cancelSupervisor(context, b.id, 2, "Disetujui seminar ulang oleh program studi");
      await tx.logbookBimbingan.updateMany({ where: { idBimbingan: b.id, isDibatalkan: false }, data: { isDibatalkan: true, dibatalkanAt: new Date(), dibatalkanOlehId: actor.id, alasanPembatalan: "Seminar ulang", updatedAt: new Date() } });
      await tx.bimbingan.update({ where: { id: b.id }, data: { faseSkripsiAt: null, updatedAt: new Date() } });
    }
    await tx.pengajuanJudul.update({ where: { id: b.idPengajuan }, data: { judul: row.judulBaru, matriksPenelitian: jsonValue(row.matriksBaru), ...similarityColumns(result),
      bidangKeahlianId: row.bidangKeahlianIdBaru, bidangKeahlian2Id: row.bidangKeahlian2IdBaru,
      ...(row.jenisPerubahan === "seminar_ulang" ? { counterPengajuan: { increment: 1 } } : {}), updatedAt: new Date(),
    } });
  }
  const data = { status: approve ? "disetujui" : "ditolak_kaprodi", penyetujuId: actor.id, penyetujuRole: context.role === "sekpro" ? "sekpro" : "kaprodi",
    keputusanAt: new Date(), catatanKaprodi: note, updatedAt: new Date() };
  await tx.pengajuanPerubahanJudul.update({ where: { id: row.id }, data });
  await event(context, "keputusan_perubahan_judul", `perubahan:${row.id}`, row, data,
    [b.pengajuan.idMahasiswa, b.idDosenPembimbing, b.idDosenPembimbing2], "Keputusan perubahan judul telah diterbitkan.", `/bimbingan/${b.id}`);
}
