import Link from "next/link";
import { AnnouncementText } from "@/components/announcement-text";
import { requireSession } from "@/lib/auth/session";
import { database } from "@/lib/db";
import { canManage } from "@/lib/accounts/policy";
import { WorkspaceShell } from "@/components/workspace-shell";
import { SidangForm } from "@/components/sidang-form";
import { timestamp } from "@/lib/academic/views";
import { pageNumber } from "@/lib/accounts/views";

export const dynamic = "force-dynamic";
export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const page = pageNumber(params.page), q = (params.q ?? "").slice(0, 100), now = new Date();
  const rows = await database().pengumuman.findMany({ where: { deletedAt: null, status: "terbit", AND: [
    { OR: [{ tampilMulai: null }, { tampilMulai: { lte: now } }] }, { OR: [{ tampilSelesai: null }, { tampilSelesai: { gte: now } }] },
    { OR: [{ isPublik: true }, { targetPeran: { array_contains: [session.user.role] } }, ...(session.user.role === "sekpro" ? [{ targetPeran: { array_contains: ["sekprodi"] } }] : [])] },
    q ? { OR: [{ judul: { contains: q, mode: "insensitive" } }, { isi: { contains: q, mode: "insensitive" } }] } : {},
  ] }, include: { dibacaList: { where: { penggunaId: session.user.id } } }, orderBy: [{ disematkan: "desc" }, { terbitAt: "desc" }, { id: "desc" }], take: 21, skip: (page - 1) * 20 });
  return <WorkspaceShell session={session}><h1 className="mb-5 text-3xl font-bold">Pengumuman</h1>{canManage(session.user, session.activeRole) && <Link href="/pengumuman/kelola" className="mb-5 inline-block underline">Kelola pengumuman</Link>}<form className="panel mb-5 flex items-end gap-3"><label className="grow">Cari pengumuman<input name="q" defaultValue={q} maxLength={100} /></label><button className="button">Cari</button></form><section className="space-y-5">{rows.slice(0, 20).map((row) => <article key={String(row.id)} className="panel"><p className="text-sm text-slate-600">{row.kategori} {row.disematkan ? "· Disematkan" : ""} · {timestamp(row.terbitAt)} · {row.dibacaList.length ? "Dibaca" : "Baru"}</p><h2 className="my-3 text-xl font-semibold">{row.judul}</h2><AnnouncementText text={row.isi} />{row.lampiranPath && <a className="mb-4 block underline" href={`/api/pengumuman/${row.id}/lampiran`}>{row.lampiranNama ?? "Unduh lampiran"}</a>}{!row.dibacaList.length && <SidangForm command="announcement-read" values={{ id: String(row.id) }} label="Tandai dibaca" />}</article>)}{!rows.length && <p className="panel">Belum ada pengumuman yang tersedia untuk Anda.</p>}</section><nav aria-label="Halaman pengumuman" className="mt-5 flex gap-4">{page > 1 && <Link href={`?page=${page - 1}&q=${encodeURIComponent(q)}`}>Sebelumnya</Link>}{rows.length > 20 && <Link href={`?page=${page + 1}&q=${encodeURIComponent(q)}`}>Berikutnya</Link>}</nav></WorkspaceShell>;
}
