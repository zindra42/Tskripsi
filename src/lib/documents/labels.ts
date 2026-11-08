export type JenisDokumenType =
  | "acc"
  | "acc_sidang"
  | "undangan"
  | "undangan_sidang"
  | "form_nilai"
  | "form_nilai_sidang"
  | "form_penilaian_sidang"
  | "rekap_nilai_sidang"
  | "berita_acara"
  | "berita_acara_sidang"
  | string;

export function getJenisDokumenLabel(jenis: JenisDokumenType): string {
  switch (jenis) {
    case "acc":
      return "Surat Keterangan ACC Seminar Proposal Tugas Akhir";
    case "acc_sidang":
      return "Surat Keterangan Persetujuan (ACC) Sidang Skripsi";
    case "undangan":
      return "Surat Undangan Seminar Proposal Tugas Akhir";
    case "undangan_sidang":
      return "Surat Undangan Sidang Skripsi";
    case "form_nilai":
      return "Form Penilaian Seminar Proposal Skripsi";
    case "form_nilai_sidang":
    case "form_penilaian_sidang":
      return "Form Penilaian Sidang Skripsi";
    case "rekap_nilai_sidang":
      return "Rekap Data Penilaian Sidang Skripsi";
    case "berita_acara":
      return "Berita Acara Seminar Proposal";
    case "berita_acara_sidang":
      return "Berita Acara Sidang Skripsi";
    default:
      return "Dokumen Akademik";
  }
}

export interface StatusInfo {
  label: string;
  deskripsi: string;
  badgeBg: string;
  iconBg: string;
  icon: string;
  color: "emerald" | "amber" | "slate" | "rose" | "gray";
}

export function getStatusInfo(status: string, jenisDokumen?: string): StatusInfo {
  const isFormNilai =
    jenisDokumen !== undefined &&
    ["form_nilai", "form_nilai_sidang", "form_penilaian_sidang"].includes(jenisDokumen);

  switch (status) {
    case "sah":
      return {
        label: isFormNilai ? "Nilai Telah Dikunci & Sah" : "Dokumen Sah & Terverifikasi",
        deskripsi: "Dokumen ini asli dan terdaftar resmi di basis data akademik SIAS UTS.",
        badgeBg: "bg-emerald-50 text-emerald-800 border-emerald-300",
        iconBg: "bg-emerald-100 text-emerald-700",
        icon: "✓",
        color: "emerald",
      };
    case "berlangsung":
      return {
        label: "Penilaian Sedang Berlangsung (Belum Dikunci)",
        deskripsi: "Penilaian sedang berlangsung dan belum dikunci oleh penilai/dewan penguji.",
        badgeBg: "bg-amber-50 text-amber-800 border-amber-300",
        iconBg: "bg-amber-100 text-amber-700",
        icon: "⏳",
        color: "amber",
      };
    case "digantikan":
      return {
        label: "Dokumen Telah Digantikan (Versi Baru Telah Terbit)",
        deskripsi: "Dokumen ini telah diperbarui atau digantikan oleh versi baru yang lebih mutakhir.",
        badgeBg: "bg-slate-100 text-slate-700 border-slate-300",
        iconBg: "bg-slate-200 text-slate-700",
        icon: "ℹ",
        color: "slate",
      };
    case "dicabut":
      return {
        label: "Dokumen Telah Dicabut",
        deskripsi: "Dokumen ini telah dicabut secara resmi dan tidak lagi berlaku.",
        badgeBg: "bg-rose-50 text-rose-800 border-rose-300",
        iconBg: "bg-rose-100 text-rose-700",
        icon: "!",
        color: "rose",
      };
    case "dibatalkan":
    case "tidak_berlaku":
      return {
        label: "Dibatalkan / Tidak Berlaku",
        deskripsi: "Dokumen ini telah dibatalkan dan tidak memiliki kekuatan hukum akademik.",
        badgeBg: "bg-rose-50 text-rose-800 border-rose-300",
        iconBg: "bg-rose-100 text-rose-700",
        icon: "✕",
        color: "rose",
      };
    default:
      return {
        label: `Status: ${status}`,
        deskripsi: "Status dokumen terdaftar di basis data SIAS UTS.",
        badgeBg: "bg-slate-100 text-slate-800 border-slate-300",
        iconBg: "bg-slate-200 text-slate-800",
        icon: "?",
        color: "gray",
      };
  }
}

export function formatWaktuTerbit(diterbitkanAt?: Date | string | null): string {
  if (!diterbitkanAt) return "-";
  try {
    const d = typeof diterbitkanAt === "string" ? new Date(diterbitkanAt) : diterbitkanAt;
    if (isNaN(d.getTime())) return "-";
    return (
      new Intl.DateTimeFormat("id-ID", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Asia/Makassar",
      }).format(d) + " WITA"
    );
  } catch {
    return "-";
  }
}
