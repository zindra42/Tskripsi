import "server-only";
import crypto from "node:crypto";
import {
  generateNomorSurat,
  getBulanRomawi,
  konversiPredikat,
} from "./policy";
import { SimplePdfDocument } from "./pdf";
import type { SemproContext } from "./store";
import type { Tx } from "@/lib/accounts/store";

export async function getOrCreateNomorDasar(tx: Tx, pengajuanId: bigint) {
  let nomorDasar = await tx.nomorSuratDasar.findUnique({
    where: { idPengajuan: pengajuanId },
  });
  if (!nomorDasar) {
    const currentYear = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Makassar", year: "numeric" }).format(new Date()));
    // Imported allocations may be sparse. Counting rows would reuse an existing number.
    const lastAllocation = await tx.nomorSuratDasar.findFirst({
      where: { tahun: currentYear }, orderBy: { nomorUrut: "desc" },
    });
    const nextUrut = (lastAllocation?.nomorUrut ?? 0) + 1;

    nomorDasar = await tx.nomorSuratDasar.create({
      data: {
        idPengajuan: pengajuanId,
        tahun: currentYear,
        nomorUrut: nextUrut,
        tanggalAlokasi: new Date(),
      },
    });
  }
  return nomorDasar;
}

export async function getOrCreateNomorDokumen(
  tx: Tx,
  nomorDasarId: bigint,
  kategori: string,
  tanggalTerbit: Date = new Date(),
) {
  let kategoriRecord = await tx.nomorSuratKategori.findUnique({
    where: {
      idNomorDasar_kategori: {
        idNomorDasar: nomorDasarId,
        kategori,
      },
    },
  });

  if (!kategoriRecord) {
    const nomorDasar = await tx.nomorSuratDasar.findUniqueOrThrow({
      where: { id: nomorDasarId },
    });
    const romawi = getBulanRomawi(tanggalTerbit);
    const tahun = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Makassar", year: "numeric" }).format(tanggalTerbit));
    const nomorLengkap = generateNomorSurat(nomorDasar.nomorUrut, kategori, romawi, tahun);

    kategoriRecord = await tx.nomorSuratKategori.create({
      data: {
        idNomorDasar: nomorDasar.id,
        kategori,
        nomorLengkap,
        bulanRomawi: romawi,
        tahun,
        tanggalTerbit,
      },
    });
  }

  return kategoriRecord;
}

export async function terbitkanUndangan(context: SemproContext, jadwalId: bigint) {
  const jadwal = await context.tx.jadwalSempro.findUniqueOrThrow({
    where: { id: jadwalId },
    include: {
      sempro: {
        include: {
          pengajuan: { include: { mahasiswa: true } },
          penguji: { include: { dosen: true } },
          pembimbingSempro: true,
        },
      },
      documents: {
        where: { jenisDokumen: "undangan" },
        orderBy: { versi: "desc" },
      },
    },
  });

  const sempro = jadwal.sempro!;
  const nomorDasar = await getOrCreateNomorDasar(context.tx, sempro.idPengajuan);
  const nomorKategori = await getOrCreateNomorDokumen(context.tx, nomorDasar.id, "b", new Date());

  const latestDoc = jadwal.documents[0];
  const nextVersion = latestDoc ? latestDoc.versi + 1 : 1;

  // Find Kaprodi user as signer
  const kaprodi = await context.tx.pengguna.findFirst({
    where: {
      OR: [
        { role: "kaprodi" },
        { dosen: { isKaprodi: true } },
      ],
      statusAkun: "aktif",
      deletedAt: null,
    },
  });
  const signerName = kaprodi?.nama ?? "Ketua Program Studi Informatika";
  const signerId = kaprodi?.id ?? context.actor.id;

  const token = crypto.randomBytes(24).toString("hex");

  const snapshot = {
    nomorSurat: nomorKategori.nomorLengkap,
    jadwalId: String(jadwal.id),
    versi: nextVersion,
    tanggal: jadwal.tanggal ? jadwal.tanggal.toISOString().slice(0, 10) : "",
    waktuMulai: jadwal.waktuMulai,
    waktuSelesai: jadwal.waktuSelesai,
    ruang: jadwal.ruang,
    mahasiswaNama: sempro.pengajuan.mahasiswa.nama,
    mahasiswaNim: sempro.pengajuan.mahasiswa.email?.split("@")[0] ?? "-",
    judul: sempro.pengajuan.judul,
    pembimbing: sempro.pembimbingSempro?.nama ?? "-",
    penguji1: sempro.penguji.find((p) => p.nomorPenguji === 1)?.dosen.nama ?? "-",
    penguji2: sempro.penguji.find((p) => p.nomorPenguji === 2)?.dosen.nama ?? "-",
  };

  const hash = crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

  const newDoc = await context.tx.dokumenVerifikasi.create({
    data: {
      jenisDokumen: "undangan",
      token,
      idPengajuan: sempro.idPengajuan,
      idSempro: sempro.id,
      idJadwal: jadwal.id,
      penandatanganUserId: signerId,
      namaPenandatangan: signerName,
      jabatanSnapshot: "Ketua Program Studi Informatika",
      peran: "kaprodi",
      nomorSurat: nomorKategori.nomorLengkap,
      status: "sah",
      versi: nextVersion,
      snapshotJson: snapshot,
      hashSha256: hash,
      diterbitkanAt: new Date(),
    },
  });

  // If there was a previous version, mark it replaced (digantikan)
  if (latestDoc && latestDoc.status === "sah") {
    await context.tx.dokumenVerifikasi.update({
      where: { id: latestDoc.id },
      data: {
        status: "digantikan",
        digantikanOlehId: newDoc.id,
        dicabutAt: new Date(),
        alasanPencabutan: "Diterbitkan undangan versi baru karena perubahan jadwal seminar proposal.",
      },
    });
  }

  return newDoc;
}

export async function terbitkanBeritaAcara(context: SemproContext, beritaAcaraId: bigint) {
  const ba = await context.tx.beritaAcara.findUniqueOrThrow({
    where: { id: beritaAcaraId },
    include: {
      jadwal: {
        include: {
          sempro: {
            include: {
              pengajuan: { include: { mahasiswa: true } },
              penguji: { include: { dosen: true } },
              pembimbingSempro: true,
            },
          },
        },
      },
      penguji1: true,
    },
  });

  const jadwal = ba.jadwal!;
  const sempro = jadwal.sempro!;

  const kaprodi = await context.tx.pengguna.findFirst({
    where: {
      OR: [
        { role: "kaprodi" },
        { dosen: { isKaprodi: true } },
      ],
      statusAkun: "aktif",
      deletedAt: null,
    },
  });
  const signerName = kaprodi?.nama ?? "Ketua Program Studi Informatika";
  const signerId = kaprodi?.id ?? context.actor.id;

  const token = crypto.randomBytes(24).toString("hex");

  const snapshot = {
    beritaAcaraId: String(ba.id),
    jadwalId: String(jadwal.id),
    tanggal: jadwal.tanggal ? jadwal.tanggal.toISOString().slice(0, 10) : "",
    mahasiswaNama: sempro.pengajuan.mahasiswa.nama,
    mahasiswaNim: sempro.pengajuan.mahasiswa.email?.split("@")[0] ?? "-",
    judul: sempro.pengajuan.judul,
    nilaiAngka: ba.nilai ? Number(ba.nilai) : null,
    hasil: ba.hasil,
    catatanRevisi: ba.catatanRevisi ?? ba.catatanPenguji1,
    pembimbing: sempro.pembimbingSempro?.nama ?? "-",
    penguji1: sempro.penguji.find((p) => p.nomorPenguji === 1)?.dosen.nama ?? "-",
    penguji2: sempro.penguji.find((p) => p.nomorPenguji === 2)?.dosen.nama ?? "-",
  };

  const hash = crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

  const doc = await context.tx.dokumenVerifikasi.create({
    data: {
      jenisDokumen: "berita_acara",
      token,
      idPengajuan: sempro.idPengajuan,
      idSempro: sempro.id,
      idJadwal: jadwal.id,
      penandatanganUserId: signerId,
      namaPenandatangan: signerName,
      jabatanSnapshot: "Ketua Program Studi Informatika",
      peran: "kaprodi",
      status: "sah",
      versi: 1,
      snapshotJson: snapshot,
      hashSha256: hash,
      diterbitkanAt: new Date(),
    },
  });

  return doc;
}

export function renderSuratUndanganPdf(doc: {
  token: string;
  nomorSurat?: string | null;
  namaPenandatangan: string | null;
  jabatanSnapshot?: string | null;
  snapshotJson: unknown;
}): Buffer {
  const data = (doc.snapshotJson ?? {}) as Record<string, string>;
  const pdf = new SimplePdfDocument();

  pdf.drawKopSurat();

  pdf.drawText("SURAT UNDANGAN SEMINAR PROPOSAL", 297.64, 715, 12, true, "center");
  if (doc.nomorSurat) {
    pdf.drawText(`Nomor: ${doc.nomorSurat}`, 297.64, 700, 10, false, "center");
  }

  let y = 665;
  pdf.drawText("Kepada Yth.", 50, y, 10);
  y -= 14;
  pdf.drawText("1. " + (data.penguji1 ?? "Dosen Penguji 1 (Ketua Dewan)"), 65, y, 10);
  y -= 14;
  pdf.drawText("2. " + (data.penguji2 ?? "Dosen Penguji 2 (Anggota Dewan)"), 65, y, 10);
  y -= 14;
  pdf.drawText("3. " + (data.pembimbing ?? "Dosen Pembimbing"), 65, y, 10);
  y -= 14;
  pdf.drawText("Di Tempat", 50, y, 10);

  y -= 25;
  pdf.drawText("Dengan hormat,", 50, y, 10);
  y -= 16;
  pdf.drawText(
    "Mengharap kehadiran Bapak/Ibu Dewan Pembimbing dan Penguji pada Seminar Proposal Skripsi:",
    50,
    y,
    10,
  );

  y -= 24;
  pdf.drawText("Nama Mahasiswa", 65, y, 10, true);
  pdf.drawText(`: ${data.mahasiswaNama ?? "-"}`, 180, y, 10);
  y -= 18;
  pdf.drawText("NIM", 65, y, 10, true);
  pdf.drawText(`: ${data.mahasiswaNim ?? "-"}`, 180, y, 10);
  y -= 18;
  pdf.drawText("Hari / Tanggal", 65, y, 10, true);
  pdf.drawText(`: ${data.tanggal ?? "-"}`, 180, y, 10);
  y -= 18;
  pdf.drawText("Waktu", 65, y, 10, true);
  pdf.drawText(`: ${data.waktuMulai ?? "-"} - ${data.waktuSelesai ?? "-"} WITA`, 180, y, 10);
  y -= 18;
  pdf.drawText("Ruang", 65, y, 10, true);
  pdf.drawText(`: ${data.ruang ?? "-"}`, 180, y, 10);
  y -= 18;
  pdf.drawText("Judul Proposal", 65, y, 10, true);
  pdf.drawText(`: ${data.judul ?? "-"}`, 180, y, 10);

  y -= 30;
  pdf.drawText("Demikian undangan ini kami sampaikan, atas kehadiran dan kerjasamanya diucapkan terima kasih.", 50, y, 10);

  // Sign area + QR
  const signY = 320;
  pdf.drawText("Sumbawa, " + new Date().toISOString().slice(0, 10), 380, signY, 10);
  pdf.drawText(doc.jabatanSnapshot ?? "Ketua Program Studi Informatika", 380, signY - 14, 10);

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://sias.uts.ac.id"}/verifikasi/${doc.token}`;
  pdf.drawQrCode(verifyUrl, 410, signY - 110, 75);

  pdf.drawText(doc.namaPenandatangan ?? "-", 380, signY - 130, 10, true);
  pdf.drawText("Tanda Tangan Elektronik Tersertifikasi SIAS", 380, signY - 142, 8);

  return pdf.build();
}

export function renderBeritaAcaraPdf(doc: {
  token: string;
  namaPenandatangan: string | null;
  jabatanSnapshot?: string | null;
  snapshotJson: unknown;
}): Buffer {
  const data = (doc.snapshotJson ?? {}) as Record<string, unknown>;
  const pdf = new SimplePdfDocument();

  pdf.drawKopSurat();

  pdf.drawText("BERITA ACARA SEMINAR PROPOSAL SKRIPSI", 297.64, 715, 12, true, "center");

  let y = 670;
  pdf.drawText("Pada hari ini telah dilaksanakan Seminar Proposal Skripsi mahasiswa:", 50, y, 10);

  y -= 22;
  pdf.drawText("Nama Mahasiswa", 65, y, 10, true);
  pdf.drawText(`: ${String(data.mahasiswaNama ?? "-")}`, 180, y, 10);
  y -= 18;
  pdf.drawText("NIM", 65, y, 10, true);
  pdf.drawText(`: ${String(data.mahasiswaNim ?? "-")}`, 180, y, 10);
  y -= 18;
  pdf.drawText("Tanggal Seminar", 65, y, 10, true);
  pdf.drawText(`: ${String(data.tanggal ?? "-")}`, 180, y, 10);
  y -= 18;
  pdf.drawText("Judul Proposal", 65, y, 10, true);
  pdf.drawText(`: ${String(data.judul ?? "-")}`, 180, y, 10);

  y -= 30;
  pdf.drawText("HASIL KEPUTUSAN DEWAN PENGUJI", 50, y, 11, true);
  y -= 20;

  const nilaiAngka = Number(data.nilaiAngka ?? 0);
  const predikat = konversiPredikat(nilaiAngka);

  pdf.drawText("Nilai Angka", 65, y, 10, true);
  pdf.drawText(`: ${nilaiAngka > 0 ? nilaiAngka.toFixed(2) : "-"}`, 180, y, 10);
  y -= 18;
  pdf.drawText("Nilai Huruf", 65, y, 10, true);
  pdf.drawText(`: ${predikat.huruf} (${predikat.keterangan})`, 180, y, 10);
  y -= 18;
  pdf.drawText("Keputusan", 65, y, 10, true);
  const hasilText =
    data.hasil === "lulus"
      ? "LULUS TANPA REVISI"
      : data.hasil === "lulus_revisi"
      ? "LULUS DENGAN REVISI"
      : data.hasil === "tidak_lulus"
      ? "TIDAK LULUS (SEMINAR ULANG)"
      : "-";
  pdf.drawText(`: ${hasilText}`, 180, y, 10, true);

  if (data.catatanRevisi) {
    y -= 18;
    pdf.drawText("Catatan Revisi", 65, y, 10, true);
    pdf.drawText(`: ${String(data.catatanRevisi)}`, 180, y, 9);
  }

  y -= 30;
  pdf.drawText("DEWAN PENGUJI & PEMBIMBING:", 50, y, 10, true);
  y -= 16;
  pdf.drawText("1. Penguji 1 (Ketua)   : " + String(data.penguji1 ?? "-"), 65, y, 9);
  y -= 14;
  pdf.drawText("2. Penguji 2 (Anggota) : " + String(data.penguji2 ?? "-"), 65, y, 9);
  y -= 14;
  pdf.drawText("3. Pembimbing          : " + String(data.pembimbing ?? "-"), 65, y, 9);

  // Sign area + QR
  const signY = 280;
  pdf.drawText("Mengetahui & Mengesahkan,", 380, signY, 10);
  pdf.drawText(doc.jabatanSnapshot ?? "Ketua Program Studi Informatika", 380, signY - 14, 10);

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://sias.uts.ac.id"}/verifikasi/${doc.token}`;
  pdf.drawQrCode(verifyUrl, 410, signY - 110, 75);

  pdf.drawText(doc.namaPenandatangan ?? "-", 380, signY - 130, 10, true);
  pdf.drawText("Dokumen Resmi Ber-QR SIAS", 380, signY - 142, 8);

  return pdf.build();
}

export async function verifyDocumentToken(tx: Tx, token: string) {
  const doc = await tx.dokumenVerifikasi.findUnique({
    where: { token },
    include: {
      pengajuan: { include: { mahasiswa: true } },
      sempro: true,
      jadwalSempro: true,
      signer: true,
      replacement: true,
    },
  });
  return doc;
}
