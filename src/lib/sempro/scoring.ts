import "server-only";
import { ensure } from "@/lib/accounts/store";
import {
  hitungNilaiKomponen,
  hitungNilaiAkhir,
} from "./policy";
import {
  requireManager,
  requireLecturer,
  requireStudent,
  semproEvent,
  type SemproContext,
} from "./store";
import { terbitkanBeritaAcara } from "./documents";
import { storePrivateUpload, type Upload } from "@/lib/academic/files";
import { Prisma } from "@/generated/prisma/client";

export async function submitNilaiPenguji(
  context: SemproContext,
  jadwalId: bigint,
  presentasi: number,
  materi: number,
  metodologi: number,
  alatBantu: number,
  penampilan: number,
  catatan?: string,
) {
  requireLecturer(context);
  const jadwal = await context.tx.jadwalSempro.findUnique({
    where: { id: jadwalId },
    include: {
      sempro: {
        include: {
          pengajuan: true,
          penguji: true,
        },
      },
      beritaAcara: true,
    },
  });
  ensure(jadwal && jadwal.sempro, "Jadwal seminar proposal tidak ditemukan.");

  const assignment = jadwal.sempro.penguji.find(
    (p) => p.idDosenPenguji === context.actor.id,
  );
  ensure(assignment, "Anda tidak terdaftar sebagai dosen penguji pada jadwal ini.");

  const nilaiTotalPenguji = hitungNilaiKomponen(
    presentasi,
    materi,
    metodologi,
    alatBantu,
    penampilan,
  );

  let ba = jadwal.beritaAcara;
  if (!ba) {
    ba = await context.tx.beritaAcara.create({
      data: {
        idJadwal: jadwal.id,
        statusPersetujuan: "menunggu_nilai_lengkap",
      },
    });
  }

  // Update penguji fields
  const isPenguji1 = assignment.nomorPenguji === 1;
  const updateData: Prisma.BeritaAcaraUpdateInput = isPenguji1
    ? {
        penguji1: { connect: { id: context.actor.id } },
        nilaiPenguji1: new Prisma.Decimal(nilaiTotalPenguji),
        catatanPenguji1Input: catatan ?? null,
        nilaiPresentasi: new Prisma.Decimal(presentasi),
        nilaiPenguasaanMateri: new Prisma.Decimal(materi),
        nilaiMetodologi: new Prisma.Decimal(metodologi),
        nilaiAlatBantu: new Prisma.Decimal(alatBantu),
        nilaiPenampilan: new Prisma.Decimal(penampilan),
        nilaiKelayakanProposal: new Prisma.Decimal(materi),
        updatedAt: new Date(),
      }
    : {
        nilaiPenguji2: new Prisma.Decimal(nilaiTotalPenguji),
        catatanPenguji2Input: catatan ?? null,
        updatedAt: new Date(),
      };

  ba = await context.tx.beritaAcara.update({
    where: { id: ba.id },
    data: updateData,
  });

  // Check if both examiners have scored
  if (ba.nilaiPenguji1 && ba.nilaiPenguji2) {
    const avgPenguji = (Number(ba.nilaiPenguji1) + Number(ba.nilaiPenguji2)) / 2;
    ba = await context.tx.beritaAcara.update({
      where: { id: ba.id },
      data: {
        nilaiAkhirPenguji: new Prisma.Decimal(Math.round(avgPenguji * 100) / 100),
      },
    });
  }

  // Check if all 3 scores exist
  if (ba.nilaiPenguji1 && ba.nilaiPenguji2 && ba.nilaiPembimbingTotal) {
    const finalScore = hitungNilaiAkhir(
      Number(ba.nilaiPenguji1),
      Number(ba.nilaiPenguji2),
      Number(ba.nilaiPembimbingTotal),
    );

    ba = await context.tx.beritaAcara.update({
      where: { id: ba.id },
      data: {
        nilai: new Prisma.Decimal(finalScore),
        statusPersetujuan: "menunggu_keputusan_penguji_1",
      },
    });
  }

  return { nilaiTotalPenguji, statusPersetujuan: ba.statusPersetujuan };
}

export async function submitNilaiPembimbing(
  context: SemproContext,
  jadwalId: bigint,
  presentasi: number,
  alatBantu: number,
  penampilan: number,
  materi: number,
  kelayakanProposal: number,
  catatan?: string,
) {
  requireLecturer(context);
  const jadwal = await context.tx.jadwalSempro.findUnique({
    where: { id: jadwalId },
    include: {
      sempro: { include: { pengajuan: true } },
      beritaAcara: true,
    },
  });
  ensure(jadwal && jadwal.sempro, "Jadwal seminar proposal tidak ditemukan.");
  ensure(
    jadwal.sempro.idDosenPembimbingSempro === context.actor.id,
    "Anda bukan dosen pembimbing pada seminar proposal ini.",
  );

  const nilaiTotalPembimbing = hitungNilaiKomponen(
    presentasi,
    materi,
    kelayakanProposal,
    alatBantu,
    penampilan,
  );

  let ba = jadwal.beritaAcara;
  if (!ba) {
    ba = await context.tx.beritaAcara.create({
      data: {
        idJadwal: jadwal.id,
        statusPersetujuan: "menunggu_nilai_lengkap",
      },
    });
  }

  ba = await context.tx.beritaAcara.update({
    where: { id: ba.id },
    data: {
      nilaiPembimbingPresentasi: presentasi,
      nilaiPembimbingAlatBantu: alatBantu,
      nilaiPembimbingPenampilan: penampilan,
      nilaiPembimbingPenguasaanMateri: materi,
      nilaiPembimbingKelayakanProposal: kelayakanProposal,
      nilaiPembimbingTotal: new Prisma.Decimal(nilaiTotalPembimbing),
      catatanPembimbing: catatan ?? null,
      statusDinilaiPembimbing: true,
      tanggalDinilaiPembimbing: new Date(),
      updatedAt: new Date(),
    },
  });

  // Check if all 3 scores exist
  if (ba.nilaiPenguji1 && ba.nilaiPenguji2 && ba.nilaiPembimbingTotal) {
    const finalScore = hitungNilaiAkhir(
      Number(ba.nilaiPenguji1),
      Number(ba.nilaiPenguji2),
      Number(ba.nilaiPembimbingTotal),
    );

    ba = await context.tx.beritaAcara.update({
      where: { id: ba.id },
      data: {
        nilai: new Prisma.Decimal(finalScore),
        statusPersetujuan: "menunggu_keputusan_penguji_1",
      },
    });
  }

  return { nilaiTotalPembimbing, statusPersetujuan: ba.statusPersetujuan };
}

export async function simpanKeputusanPenguji1(
  context: SemproContext,
  jadwalId: bigint,
  keputusan: "lulus" | "lulus_revisi" | "tidak_lulus",
  catatan?: string,
  tenggatRevisiStr?: string,
) {
  requireLecturer(context);
  const jadwal = await context.tx.jadwalSempro.findUnique({
    where: { id: jadwalId },
    include: {
      sempro: {
        include: {
          pengajuan: true,
          penguji: true,
        },
      },
      beritaAcara: true,
    },
  });
  ensure(jadwal && jadwal.sempro && jadwal.beritaAcara, "Berita acara sempro tidak ditemukan.");
  const ba = jadwal.beritaAcara!;

  const p1 = jadwal.sempro.penguji.find((p) => p.nomorPenguji === 1);
  ensure(
    p1 && p1.idDosenPenguji === context.actor.id,
    "Hanya Penguji 1 (Ketua Dewan) yang berhak menetapkan keputusan dewan penguji.",
  );

  ensure(
    ba.statusPersetujuan === "menunggu_keputusan_penguji_1" || ba.statusPersetujuan === "menunggu_persetujuan_kaprodi",
    "Nilai belum lengkap atau keputusan sudah diproses.",
  );

  const tenggatDate = tenggatRevisiStr ? new Date(tenggatRevisiStr) : null;

  const updated = await context.tx.beritaAcara.update({
    where: { id: ba.id },
    data: {
      penguji1Id: context.actor.id,
      keputusanPenguji1: keputusan,
      catatanPenguji1: catatan ?? null,
      tenggatRevisiPenguji1: tenggatDate,
      diputuskanPenguji1At: new Date(),
      statusPersetujuan: "menunggu_persetujuan_kaprodi",
      updatedAt: new Date(),
    },
  });

  return updated;
}

export async function tetapkanHasilSempro(
  context: SemproContext,
  jadwalId: bigint,
  hasil: "lulus" | "lulus_revisi" | "tidak_lulus",
  catatanKaprodi?: string,
  tenggatRevisiStr?: string,
) {
  requireManager(context);
  const jadwal = await context.tx.jadwalSempro.findUnique({
    where: { id: jadwalId },
    include: {
      sempro: {
        include: {
          pengajuan: { include: { bimbingan: true, mahasiswa: true } },
        },
      },
      beritaAcara: true,
    },
  });
  ensure(jadwal && jadwal.sempro && jadwal.beritaAcara, "Berita acara sempro tidak ditemukan.");
  const ba = jadwal.beritaAcara!;

  ensure(
    ba.statusPersetujuan === "menunggu_persetujuan_kaprodi" || ba.keputusanPenguji1 !== null,
    "Keputusan dewan penguji 1 harus ditetapkan terlebih dahulu.",
  );

  const tenggatDate = tenggatRevisiStr
    ? new Date(tenggatRevisiStr)
    : ba.tenggatRevisiPenguji1;

  const updatedBa = await context.tx.beritaAcara.update({
    where: { id: ba.id },
    data: {
      hasil,
      catatanKaprodi: catatanKaprodi ?? null,
      statusPersetujuan: "disetujui_kaprodi",
      disetujuiKaprodiAt: new Date(),
      tenggatRevisi: tenggatDate,
      statusRevisi: hasil === "lulus_revisi" ? "menunggu_revisi" : null,
      updatedAt: new Date(),
    },
  });

  // Mark schedule completed
  await context.tx.jadwalSempro.update({
    where: { id: jadwal.id },
    data: {
      statusPelaksanaan: "selesai",
      updatedAt: new Date(),
    },
  });

  // If passed, advance bimbingan to skripsi phase
  if (hasil === "lulus" || hasil === "lulus_revisi") {
    const bimbingan = jadwal.sempro.pengajuan.bimbingan;
    if (bimbingan && !bimbingan.faseSkripsiAt) {
      await context.tx.bimbingan.update({
        where: { id: bimbingan.id },
        data: { faseSkripsiAt: new Date() },
      });
    }
  }

  // Issue verified Berita Acara document with QR
  await terbitkanBeritaAcara(context, updatedBa.id);

  await semproEvent(
    context,
    "HasilSemproDisahkan",
    `berita_acara:${updatedBa.id}`,
    { hasilSebelum: ba.hasil },
    { hasil, statusPersetujuan: "disetujui_kaprodi" },
    [jadwal.sempro.pengajuan.idMahasiswa],
    `Hasil seminar proposal Anda telah disahkan oleh Kaprodi dengan keputusan: ${hasil}. Berita acara resmi telah diterbitkan.`,
    `/sempro/hasil`,
  );

  return updatedBa;
}

export async function unggahRevisiSempro(
  context: SemproContext,
  beritaAcaraId: bigint,
  upload: Upload,
  catatanMahasiswa?: string,
) {
  requireStudent(context);
  const ba = await context.tx.beritaAcara.findUnique({
    where: { id: beritaAcaraId },
    include: {
      jadwal: {
        include: {
          sempro: { include: { pengajuan: true } },
        },
      },
      revisiList: { orderBy: { versi: "desc" } },
    },
  });
  ensure(ba && ba.jadwal && ba.jadwal.sempro, "Berita acara sempro tidak ditemukan.");
  ensure(
    ba.jadwal.sempro.pengajuan.idMahasiswa === context.actor.id,
    "Anda bukan pemilik proposal skripsi ini.",
  );
  ensure(
    ba.hasil === "lulus_revisi",
    "Revisi proposal hanya untuk seminar yang berstatus lulus dengan revisi.",
  );

  const nextVersion = (ba.revisiList[0]?.versi ?? 0) + 1;
  const relativePath = await storePrivateUpload(
    upload,
    `sempro/revisi/${ba.id}`,
  );

  const revisi = await context.tx.revisiDokumen.create({
    data: {
      tipe: "sempro",
      beritaAcaraId: ba.id,
      mahasiswaId: context.actor.id,
      versi: nextVersion,
      fileDraft: relativePath,
      fileUkuranBytes: BigInt(upload.bytes.length),
      status: "menunggu_persetujuan",
      catatanMahasiswa: catatanMahasiswa ?? null,
    },
  });

  await context.tx.beritaAcara.update({
    where: { id: ba.id },
    data: {
      statusRevisi: "dalam_revisi",
      updatedAt: new Date(),
    },
  });

  return revisi;
}

export async function putuskanRevisiSempro(
  context: SemproContext,
  revisiId: bigint,
  status: "disetujui" | "ditolak",
  alasanPenolakan?: string,
) {
  requireLecturer(context);
  const revisi = await context.tx.revisiDokumen.findUnique({
    where: { id: revisiId },
    include: {
      beritaAcara: {
        include: {
          jadwal: {
            include: {
              sempro: {
                include: {
                  penguji: true,
                },
              },
            },
          },
        },
      },
    },
  });
  ensure(revisi, "Dokumen revisi tidak ditemukan.");

  const jadwal = revisi.beritaAcara.jadwal;
  ensure(jadwal && jadwal.sempro, "Data jadwal tidak valid.");

  const isDospem = jadwal.sempro.idDosenPembimbingSempro === context.actor.id;
  const isPenguji1 = jadwal.sempro.penguji.some(
    (p) => p.nomorPenguji === 1 && p.idDosenPenguji === context.actor.id,
  );
  ensure(
    isDospem || isPenguji1,
    "Hanya dosen pembimbing atau penguji 1 yang berwenang menyetujui naskah revisi sempro.",
  );

  const updatedRevisi = await context.tx.revisiDokumen.update({
    where: { id: revisi.id },
    data: {
      status,
      alasanPenolakan: status === "ditolak" ? alasanPenolakan ?? null : null,
      ditolakOlehId: status === "ditolak" ? context.actor.id : null,
      disetujuiAt: status === "disetujui" ? new Date() : null,
      ditolakAt: status === "ditolak" ? new Date() : null,
      updatedAt: new Date(),
    },
  });

  if (status === "disetujui") {
    await context.tx.beritaAcara.update({
      where: { id: revisi.beritaAcaraId },
      data: {
        statusRevisi: "revisi_selesai",
        updatedAt: new Date(),
      },
    });
  }

  await semproEvent(
    context,
    "RevisiSemproDiputuskan",
    `revisi_dokumen:${revisi.id}`,
    { status: revisi.status },
    { status },
    [revisi.mahasiswaId],
    `Naskah revisi seminar proposal versi ${revisi.versi} telah ${status === "disetujui" ? "disetujui" : "ditolak"}.`,
    `/sempro/status`,
  );

  return updatedRevisi;
}
