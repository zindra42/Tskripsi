import Link from "next/link";
import { LogoutForm, RoleForm } from "./auth-forms";
import { SessionActivity } from "./session-activity";
import type { AuthenticatedSession } from "@/lib/auth/session";
import { availableRoles, roleLabels } from "@/lib/auth/policy";
import { canManage } from "@/lib/accounts/policy";

export function WorkspaceShell({ session, children }: {
  session: AuthenticatedSession;
  children: React.ReactNode;
}) {
  const roles = availableRoles(session.user);
  const working = session.user.statusAkun === "aktif" && !session.user.wajibGantiPassword;
  return <div className="min-h-screen">
    <SessionActivity key={session.publicId} remember={session.remember} sessionId={session.publicId} />
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5 sm:px-10">
      <div><p className="text-2xl font-bold tracking-wide">SIAS<span className="text-[#bf7600]">.</span></p><p className="text-xs text-slate-500">Sistem Informasi Akademik Skripsi</p></div>
      <div className="flex items-center gap-5">
        <div className="text-right"><p className="font-semibold">{session.user.nama}</p><p className="text-sm text-slate-600">{roleLabels[session.activeRole]}</p></div>
        <LogoutForm />
      </div>
    </header>
    <div className="mx-auto grid max-w-7xl gap-7 p-5 sm:p-10 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-7">
        <nav aria-label="Navigasi utama" className="panel space-y-4 p-5!">
          <p className="text-xs font-semibold tracking-wider text-slate-500">AREA KERJA</p>
          {working ? <>
            <Link href={`/dashboard/${session.activeRole}`} className="block font-semibold hover:underline">Dashboard</Link>
            <Link href="/ganti-password" className="block text-sm text-slate-600 hover:underline">Ganti password</Link>
            <Link href="/profil" className="block text-sm text-slate-600 hover:underline">Profil saya</Link>
            {(session.user.role === "mahasiswa" || session.user.role === "admin_keuangan" || session.user.role === "superadmin") && <Link href="/administrasi" className="block text-sm text-slate-600 hover:underline">Administrasi skripsi</Link>}
            {session.user.role !== "dekan" && <><Link href="/judul" className="block text-sm text-slate-600 hover:underline">Pengajuan dan review judul</Link>
            <Link href="/arsip-judul" className="block text-sm text-slate-600 hover:underline">Arsip judul terdahulu</Link>
            <Link href="/bimbingan" className="block text-sm text-slate-600 hover:underline">Bimbingan dan logbook</Link>
            {session.user.dosen && ["dosen", "kaprodi", "sekpro"].includes(session.user.role) && <Link href="/sempro/revisi" className="block text-sm text-slate-600 hover:underline">Review revisi sempro</Link>}
            {session.user.role === "mahasiswa" && <>
              <Link href="/sempro/pendaftaran" className="block text-sm text-slate-600 hover:underline">Pendaftaran seminar proposal</Link>
              <Link href="/sempro/status" className="block text-sm text-slate-600 hover:underline">Status & revisi sempro</Link>
            </>}
            {["dosen", "kaprodi", "sekpro"].includes(session.activeRole) && (
              <Link href="/sempro/konfirmasi-jadwal" className="block text-sm text-slate-600 hover:underline">Konfirmasi & nilai sempro</Link>
            )}
            <Link href="/sempro/kehadiran" className="block text-sm text-slate-600 hover:underline">Kehadiran seminar proposal</Link>
            {canManage(session.user, session.activeRole) && <>
              <Link href="/sempro/verifikasi" className="block text-sm text-slate-600 hover:underline">Verifikasi berkas sempro</Link>
              <Link href="/sempro/jadwal" className="block text-sm text-slate-600 hover:underline">Jadwal sempro & penguji</Link>
              <Link href="/sempro/hasil" className="block text-sm text-slate-600 hover:underline">Hasil kelulusan sempro</Link>
            </>}
            </>}
            {["dekan", "superadmin"].includes(session.user.role) && <><Link href="/organisasi" className="block text-sm text-slate-600 hover:underline">Tata kelola fakultas / prodi</Link><Link href="/monitoring" className="block text-sm text-slate-600 hover:underline">Monitoring fakultas</Link></>}
            <Link href="/notifikasi" className="block text-sm text-slate-600 hover:underline">Notifikasi</Link>
            {(session.user.role === "mahasiswa" || session.user.role === "superadmin" || session.user.dosen && ["dosen", "kaprodi", "sekpro"].includes(session.user.role)) && <Link href="/sidang" className="block text-sm text-slate-600 hover:underline">Sidang dan revisi akhir</Link>}
            <Link href="/pengumuman" className="block text-sm text-slate-600 hover:underline">Pengumuman</Link>
            {session.user.role === "superadmin" && <><Link href="/koreksi-proses" className="block text-sm text-slate-600 hover:underline">Koreksi proses</Link><Link href="/audit" className="block text-sm text-slate-600 hover:underline">Audit aktivitas</Link></>}
            {canManage(session.user, session.activeRole) && <>
              <Link href="/akun" className="block text-sm text-slate-600 hover:underline">Kelola dan setujui akun</Link>
              <Link href="/akun/permohonan" className="block text-sm text-slate-600 hover:underline">Permohonan akun</Link>
            </>}
            {canManage(session.user, session.activeRole, "settings") && <Link href="/pengaturan" className="block text-sm text-slate-600 hover:underline">Pengaturan sistem</Link>}
          </> : <p className="text-sm text-slate-600">Lengkapi persyaratan akun untuk membuka dashboard.</p>}
        </nav>
        {working && roles.length > 1 && <section className="panel p-5!"><RoleForm roles={roles} activeRole={session.activeRole} /></section>}
        <p className="px-2 text-xs leading-relaxed text-slate-500">SIAS TypeScript<br />Akun dan administrasi dasar</p>
      </aside>
      <main id="konten" className="min-w-0">{children}</main>
    </div>
  </div>;
}
