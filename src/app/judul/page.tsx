import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace-shell";
import { AcademicForm, TitleEditor } from "@/components/academic-forms";
import { database } from "@/lib/db";
import { academicViewer, initialMatrix, scopedTitles, storedIds, timestamp, titleOptions } from "@/lib/academic/views";
import { pageNumber } from "@/lib/accounts/views";
import { settingsValues } from "@/lib/accounts/store";

export const dynamic = "force-dynamic";
export default async function TitlesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { session, actor, manager } = await academicViewer();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const query = (params.q ?? "").trim().slice(0, 255);
  const rows = await database().pengajuanJudul.findMany({ where: { ...scopedTitles(actor.id, manager), deletedAt: null,
    ...(query ? { judul: { contains: query, mode: "insensitive" } } : {}),
  }, include: { mahasiswa: { select: { nama: true } } }, orderBy: { id: "desc" }, take: 21, skip: (page - 1) * 20 });
  const options = actor.role === "mahasiswa" ? await titleOptions() : null;
  const draft = actor.role === "mahasiswa" ? await database().pengajuanJudul.findFirst({ where: { idMahasiswa: actor.id, deletedAt: null, isDiarsipkan: false, OR: [{ statusDraft: "draft" }, { status: "direvisi" }] }, orderBy: { id: "desc" } }) : null;
  const settings = await settingsValues(database());
  return <WorkspaceShell session={session}><div className="mb-5 flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-bold">Pengajuan judul</h1><Link className="underline" href="/arsip-judul">Arsip judul terdahulu</Link></div>
    <p className="mb-5 text-slate-600">Periode pengajuan {settings.periode_pengajuan_judul_mulai || "2026-08-29"} hingga {settings.periode_pengajuan_judul_selesai || "2026-10-31"}. Ambang peringatan kemiripan {settings.threshold_peringatan_plagiasi || "35"}%.</p>
    {options && <details className="panel mb-6" open={rows.length === 0}><summary className="cursor-pointer text-lg font-semibold">Draft dan pengajuan judul mahasiswa</summary><div className="mt-5"><TitleEditor fields={options.fields} lecturers={options.lecturers} preferences={storedIds(draft?.preferensiDosenIds)} initial={{ judul: draft?.judul ?? "", ...initialMatrix(draft?.matriksPenelitian) }} /></div></details>}
    <details className="panel mb-6"><summary className="cursor-pointer font-semibold">Cek kemiripan judul</summary><div className="mt-4"><AcademicForm command="similarity" label="Periksa kemiripan"><label>Judul untuk diperiksa<input name="judul" required minLength={3} maxLength={255} /></label></AcademicForm></div></details>
    <form className="panel mb-5 flex flex-wrap items-end gap-3"><label className="grow">Cari judul<input name="q" defaultValue={query} maxLength={255} /></label><button className="button">Cari</button></form>
    <section className="space-y-4">{rows.slice(0, 20).map((row) => <article className="panel" key={String(row.id)}><Link href={`/judul/${row.id}`} className="text-lg font-semibold underline">{row.judul}</Link>
      <p className="mt-2">{row.mahasiswa.nama} · {row.statusDraft === "draft" ? "Draft" : row.status} {row.isDiarsipkan && "· Arsip"}</p>
      <p className="text-sm text-slate-600">{row.periodeAkademikSaatPengajuan ?? "Snapshot periode legacy"} · Semester {row.semesterSaatPengajuan ?? "—"} · Siklus {row.siklusKe} · {timestamp(row.tanggalPengajuan)}</p>
      {row.catatanKaprodi && <p className="mt-3">{row.catatanKaprodi}</p>}</article>)}{!rows.length && <p className="panel">Belum ada pengajuan pada daftar ini.</p>}</section>
    <nav aria-label="Halaman pengajuan" className="mt-5 flex gap-5">{page > 1 && <Link href={`?page=${page - 1}&q=${encodeURIComponent(query)}`}>Sebelumnya</Link>}{rows.length > 20 && <Link href={`?page=${page + 1}&q=${encodeURIComponent(query)}`}>Berikutnya</Link>}</nav>
  </WorkspaceShell>;
}
