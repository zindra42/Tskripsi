import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { isRole, roleLabels } from "@/lib/auth/policy";
import { requireArea } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const modules = [
  ["Judul dan bimbingan", "Pengajuan judul, penetapan pembimbing, dan catatan bimbingan."],
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
      {role === "admin_keuangan" && <p className="mt-3 text-sm text-slate-600">Peran keuangan telah dipensiunkan pada sistem sumber. Hubungi pengelola untuk penyesuaian akun historis.</p>}
    </section>
    <h2 className="mb-4 text-lg font-semibold">Modul SIAS</h2>
    <div className="grid gap-4 sm:grid-cols-2">
      {modules.map(([title, description]) => <section key={title} className="panel p-5!">
        <span className="mb-4 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Belum tersedia</span>
        <h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
      </section>)}
    </div>
  </WorkspaceShell>;
}
