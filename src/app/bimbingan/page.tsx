import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace-shell";
import { database } from "@/lib/db";
import { academicViewer, scopedTitles } from "@/lib/academic/views";
import { pageNumber } from "@/lib/accounts/views";

export const dynamic = "force-dynamic";
export default async function GuidancePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { session, actor, manager } = await academicViewer();
  const page = pageNumber((await searchParams).page);
  const rows = await database().bimbingan.findMany({ where: { pengajuan: { ...scopedTitles(actor.id, manager), deletedAt: null } },
    include: { pengajuan: { select: { judul: true, isDiarsipkan: true, mahasiswa: { select: { nama: true } } } }, pembimbing1: { select: { nama: true } }, pembimbing2: { select: { nama: true } } }, orderBy: { id: "desc" }, take: 21, skip: (page - 1) * 20 });
  return <WorkspaceShell session={session}><h1 className="mb-5 text-3xl font-bold">Bimbingan dan logbook</h1><section className="space-y-4">{rows.slice(0, 20).map((row) => <article key={String(row.id)} className="panel"><Link href={`/bimbingan/${row.id}`} className="text-lg font-semibold underline">{row.pengajuan.mahasiswa.nama}</Link><p className="mt-2">{row.pengajuan.judul}</p><p className="mt-2 text-sm text-slate-600">{row.pembimbing1?.nama ?? "Menunggu pembimbing utama"} · {row.pembimbing2?.nama ?? "Tanpa pembimbing kedua"} · Siklus {row.siklusKe} {row.pengajuan.isDiarsipkan && "· Arsip"}</p></article>)}{!rows.length && <p className="panel">Belum ada penetapan pembimbing pada daftar ini.</p>}</section>
    <nav className="mt-5 flex gap-4" aria-label="Halaman bimbingan">{page > 1 && <Link href={`?page=${page - 1}`}>Sebelumnya</Link>}{rows.length > 20 && <Link href={`?page=${page + 1}`}>Berikutnya</Link>}</nav>
  </WorkspaceShell>;
}
