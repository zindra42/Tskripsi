import "server-only";
import { ensure, type Tx } from "@/lib/accounts/store";
import { database } from "@/lib/db";
import {
  isDalamJendelaKehadiran,
  getTargetTierKehadiran,
} from "./policy";
import {
  requireManager,
  requireStudent,
  semproEvent,
  type SemproContext,
} from "./store";
import { storePrivateUpload, type Upload } from "@/lib/academic/files";

export async function catatKehadiranMahasiswa(
  context: SemproContext,
  jadwalId: bigint,
  upload: Upload,
) {
  requireStudent(context);
  const jadwal = await context.tx.jadwalSempro.findUnique({
    where: { id: jadwalId },
    include: { sempro: { include: { pengajuan: true } } },
  });
  ensure(jadwal && jadwal.sempro, "Jadwal seminar proposal tidak ditemukan.");
  ensure(
    jadwal.status === "final" && ["terjadwal", "berlangsung"].includes(jadwal.statusPelaksanaan),
    "Seminar proposal tidak sedang berlangsung atau belum final.",
  );
  ensure(
    jadwal.sempro.pengajuan.idMahasiswa !== context.actor.id,
    "Anda tidak dapat mencatatkan kehadiran sebagai peserta pada seminar proposal Anda sendiri.",
  );

  ensure(
    jadwal.tanggal && jadwal.waktuMulai && jadwal.waktuSelesai,
    "Waktu pelaksanaan seminar proposal belum lengkap.",
  );

  const dalamJendela = isDalamJendelaKehadiran(
    jadwal.tanggal,
    jadwal.waktuMulai,
    jadwal.waktuSelesai,
  );
  ensure(
    dalamJendela,
    "Pencatatan kehadiran hanya dapat dilakukan mulai 5 menit sebelum hingga 10 menit setelah seminar selesai.",
  );

  const existing = await context.tx.kehadiranSeminar.findUnique({
    where: {
      idJadwal_idMahasiswa: {
        idJadwal: jadwal.id,
        idMahasiswa: context.actor.id,
      },
    },
  });
  ensure(!existing, "Anda sudah mencatatkan kehadiran pada seminar proposal ini.");

  const pathFoto = await storePrivateUpload(upload, `sempro/kehadiran/${jadwal.id}`);

  const kehadiran = await context.tx.kehadiranSeminar.create({
    data: {
      idJadwal: jadwal.id,
      idMahasiswa: context.actor.id,
      pathFoto,
      isManual: false,
      status: "valid",
      waktuAmbil: new Date(),
    },
  });

  return kehadiran;
}

export async function tambahKehadiranManual(
  context: SemproContext,
  jadwalId: bigint,
  mahasiswaId: bigint,
  catatanManual?: string,
) {
  requireManager(context);
  const jadwal = await context.tx.jadwalSempro.findUnique({
    where: { id: jadwalId },
    include: { sempro: { include: { pengajuan: true } } },
  });
  ensure(jadwal && jadwal.sempro, "Jadwal seminar proposal tidak ditemukan.");
  ensure(
    jadwal.sempro.pengajuan.idMahasiswa !== mahasiswaId,
    "Mahasiswa yang bersangkutan adalah pemateri seminar, bukan peserta.",
  );

  const existing = await context.tx.kehadiranSeminar.findUnique({
    where: {
      idJadwal_idMahasiswa: {
        idJadwal: jadwal.id,
        idMahasiswa: mahasiswaId,
      },
    },
  });
  ensure(!existing, "Mahasiswa ini sudah tercatat kehadirannya pada seminar ini.");

  const kehadiran = await context.tx.kehadiranSeminar.create({
    data: {
      idJadwal: jadwal.id,
      idMahasiswa: mahasiswaId,
      pathFoto: null,
      isManual: true,
      ditambahkanOlehId: context.actor.id,
      catatanManual: catatanManual ?? "Ditambahkan secara manual oleh pengelola program studi.",
      status: "valid",
      waktuAmbil: new Date(),
    },
  });

  return kehadiran;
}

export async function tolakKehadiran(
  context: SemproContext,
  kehadiranId: bigint,
  alasanPenolakan: string,
) {
  requireManager(context);
  const kehadiran = await context.tx.kehadiranSeminar.findUnique({
    where: { id: kehadiranId },
  });
  ensure(kehadiran, "Data kehadiran tidak ditemukan.");

  const updated = await context.tx.kehadiranSeminar.update({
    where: { id: kehadiran.id },
    data: {
      status: "ditolak",
      idPenolak: context.actor.id,
      alasanPenolakan,
      updatedAt: new Date(),
    },
  });

  return updated;
}

export async function getKualifikasiKehadiran(
  pendaftaranId: bigint,
  tx?: Tx,
) {
  const db = (tx ?? database()) as Tx;
  const sempro = await db.pendaftaranSempro.findUnique({
    where: { id: pendaftaranId },
    include: {
      pengajuan: true,
      dispensasiFinal: true,
    },
  });
  ensure(sempro, "Pendaftaran seminar proposal tidak ditemukan.");

  // If already snapshotted and locked, preserve snapshot
  if (sempro.dikunciPada && sempro.statusFinal) {
    return {
      nFinal: sempro.nFinal ?? 0,
      syaratFinal: sempro.syaratFinal ?? 0,
      terkumpulFinal: sempro.terkumpulFinal ?? 0,
      statusFinal: sempro.statusFinal,
      isLocked: true,
    };
  }

  // Count valid attendances
  const terkumpul = await db.kehadiranSeminar.count({
    where: {
      idMahasiswa: sempro.pengajuan.idMahasiswa,
      status: "valid",
    },
  });

  // Urutan sempro in period / registration
  const earlierCount = await db.pendaftaranSempro.count({
    where: {
      createdAt: { lt: sempro.createdAt ?? new Date() },
    },
  });
  const urutan = earlierCount + 1;

  // Total qualifying seminars held so far
  const nSeminars = await db.jadwalSempro.count({
    where: {
      status: "final",
      statusPelaksanaan: "selesai",
      sempro: { id: { not: sempro.id } },
    },
  });

  const targetTier = getTargetTierKehadiran(urutan);
  const syarat = Math.min(targetTier, nSeminars);

  let statusFinal = "belum_memenuhi";
  if (sempro.dispensasiId) {
    statusFinal = "dispensasi_disetujui";
  } else if (terkumpul >= syarat) {
    statusFinal = "memenuhi";
  }

  return {
    nFinal: nSeminars,
    syaratFinal: syarat,
    terkumpulFinal: terkumpul,
    statusFinal,
    isLocked: false,
  };
}

export async function hitungKualifikasiKehadiran(
  context: SemproContext,
  pendaftaranId: bigint,
) {
  return getKualifikasiKehadiran(pendaftaranId, context.tx);
}

export async function kunciKehadiranSempro(
  context: SemproContext,
  pendaftaranId: bigint,
) {
  requireManager(context);
  const qual = await hitungKualifikasiKehadiran(context, pendaftaranId);

  const updated = await context.tx.pendaftaranSempro.update({
    where: { id: pendaftaranId },
    data: {
      nFinal: qual.nFinal,
      syaratFinal: qual.syaratFinal,
      terkumpulFinal: qual.terkumpulFinal,
      statusFinal: qual.statusFinal,
      dikunciPada: new Date(),
      updatedAt: new Date(),
    },
  });

  return updated;
}

export async function ajukanDispensasiKehadiran(
  context: SemproContext,
  pendaftaranId: bigint,
  alasan: string,
) {
  requireStudent(context);
  const sempro = await context.tx.pendaftaranSempro.findUnique({
    where: { id: pendaftaranId },
    include: { pengajuan: true },
  });
  ensure(sempro, "Pendaftaran seminar proposal tidak ditemukan.");
  ensure(
    sempro.pengajuan.idMahasiswa === context.actor.id,
    "Anda bukan pemilik pendaftaran seminar proposal ini.",
  );

  const qual = await hitungKualifikasiKehadiran(context, pendaftaranId);

  const dispensasi = await context.tx.dispensasiKehadiranSempro.create({
    data: {
      pendaftaranSemproId: sempro.id,
      mahasiswaId: context.actor.id,
      alasan,
      status: "menunggu",
      syaratSaatPengajuan: qual.syaratFinal,
      terkumpulSaatPengajuan: qual.terkumpulFinal,
    },
  });

  return dispensasi;
}

export async function putuskanDispensasiKehadiran(
  context: SemproContext,
  dispensasiId: bigint,
  status: "disetujui" | "ditolak",
  alasanKeputusan?: string,
) {
  requireManager(context);
  const dispensasi = await context.tx.dispensasiKehadiranSempro.findUnique({
    where: { id: dispensasiId },
    include: { sempro: { include: { pengajuan: true } } },
  });
  ensure(dispensasi, "Permohonan dispensasi tidak ditemukan.");

  const updated = await context.tx.dispensasiKehadiranSempro.update({
    where: { id: dispensasi.id },
    data: {
      status,
      diputuskanOleh: context.actor.id,
      peranPemutus: context.role,
      alasanKeputusan: alasanKeputusan ?? null,
      diputuskanPada: new Date(),
      updatedAt: new Date(),
    },
  });

  if (status === "disetujui") {
    await context.tx.pendaftaranSempro.update({
      where: { id: dispensasi.pendaftaranSemproId },
      data: {
        dispensasiId: dispensasi.id,
        statusFinal: "dispensasi_disetujui",
        updatedAt: new Date(),
      },
    });

    // Auto update Item 5 checklist
    const item5 = await context.tx.checklistDokumen.findFirst({
      where: { idSempro: dispensasi.pendaftaranSemproId, nomorItem: 5 },
    });
    if (item5) {
      await context.tx.checklistDokumen.update({
        where: { id: item5.id },
        data: {
          statusItem: "diverifikasi",
          catatanVerifikator: "Dispensasi kehadiran disetujui program studi.",
          updatedAt: new Date(),
        },
      });
    }
  }

  await semproEvent(
    context,
    "DispensasiKehadiranDiputuskan",
    `dispensasi_kehadiran_sempro:${dispensasi.id}`,
    { status: dispensasi.status },
    { status },
    [dispensasi.mahasiswaId],
    `Permohonan dispensasi kehadiran seminar Anda telah ${status === "disetujui" ? "disetujui" : "ditolak"}.`,
    `/sempro/status`,
  );

  return updated;
}
