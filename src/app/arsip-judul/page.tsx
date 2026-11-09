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
    {/* Baris 1: Header judul & Action buttons */}
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Arsip judul terdahulu</h1>
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
          {total.toLocaleString()} judul
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canExport && <TitleDownloads filters={filters} />}
        {isSuperadmin && <ArchiveImportForm />}
      </div>
    </div>

    {/* Baris 2: Search & Filter bar ringkas */}
    <TitleListFilters filters={filters} source />

    {/* Fokus ke list judul */}
    <section className="space-y-2.5">
      {rows.map((row) => (
        <article
          key={String(row.id)}
          className="group rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs transition-all duration-150 hover:border-slate-300 hover:shadow-xs"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-base font-semibold leading-snug text-slate-900 group-hover:text-[#14213d]">
                {row.judul}
              </h2>
              {"namaPenulis" in row ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{row.namaPenulis || "Penulis belum diisi"}</span>
                  <span>·</span>
                  <span>NIM {row.nim || "belum diisi"}</span>
                  <span>·</span>
                  <span>Tahun {row.tahun || "belum diisi"}</span>
                  <span>·</span>
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                    {row.prodi || "Prodi belum diisi"}
                  </span>
                </div>
              ) : (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{row.mahasiswa.nama}</span>
                  <span>·</span>
                  <span>NIM {row.mahasiswa.mahasiswa?.nim || "belum diisi"}</span>
                  <span>·</span>
                  <span>{row.periodeAkademikSaatPengajuan ?? "Periode belum diisi"}</span>
                </div>
              )}
            </div>
            {"namaPenulis" in row && isSuperadmin && (
              <Link
                href={`/arsip-judul/${row.id}/edit`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white hover:text-slate-900 hover:shadow-2xs"
                title="Edit arsip judul"
              >
                <svg className="h-3.5 w-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                <span>Edit arsip judul</span>
              </Link>
            )}
          </div>
        </article>
      ))}
      {!rows.length && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Tidak ada judul yang sesuai sumber dan filter ini.
        </div>
      )}
    </section>
    <TitlePagination filters={filters} pagination={pagination} />
  </WorkspaceShell>;
}
