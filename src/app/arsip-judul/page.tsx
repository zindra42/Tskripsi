import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace-shell";
import { database } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { pageNumber } from "@/lib/accounts/views";

export const dynamic = "force-dynamic";
export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; mode?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const query = (params.q ?? "").slice(0, 255);
  const current = params.mode === "pengajuan";
  const rows = current ? await database().pengajuanJudul.findMany({ where: { statusDraft: "diajukan", deletedAt: null,
    judul: { contains: query, mode: "insensitive" } }, select: { id: true, judul: true, mahasiswa: { select: { nama: true } }, periodeAkademikSaatPengajuan: true }, orderBy: { id: "desc" }, skip: (page - 1) * 20, take: 21 })
    : await database().arsipJudulSkripsi.findMany({ where: { judul: { contains: query, mode: "insensitive" } }, orderBy: { id: "desc" }, skip: (page - 1) * 20, take: 21 });
  return <WorkspaceShell session={session}><h1 className="mb-5 text-3xl font-bold">Arsip judul terdahulu</h1>
    <form className="panel mb-6 grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]"><label>Cari judul<input name="q" defaultValue={query} maxLength={255} /></label><label>Sumber<select name="mode" defaultValue={current ? "pengajuan" : "alumni"}><option value="alumni">Arsip alumni dan corpus kemiripan</option><option value="pengajuan">Judul mahasiswa yang telah diajukan</option></select></label><button className="button">Cari</button></form>
    <section className="space-y-4">{rows.slice(0, 20).map((row) => <article key={String(row.id)} className="panel"><h2 className="font-semibold">{row.judul}</h2><p className="mt-2 text-sm text-slate-600">{"namaPenulis" in row ? `${row.namaPenulis} · ${row.nim ?? ""} · ${row.tahun} · ${row.prodi ?? ""}` : `${row.mahasiswa.nama} · ${row.periodeAkademikSaatPengajuan ?? ""}`}</p></article>)}{!rows.length && <p className="panel">Belum ada judul dalam sumber ini. Corpus historis diisi melalui impor yang disetujui.</p>}</section>
    <nav aria-label="Halaman arsip judul" className="mt-5 flex gap-4">{page > 1 && <Link href={`?page=${page - 1}&q=${encodeURIComponent(query)}&mode=${params.mode ?? "alumni"}`}>Sebelumnya</Link>}{rows.length > 20 && <Link href={`?page=${page + 1}&q=${encodeURIComponent(query)}&mode=${params.mode ?? "alumni"}`}>Berikutnya</Link>}</nav>
  </WorkspaceShell>;
}
