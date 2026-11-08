import { safeRelative } from "./files";

export type LegacyRequest = { type: "redirect"; destination: string } | { type: "storage"; path: string }
  | { type: "sempro-document"; category: string; id: string } | { type: "sidang-document"; kind: string; id: string; scorer?: string }
  | { type: "photo"; id: string } | { type: "sempro-upload"; kind: string; id: string };
const pageAliases: Record<string, string> = {
  "/daftar-judul": "/judul", "/arsip-judul-terdahulu": "/arsip-judul", "/arsip-judul-terdahulu-mhs": "/arsip-judul",
  "/pengajuan/verifikasi-administrasi": "/administrasi", "/pengajuan/ajukan-judul": "/judul", "/pengajuan/cek-plagiasi": "/judul", "/cek-plagiasi": "/judul",
  "/bimbingan-saya": "/bimbingan", "/dosen/bimbingan": "/bimbingan", "/dosen/perubahan-judul": "/bimbingan", "/dosen/jadwal": "/bimbingan",
  "/sempro/jadwal-peserta": "/sempro/kehadiran", "/dosen/sempro/jadwal": "/sempro/jadwal", "/dosen/sempro/konfirmasi-jadwal": "/sempro/konfirmasi-jadwal",
  "/dosen/sempro-penguji": "/sempro/hasil", "/dosen/sempro/revisi": "/sempro/revisi",
  "/sidang/pendaftaran": "/sidang", "/sidang/pembayaran": "/sidang", "/sidang/jadwal": "/sidang", "/sidang/status": "/sidang",
  "/kaprodi/pengaturan-sistem": "/pengaturan", "/kaprodi/log-aktivitas": "/audit",
  "/admin-keuangan/verifikasi-pembayaran": "/administrasi", "/admin-keuangan/verifikasi-pembayaran-akhir": "/administrasi",
};
for (const role of ["kaprodi", "sekpro"]) {
  pageAliases[`/${role}/dashboard`] = `/dashboard/${role}`;
  for (const path of ["persetujuan-akun", "kelola-akun"]) pageAliases[`/${role}/${path}`] = "/akun";
  for (const path of ["review-judul", "penetapan-pembimbing"]) pageAliases[`/${role}/${path}`] = "/judul";
  pageAliases[`/${role}/monitoring-bimbingan`] = "/bimbingan";
  for (const path of ["verifikasi-berkas", "verifikasi"]) pageAliases[`/${role}/sempro/${path}`] = "/sempro/verifikasi";
  pageAliases[`/${role}/sempro/jadwal`] = "/sempro/jadwal";
  pageAliases[`/${role}/sempro/hasil`] = "/sempro/hasil";
}
for (const role of ["kaprodi", "sekpro", "dosen"]) for (const path of ["jadwal", "konfirmasi-jadwal", "penilaian", "penjadwalan", "verifikasi-berkas", "verifikasi", "revisi", "hasil"])
  pageAliases[`/${role}/sidang/${path}`] = "/sidang";

export function compatiblePage(pathname: string) {
  return /^\/(?:dashboard(?:\/(?:mahasiswa|dosen|kaprodi|sekpro|admin_keuangan|superadmin))?|login|register|lupa-password|ganti-password|menunggu-persetujuan|profil|akun(?:\/permohonan)?|pengaturan|administrasi|judul(?:\/[1-9]\d{0,18})?|bimbingan(?:\/[1-9]\d{0,18})?|arsip-judul|sidang(?:\/[1-9]\d{0,18})?|sempro\/(?:pendaftaran|status|jadwal|verifikasi|hasil|revisi|kehadiran|konfirmasi-jadwal)|pengumuman(?:\/kelola)?|pengumuman-publik|notifikasi|audit|koreksi-proses|verifikasi\/[A-Za-z0-9_-]{16,64})$/.test(pathname);
}
export function legacyRequest(pathname: string): LegacyRequest | null {
  if (/[\\\x00-\x1f%]/.test(pathname)) return null;
  const match = (re: RegExp) => re.exec(pathname);
  let m: RegExpExecArray | null;
  const id = "([1-9]\\d{0,18})";
  if (pageAliases[pathname]) return { type: "redirect", destination: pageAliases[pathname] };
  if ((m = match(new RegExp(`^/bimbingan/${id}/logbook$`)))) return { type: "redirect", destination: `/bimbingan/${m[1]}` };
  if ((m = match(new RegExp(`^/proposal/download/${id}$`)))) return { type: "redirect", destination: `/berkas/proposal/${m[1]}/proposal` };
  if ((m = match(new RegExp(`^/sempro/checklist/file/${id}$`)))) return { type: "redirect", destination: `/api/sempro/file/${m[1]}` };
  if ((m = match(new RegExp(`^/(sempro|sidang)/revisi-draft/${id}$`)))) return { type: "redirect", destination: m[1] === "sidang" ? `/api/sidang/file/revisi/${m[2]}` : `/sempro/revisi-draft/${m[2]}` };
  if ((m = match(new RegExp(`^/sidang/checklist/file/${id}$`)))) return { type: "redirect", destination: `/api/sidang/file/checklist/${m[1]}` };
  if ((m = match(new RegExp(`^/sempro/kehadiran/foto/${id}$`)))) return { type: "photo", id: m[1] };
  if ((m = match(new RegExp(`^/sempro/download-document/(bukti-kehadiran|berita-acara)/${id}$`)))) return { type: "sempro-upload", kind: m[1], id: m[2] };
  if ((m = match(new RegExp(`^/sempro/dokumen-terbit/download/([^/]+)/${id}$`)))) {
    const name = m[1].toLowerCase();
    const category = ({ acc: "a", "surat-acc": "a", undangan: "b", "surat-undangan": "b", penilaian: "c", "form-penilaian": "c", nilai: "c", "berita-acara": "d", ba: "d" } as Record<string, string>)[name] ?? name;
    return ["a", "b", "c", "d"].includes(category) ? { type: "sempro-document", category, id: m[2] } : null;
  }
  if ((m = match(new RegExp(`^/sidang/dokumen-terbit/${id}$`)))) return { type: "sidang-document", kind: "acc_sidang", id: m[1] };
  if ((m = match(new RegExp(`^/sidang/dokumen/(undangan|berita-acara|rekap)/${id}$`)))) return { type: "sidang-document", kind: ({ undangan: "undangan_sidang", "berita-acara": "berita_acara_sidang", rekap: "rekap_nilai_sidang" })[m[1]]!, id: m[2] };
  if ((m = match(new RegExp(`^/sidang/dokumen/form-penilaian/${id}/${id}$`)))) return { type: "sidang-document", kind: "form_nilai_sidang", id: m[1], scorer: m[2] };
  if (pathname.startsWith("/storage/")) { try { return { type: "storage", path: safeRelative(pathname.slice(9)) }; } catch { return null; } }
  return null;
}
