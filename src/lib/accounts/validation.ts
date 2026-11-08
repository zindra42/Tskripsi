import { z } from "zod";
import { academicPeriod } from "./policy";

export const idSchema = z.string().regex(/^[1-9]\d{0,18}$/).refine((value) => BigInt(value) <= 9223372036854775807n).transform(BigInt);
export const reasonSchema = z.string().trim().min(10).max(1000);
export const newPasswordSchema = z.string().min(8).max(72).refine((value) => Buffer.byteLength(value, "utf8") <= 72);
export const emailSchema = z.string().trim().pipe(z.email().max(255)).transform((value) => value.toLowerCase());
export const identifierSchema = z.string().trim().min(5).max(20).regex(/^[A-Za-z0-9.-]+$/);
export const expertiseSchema = z.array(idSchema).min(2).max(3).refine((ids) => new Set(ids).size === ids.length);
export const registrationSchema = z.object({
  role: z.enum(["mahasiswa", "dosen", "admin_keuangan", "kaprodi", "sekpro"]),
  nama: z.string().trim().min(3).max(255),
  email: emailSchema,
  password: newPasswordSchema.optional(),
  confirmation: z.string().optional(),
  nim: identifierSchema.optional(),
  nidn: identifierSchema.optional(),
  prodi: z.string().trim().max(100).optional(),
  semester: z.coerce.number().int().min(1).max(14).optional(),
  noHp: z.string().regex(/^08\d{8,11}$/).optional(),
  bidang: z.array(z.string()).max(3).default([]),
  bidangLainnya: z.string().trim().min(3).max(255).optional(),
  isSekpro: z.boolean().default(false),
});

export const profileSchema = z.object({
  nama: z.string().trim().min(3).max(255).optional(),
  email: emailSchema.optional(),
  nim: identifierSchema.optional(),
  nidn: identifierSchema.optional(),
  prodi: z.string().trim().max(100).optional(),
  semester: z.coerce.number().int().min(1).max(14).optional(),
  noHp: z.string().regex(/^\d{9,15}$/).optional(),
  bidang: expertiseSchema.optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined));

export const settingDefinitions = {
  periode_akademik_mode: { label: "Mode periode akademik", default: "otomatis", options: ["otomatis", "manual"] },
  periode_akademik_jenis: { label: "Jenis periode manual", default: "ganjil", options: ["ganjil", "genap"] },
  periode_akademik_tahun_mulai: { label: "Tahun mulai periode manual", default: "2026", min: 2020, max: 2099 },
  periode_akademik_mulai: { label: "Awal periode akademik", default: "2026-08-01", date: true },
  periode_akademik_selesai: { label: "Akhir periode akademik", default: "2027-01-31", date: true },
  periode_pengajuan_judul_mulai: { label: "Awal pengajuan judul", default: "2026-08-29", date: true },
  periode_pengajuan_judul_selesai: { label: "Akhir pengajuan judul", default: "2026-09-30", date: true },
  kuota_bimbingan_default: { label: "Kuota bimbingan default", default: "10", min: 1, max: 50 },
  minimal_sesi_bimbingan_acc_sempro: { label: "Minimal sesi bimbingan sempro", default: "7", min: 1, max: 30 },
  minimal_sesi_bimbingan_skripsi: { label: "Minimal sesi bimbingan skripsi", default: "7", min: 1, max: 30 },
  minimal_hadir_seminar_lain: { label: "Minimal hadir seminar lain", default: "3", min: 2, max: 30 },
  minimal_peserta_sempro: { label: "Minimal peserta sempro", default: "7", min: 1, max: 50 },
  threshold_peringatan_plagiasi: { label: "Batas peringatan kemiripan (%)", default: "35", min: 1, max: 100 },
  tenggat_revisi_sempro_hari: { label: "Tenggat revisi sempro (hari)", default: "14", min: 1, max: 90 },
  tenggat_revisi_sidang_hari: { label: "Tenggat revisi sidang (hari)", default: "14", min: 1, max: 90 },
  metode_bobot_sidang: { label: "Metode rekap nilai sidang", default: "rekap_rata_rata", options: ["rekap_rata_rata", "proporsional_34_33_33"] },
  nilai_batas_lulus_sidang: { label: "Nilai minimal lulus sidang", default: "51", min: 0, max: 100 },
  sidang_min_hari_sebelum: { label: "Batas pengajuan perubahan sidang (hari)", default: "2", min: 0, max: 30 },
};

export function validateSettings(input: Record<string, unknown>) {
  const result: Record<string, string> = {};
  for (const [key, definition] of Object.entries(settingDefinitions)) {
    const value = z.string().parse(input[key]);
    if ("options" in definition) z.enum(definition.options).parse(value);
    else if ("date" in definition) z.iso.date().parse(value);
    else z.coerce.number().int().min(definition.min).max(definition.max).parse(value);
    result[key] = value;
  }
  if (result.periode_akademik_selesai <= result.periode_akademik_mulai
    || result.periode_pengajuan_judul_selesai <= result.periode_pengajuan_judul_mulai) {
    throw new Error("Tanggal akhir harus setelah tanggal awal.");
  }
  const period = academicPeriod(result);
  const year = period.tahunMulai;
  const leap = new Date(Date.UTC(year + 1, 2, 0)).getUTCDate();
  const naturalStart = period.jenis === "ganjil" ? `${year}-08-01` : `${year + 1}-02-01`;
  const naturalEnd = period.jenis === "ganjil" ? `${year + 1}-02-${leap}` : `${year + 1}-08-31`;
  const start = [naturalStart, result.periode_akademik_mulai].sort()[0];
  const end = [naturalEnd, result.periode_akademik_selesai].sort()[1];
  if (result.periode_pengajuan_judul_mulai < start || result.periode_pengajuan_judul_selesai > end) {
    throw new Error("Periode pengajuan judul harus berada dalam periode akademik aktif.");
  }
  return result;
}
