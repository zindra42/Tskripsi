import "server-only";
import { prisma } from "@/lib/db";
import type { AuthenticatedSession } from "@/lib/auth/session";

export async function getPendaftaranSemproView(
  session: AuthenticatedSession,
  mahasiswaId?: bigint,
) {
  const targetId = mahasiswaId ?? session.user.id;
  const pengajuan = await prisma.pengajuanJudul.findFirst({
    where: {
      idMahasiswa: targetId,
      status: "disetujui",
      statusDraft: "diajukan",
      isDiarsipkan: false,
      deletedAt: null,
    },
    include: {
      bimbingan: {
        include: {
          pembimbing1: true,
          pembimbing2: true,
          documents: { where: { jenisDokumen: "acc", status: "sah" } },
        },
      },
      sempro: {
        include: {
          checklist: { orderBy: { nomorItem: "asc" } },
          penguji: { include: { dosen: true } },
          jadwal: {
            include: {
              konfirmasiList: { include: { dosen: true } },
              beritaAcara: {
                include: {
                  revisiList: { orderBy: { versi: "desc" } },
                },
              },
              documents: { orderBy: { versi: "desc" } },
            },
          },
          dispensasiFinal: true,
          dispensasiList: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });

  return pengajuan;
}

export async function getListVerifikasiSemproView() {
  const list = await prisma.pendaftaranSempro.findMany({
    where: {
      statusBerkas: { in: ["menunggu_verifikasi", "revisi_sebagian", "lengkap"] },
    },
    include: {
      pengajuan: {
        include: {
          mahasiswa: true,
          bimbingan: { include: { pembimbing1: true } },
        },
      },
      checklist: { orderBy: { nomorItem: "asc" } },
      jadwal: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return list;
}

export async function getPenjadwalanSemproView() {
  const listSemproSiapJadwal = await prisma.pendaftaranSempro.findMany({
    where: {
      statusBerkas: "lengkap",
    },
    include: {
      pengajuan: {
        include: {
          mahasiswa: true,
          bimbingan: { include: { pembimbing1: true, pembimbing2: true } },
        },
      },
      penguji: { include: { dosen: true } },
      jadwal: {
        include: {
          konfirmasiList: { include: { dosen: true } },
          riwayatList: { orderBy: { versi: "desc" } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const activeLecturers = await prisma.pengguna.findMany({
    where: {
      dosen: { isNot: null },
      statusAkun: "aktif",
      deletedAt: null,
    },
    select: {
      id: true,
      nama: true,
      email: true,
      dosen: { select: { nidn: true, kuotaBimbingan: true } },
    },
    orderBy: { nama: "asc" },
  });

  return { listSemproSiapJadwal, activeLecturers };
}

export async function getKonfirmasiJadwalDosenView(session: AuthenticatedSession) {
  const schedules = await prisma.jadwalSempro.findMany({
    where: {
      status: { in: ["menunggu_konfirmasi", "final"] },
      statusPelaksanaan: { in: ["terjadwal", "berlangsung"] },
      OR: [
        { sempro: { idDosenPembimbingSempro: session.user.id } },
        { sempro: { penguji: { some: { idDosenPenguji: session.user.id } } } },
      ],
    },
    include: {
      sempro: {
        include: {
          pengajuan: { include: { mahasiswa: true } },
          penguji: { include: { dosen: true } },
          pembimbingSempro: true,
        },
      },
      konfirmasiList: {
        where: { dosenId: session.user.id },
      },
      beritaAcara: true,
    },
    orderBy: { tanggal: "asc" },
  });

  return schedules;
}

export async function getKehadiranSemproView(session: AuthenticatedSession, jadwalId?: bigint) {
  const activeSchedules = await prisma.jadwalSempro.findMany({
    where: {
      status: "final",
      statusPelaksanaan: { in: ["terjadwal", "berlangsung", "selesai"] },
      ...(jadwalId ? { id: jadwalId } : {}),
    },
    include: {
      sempro: {
        include: {
          pengajuan: { include: { mahasiswa: true } },
        },
      },
      kehadiranList: {
        include: {
          mahasiswa: true,
          ditambahkanOleh: true,
        },
        orderBy: { waktuAmbil: "desc" },
      },
    },
    orderBy: { tanggal: "desc" },
  });

  return activeSchedules;
}

export async function getHasilSemproView() {
  const list = await prisma.beritaAcara.findMany({
    where: {
      statusPersetujuan: { in: ["menunggu_persetujuan_kaprodi", "disetujui_kaprodi"] },
    },
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
          documents: {
            where: { jenisDokumen: "berita_acara" },
          },
        },
      },
      penguji1: true,
      revisiList: {
        orderBy: { versi: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return list;
}
