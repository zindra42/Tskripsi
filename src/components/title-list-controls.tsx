import Link from "next/link";
import { pageLinks, titleListUrl, type TitleFilters, type titlePage } from "@/lib/academic/title-list-params";

export function TitleListFilters({ filters, source = false }: { filters: TitleFilters; source?: boolean }) {
  return <form className="panel mb-6 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <label>Cari judul, penulis, atau NIM<input name="q" defaultValue={filters.q} maxLength={255} /></label>
    {source ? <label>Sumber<select name="mode" defaultValue={filters.mode}><option value="alumni">Arsip alumni dan corpus kemiripan</option><option value="pengajuan">Judul mahasiswa yang telah diajukan</option></select></label> : <input type="hidden" name="mode" value="pengajuan" />}
    <label>Angkatan dari NIM<input name="angkatan" type="number" min={1900} max={2099} placeholder="Semua angkatan" defaultValue={filters.angkatan} /></label>
    <label>Urutan<select name="sort" defaultValue={filters.sort}><option value="latest">Terbaru</option><option value="nim-asc">NIM naik</option><option value="nim-desc">NIM turun</option></select></label>
    <label>Baris per halaman<select name="perPage" defaultValue={filters.perPage}><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label>
    <button className="button">Terapkan filter</button>
    <p className="text-sm text-slate-600 sm:col-span-2 lg:col-span-3">Angkatan berasal dari NIM numerik dengan awalan dua atau empat digit. NIM kosong atau ambigu tidak masuk filter angkatan. NIM diurutkan sebagai teks, dengan NIM kosong di akhir.</p>
  </form>;
}

export function TitlePagination({ filters, pagination }: { filters: TitleFilters; pagination: ReturnType<typeof titlePage> }) {
  const { total, page, pages } = pagination;
  const href = (value: number) => titleListUrl("", filters, { page: value });
  return <nav aria-label="Navigasi halaman judul" className="mt-6 space-y-4">
    <p>{total} baris · Halaman {page} dari {pages}</p>
    <div className="flex flex-wrap items-center gap-3">
      {page > 1 && <><Link href={href(1)}>Pertama</Link><Link href={href(page - 1)}>Sebelumnya</Link></>}
      {pageLinks(page, pages).map((item, index) => item === "ellipsis" ? <span key={`gap-${index}`} aria-hidden="true">…</span>
        : <Link key={item} href={href(item)} aria-current={item === page ? "page" : undefined} className={item === page ? "font-bold underline" : "underline"}>{item}</Link>)}
      {page < pages && <><Link href={href(page + 1)}>Berikutnya</Link><Link href={href(pages)}>Terakhir</Link></>}
    </div>
    <form className="flex flex-wrap items-end gap-3">
      {Object.entries(filters).filter(([key]) => key !== "page").map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
      <label>Lompat ke halaman<input type="number" name="page" min={1} max={pages} defaultValue={page} required /></label>
      <button className="button">Buka halaman</button>
    </form>
  </nav>;
}

export function TitleDownloads({ filters, submissions = false }: { filters: TitleFilters; submissions?: boolean }) {
  const filtered = Boolean(filters.q || filters.angkatan);
  const url = titleListUrl("/api/arsip-judul/export", filters) + (submissions ? "&list=judul" : "");
  return <div className="flex flex-wrap items-center gap-3">
    <a href={url} className="button" download>{filtered ? "Unduh hasil filter (CSV)" : "Unduh semua judul (CSV)"}</a>
    {(filtered || filters.mode === "pengajuan") && <a className="underline" href="/api/arsip-judul/export?mode=alumni" download>Unduh seluruh arsip alumni (CSV)</a>}
  </div>;
}
