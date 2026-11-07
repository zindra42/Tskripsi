import "server-only";
import { ensure } from "@/lib/accounts/store";
import {
  SEMPRO_CHECKLIST_DEFINITIONS,
  PRA_SEMPRO_ITEMS,
  SUBMIT_REQUIRED_ITEMS,
} from "./policy";
import {
  requireManager,
  requireStudent,
  semproEvent,
  type SemproContext,
  managers,
} from "./store";
import { storePrivateUpload, type Upload } from "@/lib/academic/files";

export async function getOrCreateSempro(context: SemproContext, mahasiswaId?: bigint) {
  const targetMahasiswaId = mahasiswaId ?? context.actor.id;
  const pengajuan = await context.tx.pengajuanJudul.findFirst({
    where: {
      idMahasiswa: targetMahasiswaId,
      status: "disetujui",
      statusDraft: "diajukan",
      isDiarsipkan: false,
      deletedAt: null,
    },
    include: {
      bimbingan: {
        include: {
          logbook: {
            where: { isDibatalkan: false, statusSelesai: true },
          },
          documents: {
            where: { jenisDokumen: "acc", status: "sah" },
          },
        },
      },
    },
  });

  ensure(pengajuan && pengajuan.bimbingan, "Mahasiswa belum memiliki judul skripsi aktif yang disetujui.");
  const bimbingan = pengajuan.bimbingan!;

  let sempro = await context.tx.pendaftaranSempro.findUnique({
    where: { idPengajuan: pengajuan.id },
    include: {
      checklist: { orderBy: { nomorItem: "asc" } },
      penguji: { include: { dosen: true } },
      jadwal: {
        include: {
          konfirmasiList: { include: { dosen: true } },
          riwayatList: true,
          kehadiranList: true,
          beritaAcara: true,
        },
      },
      dispensasiFinal: true,
      dispensasiList: true,
    },
  });

  if (!sempro) {
    sempro = await context.tx.pendaftaranSempro.create({
      data: {
        idPengajuan: pengajuan.id,
        idDosenPembimbingSempro: bimbingan.idDosenPembimbing,
        statusDraft: "draft",
        statusBerkas: "draft",
        tanggalDaftar: new Date(),
      },
      include: {
        checklist: { orderBy: { nomorItem: "asc" } },
        penguji: { include: { dosen: true } },
        jadwal: {
          include: {
            konfirmasiList: { include: { dosen: true } },
            riwayatList: true,
            kehadiranList: true,
            beritaAcara: true,
          },
        },
        dispensasiFinal: true,
        dispensasiList: true,
      },
    });
  }

  // Synchronize master checklist items
  const existingMap = new Map(sempro.checklist.map((c) => [c.nomorItem, c]));
  for (const itemNo of PRA_SEMPRO_ITEMS) {
    const def = SEMPRO_CHECKLIST_DEFINITIONS[itemNo];
    if (!def) continue;

    if (!existingMap.has(itemNo)) {
      const created = await context.tx.checklistDokumen.create({
        data: {
          idSempro: sempro.id,
          nomorItem: itemNo,
          namaDokumen: def.namaDokumen,
          deskripsi: def.deskripsi,
          jenisBentuk: def.jenisBentuk,
          verifikatorRole: def.verifikatorRole,
          statusItem: "kosong",
        },
      });
      existingMap.set(itemNo, created);
    }
  }

  // Auto-sync Item 1: ACC Sempro from bimbingan documents
  const item1 = existingMap.get(1);
  if (item1 && item1.statusItem === "kosong") {
    const accDoc = bimbingan.documents[0];
    if (accDoc) {
      await context.tx.checklistDokumen.update({
        where: { id: item1.id },
        data: {
          filePindaian: accDoc.token,
          statusUnggahan: "otomatis_sistem",
          statusItem: "terisi",
        },
      });
    }
  }

  // Auto-sync Item 8: Min 7 logbooks
  const item8 = existingMap.get(8);
  if (item8 && item8.statusItem === "kosong") {
    const semproLogs = bimbingan.logbook.filter((l) => l.fase === "sempro");
    if (semproLogs.length >= 7) {
      await context.tx.checklistDokumen.update({
        where: { id: item8.id },
        data: {
          statusUnggahan: "otomatis_sistem",
          statusItem: "terisi",
          catatanVerifikator: `Tercatat ${semproLogs.length} bimbingan tervalidasi.`,
        },
      });
    }
  }

  // Reload sempro with updated checklist
  return context.tx.pendaftaranSempro.findUniqueOrThrow({
    where: { id: sempro.id },
    include: {
      pengajuan: { include: { mahasiswa: true } },
      pembimbingSempro: true,
      checklist: { orderBy: { nomorItem: "asc" } },
      penguji: { include: { dosen: true } },
      jadwal: {
        include: {
          konfirmasiList: { include: { dosen: true } },
          riwayatList: true,
          kehadiranList: true,
          beritaAcara: true,
        },
      },
      dispensasiFinal: true,
      dispensasiList: true,
    },
  });
}

export async function uploadChecklistFile(
  context: SemproContext,
  pendaftaranId: bigint,
  nomorItem: number,
  upload: Upload,
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
  ensure(
    ["draft", "revisi_sebagian", "dikembalikan"].includes(sempro.statusBerkas),
    "Berkas sedang diverifikasi atau sudah lengkap sehingga tidak dapat diubah.",
  );

  const allowedUploadItems = [0, 6, 9, 10];
  ensure(allowedUploadItems.includes(nomorItem), "Item checklist ini tidak menerima unggahan manual.");

  const checklist = await context.tx.checklistDokumen.findFirst({
    where: { idSempro: sempro.id, nomorItem },
  });
  ensure(checklist, "Item checklist tidak ditemukan.");

  const relativePath = await storePrivateUpload(upload, `sempro/checklist/${sempro.id}`);

  await context.tx.checklistDokumen.update({
    where: { id: checklist.id },
    data: {
      filePindaian: relativePath,
      statusItem: "terisi",
      statusUnggahan: "diunggah_mahasiswa",
      catatanVerifikator: null,
      updatedAt: new Date(),
    },
  });

  return { success: true, relativePath };
}

export async function centangMandiriChecklist(
  context: SemproContext,
  pendaftaranId: bigint,
  nomorItem: number,
  centang: boolean,
) {
  requireStudent(context);
  const sempro = await context.tx.pendaftaranSempro.findUnique({
    where: { id: pendaftaranId },
    include: { pengajuan: true },
  });
  ensure(sempro, "Pendaftaran sempro tidak ditemukan.");
  ensure(
    sempro.pengajuan.idMahasiswa === context.actor.id,
    "Anda bukan pemilik pendaftaran seminar proposal ini.",
  );
  ensure(
    ["draft", "revisi_sebagian", "dikembalikan"].includes(sempro.statusBerkas),
    "Berkas tidak dalam status draft atau revisi.",
  );
  ensure(nomorItem === 7, "Hanya item nomor 7 (penggandaan proposal) yang dapat dicentang mandiri.");

  const checklist = await context.tx.checklistDokumen.findFirst({
    where: { idSempro: sempro.id, nomorItem },
  });
  ensure(checklist, "Item checklist tidak ditemukan.");

  await context.tx.checklistDokumen.update({
    where: { id: checklist.id },
    data: {
      statusItem: centang ? "terisi" : "kosong",
      statusUnggahan: centang ? "centang_mandiri" : null,
      updatedAt: new Date(),
    },
  });

  return { success: true };
}

export async function submitPendaftaranSempro(
  context: SemproContext,
  pendaftaranId: bigint,
) {
  requireStudent(context);
  const sempro = await context.tx.pendaftaranSempro.findUnique({
    where: { id: pendaftaranId },
    include: {
      pengajuan: true,
      checklist: true,
    },
  });
  ensure(sempro, "Pendaftaran seminar proposal tidak ditemukan.");
  ensure(
    sempro.pengajuan.idMahasiswa === context.actor.id,
    "Anda bukan pemilik pendaftaran seminar proposal ini.",
  );
  ensure(
    ["draft", "revisi_sebagian", "dikembalikan"].includes(sempro.statusBerkas),
    "Pendaftaran sudah diajukan atau telah lengkap.",
  );

  // Validate all required items are satisfied
  const itemMap = new Map(sempro.checklist.map((c) => [c.nomorItem, c]));
  for (const itemNo of SUBMIT_REQUIRED_ITEMS) {
    const item = itemMap.get(itemNo);
    const def = SEMPRO_CHECKLIST_DEFINITIONS[itemNo];
    ensure(
      item && (item.statusItem === "terisi" || item.statusItem === "diverifikasi"),
      `Dokumen "${def.namaDokumen}" belum dilengkapi.`,
    );
  }

  const updated = await context.tx.pendaftaranSempro.update({
    where: { id: sempro.id },
    data: {
      statusDraft: "diajukan",
      statusBerkas: "menunggu_verifikasi",
      tanggalSubmit: new Date(),
      updatedAt: new Date(),
    },
  });

  const managerIds = await managers(context.tx);
  await semproEvent(
    context,
    "SemproDiajukan",
    `pendaftaran_sempro:${sempro.id}`,
    { statusBerkas: sempro.statusBerkas },
    { statusBerkas: updated.statusBerkas },
    managerIds,
    `Pendaftaran seminar proposal mahasiswa ${context.actor.nama} menunggu verifikasi berkas.`,
    `/sempro/verifikasi`,
  );

  return updated;
}

export async function verifikasiChecklistItem(
  context: SemproContext,
  checklistItemId: bigint,
  status: "diverifikasi" | "ditolak",
  catatan?: string,
) {
  requireManager(context);
  const item = await context.tx.checklistDokumen.findUnique({
    where: { id: checklistItemId },
    include: {
      sempro: {
        include: {
          pengajuan: { include: { mahasiswa: true } },
          checklist: true,
        },
      },
    },
  });
  ensure(item && item.sempro, "Item checklist tidak ditemukan.");
  const sempro = item.sempro!;

  await context.tx.checklistDokumen.update({
    where: { id: item.id },
    data: {
      statusItem: status,
      catatanVerifikator: catatan ?? null,
      updatedAt: new Date(),
    },
  });

  // Re-fetch all items to calculate overall statusBerkas
  const allItems = await context.tx.checklistDokumen.findMany({
    where: { idSempro: sempro.id },
  });
  const reqItems = allItems.filter((i) => SUBMIT_REQUIRED_ITEMS.includes(i.nomorItem));

  let newStatusBerkas = "menunggu_verifikasi";
  const anyRejected = reqItems.some((i) => i.statusItem === "ditolak");
  const allVerified = reqItems.every((i) => i.statusItem === "diverifikasi");

  if (allVerified) {
    newStatusBerkas = "lengkap";
  } else if (anyRejected) {
    newStatusBerkas = "revisi_sebagian";
  }

  await context.tx.pendaftaranSempro.update({
    where: { id: sempro.id },
    data: {
      statusBerkas: newStatusBerkas,
      catatanVerifikasi: anyRejected ? "Terdapat berkas yang perlu direvisi." : null,
      updatedAt: new Date(),
    },
  });

  await semproEvent(
    context,
    "VerifikasiBerkasSempro",
    `checklist_dokumen:${item.id}`,
    { itemStatus: item.statusItem, statusBerkas: sempro.statusBerkas },
    { itemStatus: status, statusBerkas: newStatusBerkas },
    [sempro.pengajuan.idMahasiswa],
    `Item berkas "${item.namaDokumen}" ${status === "diverifikasi" ? "telah disetujui" : "ditolak dengan catatan: " + (catatan ?? "-")}.`,
    `/sempro/status`,
  );

  return { itemStatus: status, statusBerkas: newStatusBerkas };
}
