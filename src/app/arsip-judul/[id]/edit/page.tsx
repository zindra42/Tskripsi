import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { ArchiveEditForm } from "@/components/archive-edit-form";
import { requireSession } from "@/lib/auth/session";
import { accountTransaction, checkedActor } from "@/lib/accounts/store";
import { routeId } from "@/lib/academic/views";
import { archiveFingerprint } from "@/lib/academic/archive-edit";

export const dynamic = "force-dynamic";
export default async function EditArchivePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const id = routeId((await params).id);
  const row = await accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session);
    if (actor.role !== "superadmin") notFound();
    return tx.arsipJudulSkripsi.findUnique({ where: { id } });
  });
  if (!row) notFound();
  const initial = { id: String(row.id), original: archiveFingerprint(row), judul: row.judul,
    namaPenulis: row.namaPenulis ?? "", nim: row.nim ?? "", tahun: row.tahun ?? "", prodi: row.prodi ?? "", reason: "" };
  return <WorkspaceShell session={session}>
    <Link href="/arsip-judul" className="underline">Kembali ke arsip judul</Link>
    <h1 className="my-5 text-3xl font-bold">Edit arsip judul impor</h1>
    <p className="mb-5">Kolom opsional dapat dikosongkan. Tahun judul/lulus terpisah dari angkatan NIM. Setiap perubahan dicatat beserta alasan dan kata kunci kemiripannya.</p>
    <ArchiveEditForm initial={initial} />
  </WorkspaceShell>;
}
