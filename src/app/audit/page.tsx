import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { database } from "@/lib/db";
import { pageNumber } from "@/lib/accounts/views";
import { timestamp } from "@/lib/academic/views";
import { WorkspaceShell } from "@/components/workspace-shell";
import { SidangForm } from "@/components/sidang-form";
import { reversibleAction } from "@/lib/support/audit-rollback";

export const dynamic = "force-dynamic";
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; jenis?: string }> }) {
  const session = await requireSession();
  if (session.user.role !== "superadmin") notFound();
  const params = await searchParams, page = pageNumber(params.page), q = (params.q ?? "").slice(0, 100);
  const superadmin = params.jenis === "superadmin";
  const rows = superadmin ? await database().logSuperAdmin.findMany({ where: q ? { aksi: { contains: q, mode: "insensitive" } } : {}, orderBy: { id: "desc" }, take: 21, skip: (page - 1) * 20 })
    : await database().logAktivitas.findMany({ where: q ? { OR: [{ aksi: { contains: q, mode: "insensitive" } }, { pengguna: { nama: { contains: q, mode: "insensitive" } } }, { entitasTerkait: { contains: q, mode: "insensitive" } }] } : {},
      include: { pengguna: { select: { nama: true, deletedAt: true } } }, orderBy: { id: "desc" }, take: 21, skip: (page - 1) * 20 });
  return <WorkspaceShell session={session}><h1 className="mb-5 text-3xl font-bold">Audit aktivitas</h1><form className="panel mb-5 flex flex-wrap items-end gap-4"><label className="grow">Cari aksi, pelaku atau entitas<input name="q" defaultValue={q} maxLength={100} /></label><label>Jenis log<select name="jenis" defaultValue={superadmin ? "superadmin" : "aktivitas"}><option value="aktivitas">Seluruh aktivitas</option><option value="superadmin">Koreksi superadmin</option></select></label><button className="button">Cari</button></form><section className="space-y-4">{rows.slice(0, 20).map((r) => <article key={String(r.id)} className="panel"><h2 className="font-semibold">{r.aksi}</h2><p className="my-2 text-sm">{timestamp(r.waktu)} · {"entitasTerkait" in r ? r.entitasTerkait : r.targetIdentifier}</p>
      {"pengguna" in r && <p className="mb-3 text-sm">{r.pengguna?.nama ?? "Pelaku historis"}{r.pengguna?.deletedAt && " · Akun Dihapus"} · {r.status}</p>}
      <details><summary className="cursor-pointer">Rincian audit</summary><pre className="mt-3 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify("detail" in r ? r.detail ?? r.data : { before: r.dataSebelum, after: r.dataSesudah, reason: r.alasan }, null, 2)}</pre></details>
      {"status" in r && r.status !== "dibatalkan" && reversibleAction(r.aksi) && <details className="mt-4"><summary>Batalkan aksi</summary><div className="pt-4"><SidangForm command="audit-rollback" values={{ logId: String(r.id) }} label="Batalkan aksi dan simpan audit"><label>ID pihak yang ditampilkan sebagai pembatal<input name="cancellerId" inputMode="numeric" pattern="[0-9]+" defaultValue={String(session.user.id)} required /></label><label>Alasan pembatalan<textarea name="reason" minLength={5} maxLength={1000} required /></label><label>Ketik BATALKAN<input name="confirmation" required /></label></SidangForm></div></details>}
    </article>)}{!rows.length && <p className="panel">Belum ada aktivitas.</p>}</section><nav aria-label="Halaman audit" className="mt-5 flex gap-4">{page > 1 && <Link href={`?page=${page - 1}&jenis=${params.jenis ?? "aktivitas"}&q=${encodeURIComponent(q)}`}>Sebelumnya</Link>}{rows.length > 20 && <Link href={`?page=${page + 1}&jenis=${params.jenis ?? "aktivitas"}&q=${encodeURIComponent(q)}`}>Berikutnya</Link>}</nav></WorkspaceShell>;
}
