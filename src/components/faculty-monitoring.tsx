import { facultyMonitoring } from "@/lib/organization/monitoring";
import { stageLabels, type Stage } from "@/lib/organization/metrics";
import type { AuthenticatedSession } from "@/lib/auth/session";
import { AccountError } from "@/lib/accounts/store";
import { z } from "zod";
import Link from "next/link";

export async function FacultyMonitoring({ session, filters = {} }: { session: AuthenticatedSession; filters?: { fakultasId?: string; programStudiId?: string } }) {
  let data;
  try { data = await facultyMonitoring(session, { fakultasId: filters.fakultasId || undefined, programStudiId: filters.programStudiId || undefined }); }
  catch (error) { if (error instanceof AccountError || error instanceof z.ZodError) return <div role="alert" className="panel"><p>{error instanceof AccountError ? error.message : "Filter fakultas/prodi tidak valid."}</p><Link className="mt-3 inline-block underline" href="/monitoring">Atur ulang filter</Link></div>; throw error; }
  if (data.unassigned) return <p className="panel">Fakultas belum ditetapkan atau tidak aktif. Hubungi superadmin untuk penempatan Dekan.</p>;
  return <div className="space-y-6">
    {session.user.role === "superadmin" && <form method="get" className="panel flex flex-wrap items-end gap-4"><label>Fakultas<select name="fakultasId" defaultValue={data.facultyId?.toString() ?? ""} required><option value="">Pilih fakultas</option>{data.faculties.map((f) => <option value={String(f.id)} key={String(f.id)}>{f.nama}</option>)}</select></label><button className="button">Pilih fakultas</button></form>}
    {data.facultyId && <form method="get" className="panel grid items-end gap-4 sm:grid-cols-2">
      {session.user.role === "superadmin" && <input type="hidden" name="fakultasId" value={String(data.facultyId)} />}
      <label>Program studi<select name="programStudiId" defaultValue={data.programId?.toString() ?? ""}><option value="">Semua prodi fakultas</option>{data.programs.map((p) => <option key={String(p.id)} value={String(p.id)}>{p.nama} ({p.jenjang}){p.aktif ? "" : " · Nonaktif"}</option>)}</select></label><button className="button">Tampilkan monitoring</button>
    </form>}
    {!data.facultyId && <p className="panel">Pilih fakultas untuk memuat ringkasan akademik.</p>}
    {data.facultyId && <h2 className="text-2xl font-semibold">{data.faculties.find((f) => f.id === data.facultyId)?.nama}</h2>}
    {data.facultyId && !data.rows.length && <p className="panel">Belum ada program studi pada cakupan ini.</p>}
    {data.rows.map((p) => <section className="panel space-y-5" key={String(p.id)}><h3 className="text-xl font-semibold">{p.nama} · {p.jenjang}{p.aktif ? "" : " · Prodi nonaktif"}</h3><p className="text-3xl font-bold">{p.students} <span className="text-base font-normal">mahasiswa aktif terpetakan</span></p>
      <dl className="grid gap-3 sm:grid-cols-3">{(Object.entries(stageLabels) as [Stage, string][]).map(([key, label]) => <div className="rounded-xl border border-slate-200 p-4 card-subtle-hover" key={key}><dt>{label}</dt><dd className="mt-2 text-2xl font-bold">{p.stages[key]}</dd></div>)}</dl>
      <p>Revisi sempro/sidang melewati tenggat: <strong>{p.late}</strong></p>
      <h4 className="font-semibold">Beban penugasan dosen prodi</h4><ul className="space-y-2">{p.lecturers.map((d) => <li className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3" key={String(d.id)}><span>{d.nama}</span><span>{d.assignments} penugasan pada cakupan pilihan · kuota {d.quota}</span></li>)}</ul>{!p.lecturers.length && <p className="text-sm text-slate-600">Belum ada dosen aktif terpetakan.</p>}
    </section>)}
    <details className="panel"><summary className="cursor-pointer font-semibold">Definisi dan batas metrik</summary><div className="mt-4 space-y-3 text-sm text-slate-600">
      <p>Populasi: akun mahasiswa aktif, tidak terhapus, dengan ID master prodi dalam fakultas yang dipilih. Profil belum terpetakan tidak dihitung; superadmin menautkannya melalui tata kelola. Prodi nonaktif tetap dapat dipantau untuk histori.</p>
      <p>Setiap mahasiswa dihitung sekali pada tahap terakhir dari pengajuan resmi terbaru yang tidak diarsipkan/dihapus/dibatalkan, dalam siklus yang sama. Belum mengajukan mencakup draft. Judul mencakup review dan revisi judul; Bimbingan dimulai dari pembimbing utama atau sempro dan revisi yang selesai; Sempro/Sidang dimulai dari pendaftaran resmi. Selesai berarti hasil sidang resmi lulus, atau lulus revisi yang telah selesai.</p>
      <p>Revisi terlambat menghitung berita acara resmi sempro/sidang pada siklus terkini, hasil lulus revisi yang belum selesai, dengan tanggal tenggat sebelum hari ini di WITA. Ini jumlah proses revisi, bukan jumlah mahasiswa.</p>
      <p>Beban dosen menghitung penugasan pembimbing 1/2 pada judul aktif milik mahasiswa dalam cakupan pilihan, sesuai aturan kuota aplikasi. Satu bimbingan dihitung satu kali per dosen. Ini bukan seluruh beban lintas fakultas atau ukuran kelulusan tepat waktu/risiko DO.</p>
    </div></details>
  </div>;
}
