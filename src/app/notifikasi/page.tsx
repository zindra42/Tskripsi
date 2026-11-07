import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace-shell";
import { AcademicForm } from "@/components/academic-forms";
import { requireSession } from "@/lib/auth/session";
import { database } from "@/lib/db";
import { timestamp } from "@/lib/academic/views";
import { pageNumber } from "@/lib/accounts/views";

export const dynamic = "force-dynamic";
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await requireSession();
  const page = pageNumber((await searchParams).page);
  const rows = await database().notification.findMany({ where: { notifiableId: session.user.id, notifiableType: "App\\Models\\Pengguna" }, orderBy: { createdAt: "desc" }, take: 21, skip: (page - 1) * 20 });
  return <WorkspaceShell session={session}><h1 className="mb-5 text-3xl font-bold">Notifikasi</h1><AcademicForm command="read-notifications" label="Tandai seluruhnya dibaca" /><section className="mt-5 space-y-4">{rows.slice(0, 20).map((row) => {
    let data: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(row.data);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
    } catch { /* Preserve unreadable legacy payloads in storage. */ }
    const url = typeof data.url === "string" && /^\/(?!\/)/.test(data.url) && !data.url.includes("\\") ? data.url : null;
    return <article className="panel" key={row.id}><h2 className="font-semibold">{String(data.title ?? "Pembaruan SIAS")}</h2><p className="my-3">{String(data.message ?? "")}</p><p className="text-sm text-slate-600">{timestamp(row.createdAt)} · {row.readAt ? "Dibaca" : "Baru"}</p>{url && <Link className="mt-3 inline-block underline" href={url}>Buka rincian</Link>}</article>;
  })}{!rows.length && <p className="panel">Belum ada notifikasi.</p>}</section><nav aria-label="Halaman notifikasi" className="mt-5 flex gap-4">{page > 1 && <Link href={`?page=${page - 1}`}>Sebelumnya</Link>}{rows.length > 20 && <Link href={`?page=${page + 1}`}>Berikutnya</Link>}</nav></WorkspaceShell>;
}
