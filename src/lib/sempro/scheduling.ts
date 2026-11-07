import "server-only";
import { checkConflicts } from "@/lib/sidang/scheduling";
import { Prisma } from "@/generated/prisma/client";
import { ensure } from "@/lib/accounts/store";
import {
  validateSlotRules,
  checkTimeOverlap,
} from "./policy";
import {
  requireManager,
  requireLecturer,
  semproEvent,
  type SemproContext,
  managers,
} from "./store";
import { terbitkanUndangan } from "./documents";

export async function tetapkanPenguji(
  context: SemproContext,
  pendaftaranId: bigint,
  penguji1Id: bigint,
  penguji2Id: bigint,
) {
  requireManager(context);
  const sempro = await context.tx.pendaftaranSempro.findUnique({
    where: { id: pendaftaranId },
    include: {
      pengajuan: true,
      penguji: true,
    },
  });
  ensure(sempro, "Pendaftaran seminar proposal tidak ditemukan.");
  ensure(sempro.statusBerkas === "lengkap", "Berkas seminar proposal harus lengkap sebelum penetapan penguji.");

  ensure(penguji1Id !== penguji2Id, "Penguji 1 dan Penguji 2 tidak boleh dosen yang sama.");
  if (sempro.idDosenPembimbingSempro) {
    ensure(
      penguji1Id !== sempro.idDosenPembimbingSempro && penguji2Id !== sempro.idDosenPembimbingSempro,
      "Dosen pembimbing tidak boleh merangkap sebagai penguji.",
    );
  }

  // Validate active lecturer accounts
  const lecturers = await context.tx.pengguna.findMany({
    where: {
      id: { in: [penguji1Id, penguji2Id] },
      statusAkun: "aktif",
      deletedAt: null,
      dosen: { isNot: null },
    },
  });
  ensure(lecturers.length === 2, "Penguji yang dipilih harus berupa dosen aktif.");

  // Delete previous assignments if any
  await context.tx.penugasanPenguji.deleteMany({
    where: { idSempro: sempro.id },
  });

  // Create Penguji 1 (Ketua)
  const p1 = await context.tx.penugasanPenguji.create({
    data: {
      idSempro: sempro.id,
      idDosenPenguji: penguji1Id,
      nomorPenguji: 1,
      jenis: "sempro",
      peran: "ketua",
      statusApproval: "menunggu",
    },
  });

  // Create Penguji 2 (Anggota)
  const p2 = await context.tx.penugasanPenguji.create({
    data: {
      idSempro: sempro.id,
      idDosenPenguji: penguji2Id,
      nomorPenguji: 2,
      jenis: "sempro",
      peran: "anggota",
      statusApproval: "menunggu",
    },
  });

  await semproEvent(
    context,
    "PenetapanPengujiSempro",
    `pendaftaran_sempro:${sempro.id}`,
    null,
    { penguji1Id: String(penguji1Id), penguji2Id: String(penguji2Id) },
    [penguji1Id, penguji2Id, sempro.pengajuan.idMahasiswa],
    `Anda telah ditetapkan sebagai dewan penguji seminar proposal mahasiswa.`,
    `/sempro/jadwal`,
  );

  return { p1, p2 };
}

export async function aturJadwalSempro(
  context: SemproContext,
  pendaftaranId: bigint,
  tanggalStr: string,
  waktuMulai: string,
  waktuSelesai: string,
  ruang: string,
  alasanPerubahan?: string,
) {
  requireManager(context);
  validateSlotRules(tanggalStr, waktuMulai, waktuSelesai);

  const sempro = await context.tx.pendaftaranSempro.findUnique({
    where: { id: pendaftaranId },
    include: {
      pengajuan: true,
      penguji: true,
      jadwal: true,
    },
  });
  ensure(sempro, "Pendaftaran seminar proposal tidak ditemukan.");
  ensure(sempro.statusBerkas === "lengkap", "Berkas harus lengkap sebelum mengatur jadwal.");
  ensure(sempro.penguji.length === 2, "Penguji 1 dan Penguji 2 harus ditetapkan terlebih dahulu.");
  ensure(sempro.idDosenPembimbingSempro, "Dosen pembimbing belum terpasang pada pendaftaran.");

  const p1Id = sempro.penguji.find((p) => p.nomorPenguji === 1)?.idDosenPenguji;
  const p2Id = sempro.penguji.find((p) => p.nomorPenguji === 2)?.idDosenPenguji;
  const pembimbingId = sempro.idDosenPembimbingSempro!;
  ensure(p1Id && p2Id, "Penguji belum lengkap.");

  const dateObj = new Date(tanggalStr);
  await checkConflicts(context, { tanggal: tanggalStr, mulai: waktuMulai, selesai: waktuSelesai, ruang },
    [p1Id, p2Id, pembimbingId], { sempro: sempro.jadwal?.id });

  // Check room conflict
  const existingRoomSchedules = await context.tx.jadwalSempro.findMany({
    where: {
      tanggal: dateObj,
      ruang,
      status: { notIn: ["tidak_terlaksana", "dibatalkan"] },
      ...(sempro.jadwal ? { id: { not: sempro.jadwal.id } } : {}),
    },
  });
  for (const item of existingRoomSchedules) {
    if (item.waktuMulai && item.waktuSelesai && checkTimeOverlap(waktuMulai, waktuSelesai, item.waktuMulai, item.waktuSelesai)) {
      throw new Error(`Ruang "${ruang}" sudah digunakan pada jam tersebut.`);
    }
  }

  // Check lecturer schedule collisions
  const existingLecturerSchedules = await context.tx.jadwalSempro.findMany({
    where: {
      tanggal: dateObj,
      status: { notIn: ["tidak_terlaksana", "dibatalkan"] },
      ...(sempro.jadwal ? { id: { not: sempro.jadwal.id } } : {}),
      sempro: {
        OR: [
          { idDosenPembimbingSempro: { in: [p1Id, p2Id, pembimbingId] } },
          { penguji: { some: { idDosenPenguji: { in: [p1Id, p2Id, pembimbingId] } } } },
        ],
      },
    },
  });
  for (const item of existingLecturerSchedules) {
    if (item.waktuMulai && item.waktuSelesai && checkTimeOverlap(waktuMulai, waktuSelesai, item.waktuMulai, item.waktuSelesai)) {
      throw new Error(`Salah satu dosen penguji atau pembimbing memiliki jadwal bentrok pada jam tersebut.`);
    }
  }

  let jadwal = sempro.jadwal;
  let currentVersion = 1;

  if (jadwal) {
    currentVersion = jadwal.versi + 1;
    // Archive previous version to RiwayatJadwalSempro
    await context.tx.riwayatJadwalSempro.create({
      data: {
        jadwalSemproId: jadwal.id,
        versi: jadwal.versi,
        tanggal: jadwal.tanggal,
        jamMulai: jadwal.waktuMulai,
        jamSelesai: jadwal.waktuSelesai,
        ruang: jadwal.ruang,
        alasanPerubahan: alasanPerubahan ?? "Penjadwalan ulang oleh program studi.",
        diubahOlehId: context.actor.id,
      },
    });

    jadwal = await context.tx.jadwalSempro.update({
      where: { id: jadwal.id },
      data: {
        versi: currentVersion,
        tanggal: dateObj,
        waktuMulai,
        waktuSelesai,
        ruang,
        status: "menunggu_konfirmasi",
        statusKonfirmasiDosen: "menunggu",
        statusPelaksanaan: "terjadwal",
        revisiUndangan: jadwal.revisiUndangan + 1,
        updatedAt: new Date(),
      },
    });
  } else {
    jadwal = await context.tx.jadwalSempro.create({
      data: {
        idSempro: sempro.id,
        versi: 1,
        tanggal: dateObj,
        waktuMulai,
        waktuSelesai,
        ruang,
        status: "menunggu_konfirmasi",
        statusKonfirmasiDosen: "menunggu",
        statusPelaksanaan: "terjadwal",
      },
    });
  }

  // Create or refresh 3 parallel confirmations
  await context.tx.konfirmasiJadwalSempro.deleteMany({
    where: { jadwalSemproId: jadwal.id, versi: currentVersion },
  });

  const dewan = [
    { dosenId: pembimbingId, peran: "pembimbing" },
    { dosenId: p1Id, peran: "penguji_1" },
    { dosenId: p2Id, peran: "penguji_2" },
  ];

  for (const d of dewan) {
    await context.tx.konfirmasiJadwalSempro.create({
      data: {
        jadwalSemproId: jadwal.id,
        versi: currentVersion,
        dosenId: d.dosenId,
        peran: d.peran,
        status: "menunggu",
      },
    });
  }

  await semproEvent(
    context,
    "JadwalSemproDitetapkan",
    `jadwal_sempro:${jadwal.id}`,
    null,
    { tanggal: tanggalStr, waktuMulai, waktuSelesai, ruang, versi: currentVersion },
    [pembimbingId, p1Id, p2Id, sempro.pengajuan.idMahasiswa],
    `Jadwal seminar proposal telah ditentukan pada tanggal ${tanggalStr} pukul ${waktuMulai} - ${waktuSelesai} WITA. Silakan konfirmasi ketersediaan Anda.`,
    `/sempro/konfirmasi-jadwal`,
  );

  return jadwal;
}

export async function konfirmasiJadwalDosen(
  context: SemproContext,
  jadwalId: bigint,
  status: "bersedia" | "tidak_bersedia" | "permohonan_ubah_jadwal",
  catatan?: string,
  usulanJadwal?: Record<string, unknown>,
) {
  requireLecturer(context);
  const jadwal = await context.tx.jadwalSempro.findUnique({
    where: { id: jadwalId },
    include: {
      sempro: {
        include: {
          pengajuan: { include: { mahasiswa: true } },
          penguji: true,
        },
      },
      konfirmasiList: true,
      beritaAcara: true,
    },
  });
  ensure(jadwal && jadwal.sempro, "Jadwal seminar proposal tidak ditemukan.");

  const konfirmasi = await context.tx.konfirmasiJadwalSempro.findFirst({
    where: {
      jadwalSemproId: jadwal.id,
      versi: jadwal.versi,
      dosenId: context.actor.id,
    },
  });
  ensure(konfirmasi, "Anda tidak terdaftar sebagai dewan pembimbing/penguji pada jadwal ini.");

  await context.tx.konfirmasiJadwalSempro.update({
    where: { id: konfirmasi.id },
    data: {
      status,
      catatan: catatan ?? null,
      usulanJadwal: usulanJadwal ? JSON.stringify(usulanJadwal) : Prisma.JsonNull,
      respondedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  // Check all responses for this schedule version
  const allKonfirmasi = await context.tx.konfirmasiJadwalSempro.findMany({
    where: { jadwalSemproId: jadwal.id, versi: jadwal.versi },
  });

  const allAgreed = allKonfirmasi.length === 3 && allKonfirmasi.every((k) => k.status === "bersedia");
  const anyRejected = allKonfirmasi.some((k) => ["tidak_bersedia", "permohonan_ubah_jadwal"].includes(k.status));

  if (allAgreed) {
    // Auto-finalize schedule
    await context.tx.jadwalSempro.update({
      where: { id: jadwal.id },
      data: {
        status: "final",
        statusKonfirmasiDosen: "terkonfirmasi",
        diterbitkanAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Create BeritaAcara initialized record if not existing
    if (!jadwal.beritaAcara) {
      await context.tx.beritaAcara.create({
        data: {
          idJadwal: jadwal.id,
          statusPersetujuan: "menunggu_nilai_lengkap",
        },
      });
    }

    // Automatically issue Surat Undangan
    await terbitkanUndangan(context, jadwal.id);

    const managerIds = await managers(context.tx);
    await semproEvent(
      context,
      "JadwalSemproFinal",
      `jadwal_sempro:${jadwal.id}`,
      { status: jadwal.status },
      { status: "final" },
      [...managerIds, jadwal.sempro.pengajuan.idMahasiswa],
      `Seluruh dewan pembimbing & penguji telah menyetujui jadwal. Jadwal sempro dan surat undangan resmi telah diterbitkan.`,
      `/sempro/jadwal`,
    );
  } else if (anyRejected) {
    await context.tx.jadwalSempro.update({
      where: { id: jadwal.id },
      data: {
        statusKonfirmasiDosen: "ada_penolakan",
        updatedAt: new Date(),
      },
    });

    const managerIds = await managers(context.tx);
    await semproEvent(
      context,
      "PenolakanJadwalSempro",
      `jadwal_sempro:${jadwal.id}`,
      null,
      { dosenId: String(context.actor.id), status, catatan },
      managerIds,
      `Dosen ${context.actor.nama} mengajukan ${status === "tidak_bersedia" ? "ketidaksediaan" : "permohonan perubahan jadwal"} sempro.`,
      `/sempro/jadwal`,
    );
  }

  return { status, allAgreed };
}

export async function tandaiTidakTerlaksana(
  context: SemproContext,
  jadwalId: bigint,
  alasan?: string,
) {
  requireManager(context);
  const jadwal = await context.tx.jadwalSempro.findUnique({
    where: { id: jadwalId },
    include: { sempro: { include: { pengajuan: true } } },
  });
  ensure(jadwal, "Jadwal sempro tidak ditemukan.");

  await context.tx.jadwalSempro.update({
    where: { id: jadwal.id },
    data: {
      status: "tidak_terlaksana",
      statusPelaksanaan: "dibatalkan",
      catatan: alasan ?? "Ditandai tidak terlaksana oleh pengelola program studi.",
      updatedAt: new Date(),
    },
  });

  return { success: true };
}
