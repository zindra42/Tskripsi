import Link from "next/link";
import type { AuthenticatedSession } from "@/lib/auth/session";
import { roleLabels } from "@/lib/auth/policy";
import { timestamp } from "@/lib/academic/views";
import { commonOverview, studentOverview, lecturerOverview, managementOverview, systemOverview, administrationOverview } from "@/lib/support/dashboard-overview";

export async function DashboardOverview({ session }: { session: AuthenticatedSession }) {
  const [common, student, lecturer, management, system, administration] = await Promise.all([
    commonOverview(session), studentOverview(session), lecturerOverview(session), managementOverview(session), systemOverview(session), administrationOverview(session),
  ]);
  return <div className="mt-6 space-y-6">
    <section className="panel"><h2 className="mb-3 text-xl font-semibold">Periode Akademik Aktif</h2><p>{common.period}</p></section>
    {administration && <section className="panel"><h2 className="mb-4 text-xl font-semibold">Antrean Verifikasi Administrasi Awal</h2><p>{administration.pending} menunggu verifikasi · {administration.verified} terverifikasi periode ini · {administration.rejected} ditolak periode ini</p><Link className="mt-4 inline-block underline" href="/administrasi">Verifikasi Pembayaran →</Link></section>}
    {student && <section className="panel"><h2 className="mb-4 text-xl font-semibold">Alur dan Tahapan Skripsi</h2>
      <ol className="grid gap-3 sm:grid-cols-2">{student.steps.map((s, i) => <li key={s.label} className="rounded-xl border border-slate-200 p-3 card-subtle-hover" aria-current={s.status === "aktif" ? "step" : undefined}>
        <span className="text-sm text-slate-500">Tahap {i + 1}: {s.status}</span><p><Link className="underline hover:text-sky-700" href={s.href}>{s.label}</Link></p>
      </li>)}</ol><h3 className="mt-5 font-semibold">Langkah Berikutnya</h3><Link className="mt-2 block underline hover:text-sky-700" href={student.href}>{student.next}</Link>
    </section>}
    {lecturer && <>
      <section className="panel"><h2 className="mb-4 text-xl font-semibold">Antrean Tindakan Dosen</h2><p className="mb-4">Kapasitas Kuota: {lecturer.total} / {lecturer.quota} Mahasiswa</p>
        <ul className="space-y-2"><li><Link className="underline" href="/bimbingan">Logbook Bimbingan: {lecturer.logs}</Link></li>
          <li><Link className="underline" href="/sempro/konfirmasi-jadwal">Konfirmasi Kehadiran Sempro: {lecturer.confirmations}</Link></li>
          <li><Link className="underline" href="/sempro/konfirmasi-jadwal">Penilaian Sempro: {lecturer.semproScores}</Link></li>
          <li><Link className="underline" href="/sempro/revisi">Revisi Sempro: {lecturer.revisions}</Link></li></ul>
        <h3 className="mb-3 mt-5 font-semibold">Mahasiswa Bimbingan Aktif</h3><ul className="space-y-3">{lecturer.students.map((b) => <li key={String(b.id)}><Link className="underline" href={`/bimbingan/${b.id}`}>{b.pengajuan.mahasiswa.nama}: {b.pengajuan.judul}</Link><p className="text-sm">{b.faseSkripsiAt ? "Skripsi" : "Proposal"}</p></li>)}</ul>
        {!lecturer.students.length && <p>Belum ada mahasiswa bimbingan aktif.</p>}
      </section>
      <section className="panel"><h2 className="mb-4 text-xl font-semibold">Jadwal Sempro Mendatang</h2><ul className="space-y-3">{lecturer.semproSchedules.map((j) => <li key={String(j.id)}><Link className="underline" href="/sempro/konfirmasi-jadwal">{j.sempro?.pengajuan.judul}</Link><p>{j.tanggal?.toISOString().slice(0, 10)} {j.waktuMulai} WITA · {j.ruang}</p></li>)}</ul>{!lecturer.semproSchedules.length && <p>Belum ada jadwal sempro mendatang.</p>}</section>
      <section className="panel"><h2 className="mb-4 text-xl font-semibold">Jadwal Sidang Mendatang</h2><ul className="space-y-3">{lecturer.schedules.map((j) => <li key={String(j.id)}><Link className="underline" href={`/sidang/${j.idSidang}`}>{j.sidang.pengajuan.judul}</Link><p>{j.tanggal?.toISOString().slice(0, 10)} {j.waktuMulai} WITA · {j.ruang}</p></li>)}</ul>{!lecturer.schedules.length && <p>Belum ada jadwal mendatang.</p>}</section>
    </>}
    {management && <>
      <section className="panel"><h2 className="mb-4 text-xl font-semibold">Funnel Alur Progres Skripsi Departemen</h2><ul className="grid gap-3 sm:grid-cols-2">{management.funnel.map((f) => <li key={f.label}>{f.label}: <strong>{f.count}</strong></li>)}</ul></section>
      <section className="panel"><h2 className="mb-4 text-xl font-semibold">Mahasiswa Masa Studi Kritis (Semester ≥ 13)</h2><ul className="space-y-2">{management.critical.map((m) => <li key={String(m.id)}><Link className="underline" href={`/akun/${m.id}`}>{m.nama}</Link> · Semester {m.mahasiswa?.semester}</li>)}</ul>{!management.critical.length && <p>Tidak ada mahasiswa pada kategori ini.</p>}</section>
      <section className="panel"><h2 className="mb-4 text-xl font-semibold">Monitoring Kuota Bimbingan</h2><ul className="space-y-2">{management.lecturers.map((l) => <li key={String(l.id)}>{l.nama}: {l._count.primarySupervisions + l._count.secondarySupervisions} / {l.dosen?.kuotaBimbingan ?? 10}</li>)}</ul></section>
    </>}
    {system && <>
      <section className="panel"><h2 className="mb-4 text-xl font-semibold">Kesehatan Sistem</h2><p>Heartbeat scheduler: {system.healthy ? "Aktif dalam 24 jam terakhir" : "Belum ada heartbeat terkini"}</p><p>{timestamp(system.heartbeat)}</p>
        <p className="mt-3">Private Storage: {(system.storage.bytes / 1048576).toFixed(2)} MB · {system.storage.files} berkas{!system.storage.available && " (pemindaian belum lengkap atau direktori belum tersedia)"}</p>
        <ul className="mt-4 space-y-2">{system.users.map((u) => <li key={u.role}>{roleLabels[u.role]}: {u.active} aktif · {u.pending} menunggu · {u.inactive} nonaktif</li>)}</ul>
      </section>
      <section className="panel"><h2 className="mb-4 text-xl font-semibold">Log Aktivitas Terbaru</h2><ul className="space-y-2">{system.logs.map((l) => <li key={String(l.id)}>{timestamp(l.waktu)} · {l.aksi}</li>)}</ul><Link className="mt-4 inline-block underline" href="/audit">Buka audit lengkap</Link></section>
    </>}
    <section className="panel"><h2 className="mb-4 text-xl font-semibold">Pengumuman Terbaru</h2><ul className="space-y-2">{common.announcements.map((a) => <li key={String(a.id)}><Link className="underline" href="/pengumuman">{a.judul}</Link></li>)}</ul>{!common.announcements.length && <p>Belum ada pengumuman untuk Anda.</p>}<Link className="mt-4 inline-block underline" href="/pengumuman">Buka pengumuman akademik</Link></section>
  </div>;
}
