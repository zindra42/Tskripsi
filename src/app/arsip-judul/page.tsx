import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace-shell";
import { ArchiveImportForm } from "@/components/archive-import-form";
import { TitleDownloads, TitleListFilters, TitlePagination } from "@/components/title-list-controls";
import { database } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { archiveListActor } from "@/lib/academic/archive-access";
import { titleListQuery, titleOwner } from "@/lib/academic/title-list";
import { titleFilters, titlePage, type TitleListParams } from "@/lib/academic/title-list-params";

export const dynamic = "force-dynamic";
export default async function ArchivePage({ searchParams }: { searchParams: Promise<TitleListParams> }) {
  const session = await requireSession();
  const { actor, manager, canExport } = await archiveListActor(session);
  const filters = titleFilters(await searchParams);
  const db = database();
  const query = await titleListQuery(db, filters, actor, manager);
  const current = filters.mode === "pengajuan";
  const total = current ? await db.pengajuanJudul.count({ where: query.titleWhere })
    : await db.arsipJudulSkripsi.count({ where: query.archiveWhere });
  const pagination = titlePage(total, filters);
  const rows = current ? await db.pengajuanJudul.findMany({ where: query.titleWhere,
    select: { id: true, judul: true, mahasiswa: titleOwner, periodeAkademikSaatPengajuan: true },
    orderBy: query.titleOrder, skip: pagination.skip, take: pagination.take })
    : await db.arsipJudulSkripsi.findMany({ where: query.archiveWhere, orderBy: query.archiveOrder, skip: pagination.skip, take: pagination.take });
  const isSuperadmin = actor.role === "superadmin";

  return <WorkspaceShell session={session}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-3xl font-bold">Arsip judul terdahulu</h1>
      {canExport && <TitleDownloads filters={filters} />}
    </div>
    {isSuperadmin && <ArchiveImportForm />}
    <TitleListFilters filters={filters} source />
    <section className="space-y-4">{rows.map((row) => <article key={String(row.id)} className="panel">
      <h2 className="font-semibold">{row.judul}</h2>
      {"namaPenulis" in row ? <>
        <p className="mt-2 text-sm text-slate-600">{row.namaPenulis || "Penulis belum diisi"} · NIM {row.nim || "belum diisi"} · Tahun judul/lulus {row.tahun || "belum diisi"} · {row.prodi || "Prodi belum diisi"}</p>
        {isSuperadmin && <Link className="mt-3 inline-block underline" href={`/arsip-judul/${row.id}/edit`}>Edit arsip judul</Link>}
      </> : <p className="mt-2 text-sm text-slate-600">{row.mahasiswa.nama} · NIM {row.mahasiswa.mahasiswa?.nim || "belum diisi"} · {row.periodeAkademikSaatPengajuan ?? "Periode belum diisi"}</p>}
    </article>)}{!rows.length && <p className="panel">Tidak ada judul yang sesuai sumber dan filter ini.</p>}</section>
    <TitlePagination filters={filters} pagination={pagination} />
  </WorkspaceShell>;
}
