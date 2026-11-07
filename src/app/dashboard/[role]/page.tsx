import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { isRole, roleLabels } from "@/lib/auth/policy";
import { requireArea } from "@/lib/auth/session";
import Link from "next/link";

export const dynamic = "force-dynamic";

const modules = [
  ["Seminar proposal", "Pendaftaran, kehadiran, penjadwalan, dan penilaian sempro."],
  ["Sidang dan revisi", "Pendaftaran sidang, penilaian, dan tindak lanjut revisi."],
  ["Persetujuan dan dokumen", "Persetujuan dua tingkat, dokumen PDF, dan verifikasi QR."],
  ["Pengumuman", "Informasi akademik dan pengumuman program studi."],
];

export default async function RoleDashboard({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (!isRole(role)) notFound();
  const session = await requireArea(role);
  return <WorkspaceShell session={session}>
    <p className="mb-2 text-sm text-slate-500">Area {roleLabels[role]}</p>
    <h1 className="mb-6 text-3xl font-bold">Dashboard {roleLabels[role]}</h1>
    <section className="panel mb-7 border-t-4! border-t-[#fca311]!">
      <h2 className="text-xl font-semibold">Selamat datang, {session.user.nama}</h2>
      <p className="mt-3 leading-relaxed text-slate-600">Akun Anda aktif. Fondasi akses SIAS telah tersedia, dan modul akademik akan ditambahkan secara bertahap.</p>
      {role === "admin_keuangan" && <p className="mt-3 text-sm text-slate-600">Akun keuangan lama dinonaktifkan melalui cleanup 5 November 2026. Akun yang diaktifkan pengelola dapat memverifikasi administrasi awal.</p>}
    </section>
    <h2 className="mb-4 text-lg font-semibold">Modul SIAS</h2>
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="panel p-5!"><h3 className="font-semibold">Judul dan bimbingan</h3><p className="my-3 text-sm text-slate-600">Administrasi, pengajuan, review, pembimbing, jadwal dan logbook.</p><Link href="/judul" className="font-semibold underline">Buka pengajuan judul</Link><Link href="/bimbingan" className="mt-3 block underline">Buka bimbingan</Link></section>
      {modules.map(([title, description]) => <section key={title} className="panel p-5!">
        <span className="mb-4 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Belum tersedia</span>
        <h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
      </section>)}
    </div>
  </WorkspaceShell>;
}
