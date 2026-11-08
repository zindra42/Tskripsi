import "server-only";

export interface SemproChecklistItemDef {
  nomorItem: number;
  namaDokumen: string;
  deskripsi: string;
  jenisBentuk: "asli" | "fotokopi" | "cetak" | "centang" | "otomatis";
  verifikatorRole: "kaprodi" | "admin_keuangan";
  wajibSubmit: boolean;
}

export const SEMPRO_CHECKLIST_DEFINITIONS: Record<number, SemproChecklistItemDef> = {
  0: {
    nomorItem: 0,
    namaDokumen: "File Proposal Skripsi",
    deskripsi: "Dokumen naskah proposal skripsi mahasiswa yang telah disetujui untuk diseminarkan.",
    jenisBentuk: "asli",
    verifikatorRole: "kaprodi",
    wajibSubmit: true,
  },
  1: {
    nomorItem: 1,
    namaDokumen: "Surat ACC Sempro (Ditandatangani Dosen Pembimbing)",
    deskripsi: "Dokumen ini diambil dari dokumen yang telah diterbitkan oleh Dosen Pembimbing di bagian Logbook Bimbingan.",
    jenisBentuk: "otomatis",
    verifikatorRole: "kaprodi",
    wajibSubmit: true,
  },
  5: {
    nomorItem: 5,
    namaDokumen: "Bukti Hadir Seminar Mahasiswa Lain",
    deskripsi: "Minimal hadir seminar mahasiswa lain sebanyak 3 kali (atau sesuai ketentuan sistem) yang tercatat di sistem.",
    jenisBentuk: "otomatis",
    verifikatorRole: "kaprodi",
    wajibSubmit: false, // Non-blocking at submit; checked before scheduling/completion
  },
  6: {
    nomorItem: 6,
    namaDokumen: "Bukti Pendaftaran TA di SIAKAD",
    deskripsi: "Bukti cetak pendaftaran mata kuliah Tugas Akhir/Skripsi di sistem SIAKAD.",
    jenisBentuk: "cetak",
    verifikatorRole: "kaprodi",
    wajibSubmit: true,
  },
  7: {
    nomorItem: 7,
    namaDokumen: "Penggandaan Proposal 3 Rangkap",
    deskripsi: "Pernyataan mandiri bahwa draf proposal telah digandakan sebanyak 3 rangkap.",
    jenisBentuk: "centang",
    verifikatorRole: "kaprodi",
    wajibSubmit: true,
  },
  8: {
    nomorItem: 8,
    namaDokumen: "Bimbingan Minimal 7 Kali",
    deskripsi: "Syarat minimal 7 kali sesi bimbingan yang telah divalidasi dan disetujui Dosen Pembimbing.",
    jenisBentuk: "otomatis",
    verifikatorRole: "kaprodi",
    wajibSubmit: true,
  },
  9: {
    nomorItem: 9,
    namaDokumen: "Transkrip Nilai",
    deskripsi: "Salinan transkrip nilai akademik sementara mahasiswa.",
    jenisBentuk: "fotokopi",
    verifikatorRole: "kaprodi",
    wajibSubmit: true,
  },
  10: {
    nomorItem: 10,
    namaDokumen: "KRS Semester Berjalan",
    deskripsi: "Kartu Rencana Studi (KRS) pada semester berjalan yang memprogramkan skripsi.",
    jenisBentuk: "cetak",
    verifikatorRole: "kaprodi",
    wajibSubmit: true,
  },
  12: {
    nomorItem: 12,
    namaDokumen: "Berita Acara Seminar Proposal",
    deskripsi: "Dokumen berita acara dan lembar pengesahan hasil seminar proposal yang diterbitkan setelah kelulusan.",
    jenisBentuk: "otomatis",
    verifikatorRole: "kaprodi",
    wajibSubmit: false,
  },
};

export const PRA_SEMPRO_ITEMS = [0, 1, 5, 6, 7, 8, 9, 10, 12];
export const SUBMIT_REQUIRED_ITEMS = [0, 1, 6, 7, 8, 9, 10];

export {
  ROMAN_MONTHS,
  getBulanRomawi,
  formatNomorUrut,
  generateNomorSurat,
} from "@/lib/documents/numbering";

export function maskNim(nim?: string | null): string {
  if (!nim) return "-";
  if (nim.length <= 4) return nim;
  return nim.slice(0, 4) + "*".repeat(nim.length - 4);
}

export function hitungNilaiKomponen(
  presentasi: number,
  materi: number,
  metodologi: number,
  alatBantu: number,
  penampilan: number,
): number {
  const sum = presentasi + materi + metodologi + alatBantu + penampilan;
  return Math.round((sum / 5) * 100) / 100;
}

export function hitungNilaiAkhir(p1: number, p2: number, pembimbing: number): number {
  // Penguji 1: 34%, Penguji 2: 33%, Pembimbing: 33%
  const total = p1 * 0.34 + p2 * 0.33 + pembimbing * 0.33;
  return Math.round(total * 100) / 100;
}

export interface PredikatNilai {
  huruf: string;
  bobot: number;
  keterangan: string;
}

export function konversiPredikat(nilai: number): PredikatNilai {
  if (nilai >= 80) return { huruf: "A", bobot: 4.0, keterangan: "Sangat Baik" };
  if (nilai >= 75) return { huruf: "B+", bobot: 3.5, keterangan: "Baik Sekali" };
  if (nilai >= 70) return { huruf: "B", bobot: 3.0, keterangan: "Baik" };
  if (nilai >= 65) return { huruf: "C+", bobot: 2.5, keterangan: "Cukup Baik" };
  if (nilai >= 60) return { huruf: "C", bobot: 2.0, keterangan: "Cukup" };
  if (nilai >= 50) return { huruf: "D", bobot: 1.0, keterangan: "Kurang" };
  return { huruf: "E", bobot: 0.0, keterangan: "Sangat Kurang" };
}

export function isDisetujuiKaprodi(ba: {
  statusPersetujuan?: string | null;
  hasil?: string | null;
}): boolean {
  if (ba.statusPersetujuan === "disetujui_kaprodi") {
    return true;
  }
  // Backward compatibility: data lama sebelum Two-Tier Approval yang sudah memiliki hasil
  if (ba.hasil && ["lulus", "lulus_revisi", "tidak_lulus"].includes(ba.hasil)) {
    return true;
  }
  return false;
}

export function getTargetTierKehadiran(urutan: number, maxTarget = 3): number {
  if (urutan <= 3) return 0;
  if (urutan <= 7) return 1;
  if (urutan <= 11) return 2;
  return maxTarget;
}

export function parseWitaTime(datePart: string | Date, timeStr: string): Date {
  const d = typeof datePart === "string" ? new Date(datePart) : new Date(datePart);
  const [hours, minutes] = timeStr.split(":").map(Number);
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();
  // Create in WITA (+08:00)
  const utcDate = new Date(Date.UTC(year, month, day, hours - 8, minutes, 0));
  return utcDate;
}

export function isDalamJendelaKehadiran(
  tanggal: string | Date,
  waktuMulai: string,
  waktuSelesai: string,
  now = new Date(),
): boolean {
  const start = parseWitaTime(tanggal, waktuMulai);
  const end = parseWitaTime(tanggal, waktuSelesai);
  // Jendela: H - 5 menit sampai H + 10 menit
  const windowStart = new Date(start.getTime() - 5 * 60 * 1000);
  const windowEnd = new Date(end.getTime() + 10 * 60 * 1000);
  return now >= windowStart && now <= windowEnd;
}

export function checkTimeOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  // String comparison works for 'HH:MM' 24-hr format
  return startA < endB && endA > startB;
}

export function validateSlotRules(
  tanggalStr: string,
  waktuMulai: string,
  waktuSelesai: string,
): void {
  const dateObj = new Date(tanggalStr);
  const dayOfWeek = dateObj.getDay(); // 0 is Sunday, 6 is Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    throw new Error("Seminar proposal hanya dapat dijadwalkan pada hari kerja (Senin - Jumat).");
  }
  if (waktuMulai < "08:00" || waktuSelesai > "16:00" || waktuMulai >= waktuSelesai) {
    throw new Error("Waktu seminar proposal harus antara pukul 08:00 dan 16:00 WITA.");
  }
}
