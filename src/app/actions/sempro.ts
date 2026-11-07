"use server";

import { revalidatePath } from "next/cache";
import { hasTrustedOrigin } from "@/lib/auth/origin";
import { requireSession } from "@/lib/auth/session";
import { AccountError } from "@/lib/accounts/store";
import { validateUpload } from "@/lib/academic/files";
import { semproMutation } from "@/lib/sempro/store";
import {
  getOrCreateSempro,
  uploadChecklistFile,
  centangMandiriChecklist,
  submitPendaftaranSempro,
  verifikasiChecklistItem,
} from "@/lib/sempro/registration";
import {
  tetapkanPenguji,
  aturJadwalSempro,
  konfirmasiJadwalDosen,
  tandaiTidakTerlaksana,
} from "@/lib/sempro/scheduling";
import {
  catatKehadiranMahasiswa,
  tambahKehadiranManual,
  tolakKehadiran,
  kunciKehadiranSempro,
  ajukanDispensasiKehadiran,
  putuskanDispensasiKehadiran,
} from "@/lib/sempro/attendance";
import {
  submitNilaiPenguji,
  submitNilaiPembimbing,
  simpanKeputusanPenguji1,
  tetapkanHasilSempro,
  unggahRevisiSempro,
  putuskanRevisiSempro,
} from "@/lib/sempro/scoring";

export type SemproFormState = { error?: string; success?: string; result?: unknown };

export async function semproAction(
  _state: SemproFormState,
  form: FormData,
): Promise<SemproFormState> {
  if (!(await hasTrustedOrigin())) {
    return { error: "Permintaan tidak dapat diverifikasi. Muat ulang halaman." };
  }

  const session = await requireSession();
  try {
    const command = String(form.get("command"));
    const key = String(form.get("key"));
    const input: Record<string, unknown> = {};
    for (const [k, v] of form) {
      if (typeof v === "string" && !["key", "command"].includes(k) && !k.startsWith("$ACTION_")) {
        input[k] = v;
      }
    }

    const uploadFile = await validateUpload(form.get("file"), command === "upload-checklist" && form.get("nomorItem") === "0");
    const uploads = { file: uploadFile };

    const result = await semproMutation(
      session,
      key,
      command,
      input,
      uploads,
      async (context) => {
        switch (command) {
          case "init-sempro":
            return await getOrCreateSempro(context);

          case "upload-checklist": {
            if (!uploadFile) throw new Error("File belum dipilih.");
            const pendaftaranId = BigInt(String(input.pendaftaranId));
            const nomorItem = Number(input.nomorItem);
            return await uploadChecklistFile(context, pendaftaranId, nomorItem, uploadFile);
          }

          case "centang-checklist": {
            const pendaftaranId = BigInt(String(input.pendaftaranId));
            const nomorItem = Number(input.nomorItem);
            const centang = input.centang === "true" || input.centang === "1";
            return await centangMandiriChecklist(context, pendaftaranId, nomorItem, centang);
          }

          case "submit-sempro": {
            const pendaftaranId = BigInt(String(input.pendaftaranId));
            return await submitPendaftaranSempro(context, pendaftaranId);
          }

          case "verifikasi-checklist": {
            const itemId = BigInt(String(input.checklistItemId));
            const status = String(input.status) as "diverifikasi" | "ditolak";
            const catatan = input.catatan ? String(input.catatan) : undefined;
            return await verifikasiChecklistItem(context, itemId, status, catatan);
          }

          case "tetapkan-penguji": {
            const pendaftaranId = BigInt(String(input.pendaftaranId));
            const penguji1Id = BigInt(String(input.penguji1Id));
            const penguji2Id = BigInt(String(input.penguji2Id));
            return await tetapkanPenguji(context, pendaftaranId, penguji1Id, penguji2Id);
          }

          case "atur-jadwal": {
            const pendaftaranId = BigInt(String(input.pendaftaranId));
            const tanggal = String(input.tanggal);
            const waktuMulai = String(input.waktuMulai);
            const waktuSelesai = String(input.waktuSelesai);
            const ruang = String(input.ruang);
            const alasanPerubahan = input.alasanPerubahan ? String(input.alasanPerubahan) : undefined;
            return await aturJadwalSempro(
              context,
              pendaftaranId,
              tanggal,
              waktuMulai,
              waktuSelesai,
              ruang,
              alasanPerubahan,
            );
          }

          case "konfirmasi-jadwal": {
            const jadwalId = BigInt(String(input.jadwalId));
            const status = String(input.status) as "bersedia" | "tidak_bersedia" | "permohonan_ubah_jadwal";
            const catatan = input.catatan ? String(input.catatan) : undefined;
            return await konfirmasiJadwalDosen(context, jadwalId, status, catatan);
          }

          case "tandai-tidak-terlaksana": {
            const jadwalId = BigInt(String(input.jadwalId));
            const alasan = input.alasan ? String(input.alasan) : undefined;
            return await tandaiTidakTerlaksana(context, jadwalId, alasan);
          }

          case "catat-kehadiran": {
            if (!uploadFile) throw new Error("Foto selfie bukti kehadiran belum dipilih.");
            const jadwalId = BigInt(String(input.jadwalId));
            return await catatKehadiranMahasiswa(context, jadwalId, uploadFile);
          }

          case "tambah-kehadiran-manual": {
            const jadwalId = BigInt(String(input.jadwalId));
            const mahasiswaId = BigInt(String(input.mahasiswaId));
            const catatan = input.catatan ? String(input.catatan) : undefined;
            return await tambahKehadiranManual(context, jadwalId, mahasiswaId, catatan);
          }

          case "tolak-kehadiran": {
            const kehadiranId = BigInt(String(input.kehadiranId));
            const alasan = String(input.alasan);
            return await tolakKehadiran(context, kehadiranId, alasan);
          }

          case "kunci-kehadiran": {
            const pendaftaranId = BigInt(String(input.pendaftaranId));
            return await kunciKehadiranSempro(context, pendaftaranId);
          }

          case "ajukan-dispensasi": {
            const pendaftaranId = BigInt(String(input.pendaftaranId));
            const alasan = String(input.alasan);
            return await ajukanDispensasiKehadiran(context, pendaftaranId, alasan);
          }

          case "putuskan-dispensasi": {
            const dispensasiId = BigInt(String(input.dispensasiId));
            const status = String(input.status) as "disetujui" | "ditolak";
            const catatan = input.catatan ? String(input.catatan) : undefined;
            return await putuskanDispensasiKehadiran(context, dispensasiId, status, catatan);
          }

          case "submit-nilai-penguji": {
            const jadwalId = BigInt(String(input.jadwalId));
            const presentasi = Number(input.presentasi);
            const materi = Number(input.materi);
            const metodologi = Number(input.metodologi);
            const alatBantu = Number(input.alatBantu);
            const penampilan = Number(input.penampilan);
            const catatan = input.catatan ? String(input.catatan) : undefined;
            return await submitNilaiPenguji(
              context,
              jadwalId,
              presentasi,
              materi,
              metodologi,
              alatBantu,
              penampilan,
              catatan,
            );
          }

          case "submit-nilai-pembimbing": {
            const jadwalId = BigInt(String(input.jadwalId));
            const presentasi = Number(input.presentasi);
            const alatBantu = Number(input.alatBantu);
            const penampilan = Number(input.penampilan);
            const materi = Number(input.materi);
            const kelayakanProposal = Number(input.kelayakanProposal);
            const catatan = input.catatan ? String(input.catatan) : undefined;
            return await submitNilaiPembimbing(
              context,
              jadwalId,
              presentasi,
              alatBantu,
              penampilan,
              materi,
              kelayakanProposal,
              catatan,
            );
          }

          case "simpan-keputusan-penguji1": {
            const jadwalId = BigInt(String(input.jadwalId));
            const keputusan = String(input.keputusan) as "lulus" | "lulus_revisi" | "tidak_lulus";
            const catatan = input.catatan ? String(input.catatan) : undefined;
            const tenggatRevisi = input.tenggatRevisi ? String(input.tenggatRevisi) : undefined;
            return await simpanKeputusanPenguji1(
              context,
              jadwalId,
              keputusan,
              catatan,
              tenggatRevisi,
            );
          }

          case "sahkan-hasil-sempro": {
            const jadwalId = BigInt(String(input.jadwalId));
            const hasil = String(input.hasil) as "lulus" | "lulus_revisi" | "tidak_lulus";
            const catatan = input.catatan ? String(input.catatan) : undefined;
            const tenggatRevisi = input.tenggatRevisi ? String(input.tenggatRevisi) : undefined;
            return await tetapkanHasilSempro(
              context,
              jadwalId,
              hasil,
              catatan,
              tenggatRevisi,
            );
          }

          case "unggah-revisi": {
            if (!uploadFile) throw new Error("File naskah revisi belum dipilih.");
            const baId = BigInt(String(input.beritaAcaraId));
            const catatan = input.catatan ? String(input.catatan) : undefined;
            return await unggahRevisiSempro(context, baId, uploadFile, catatan);
          }

          case "putuskan-revisi": {
            const revisiId = BigInt(String(input.revisiId));
            const status = String(input.status) as "disetujui" | "ditolak";
            const catatan = input.catatan ? String(input.catatan) : undefined;
            return await putuskanRevisiSempro(context, revisiId, status, catatan);
          }

          default:
            throw new Error(`Aksi tidak dikenali: ${command}`);
        }
      },
    );

    revalidatePath("/sempro/pendaftaran");
    revalidatePath("/sempro/status");
    revalidatePath("/sempro/verifikasi");
    revalidatePath("/sempro/jadwal");
    revalidatePath("/sempro/konfirmasi-jadwal");
    revalidatePath("/sempro/kehadiran");
    revalidatePath("/sempro/hasil");

    return { success: "Tindakan berhasil diproses.", result };
  } catch (error) {
    if (error instanceof AccountError || error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Terjadi kesalahan internal. Silakan coba lagi." };
  }
}
