import Link from "next/link";
import { pageLinks, titleListUrl, type TitleFilters, type titlePage } from "@/lib/academic/title-list-params";

export function TitleListFilters({ filters, source = false }: { filters: TitleFilters; source?: boolean }) {
  const hasActiveFilters = Boolean(filters.q || filters.angkatan || filters.sort !== "latest" || (source && filters.mode !== "alumni"));

  return (
    <form className="mb-4 rounded-xl border border-slate-200/90 bg-white p-2 shadow-2xs">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search input with search icon */}
        <div className="relative min-w-[200px] flex-1">
          <label htmlFor="filter-q" className="sr-only">Cari judul, penulis, atau NIM</label>
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            id="filter-q"
            name="q"
            defaultValue={filters.q}
            maxLength={255}
            placeholder="Cari judul, penulis, atau NIM..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-amber-500 focus:outline-hidden"
          />
        </div>

        {/* Sumber dropdown (if source = true) */}
        {source ? (
          <div className="relative min-w-[130px]">
            <label htmlFor="filter-mode" className="sr-only">Sumber</label>
            <select
              id="filter-mode"
              name="mode"
              defaultValue={filters.mode}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-1.5 px-2.5 text-xs font-medium text-slate-700 focus:bg-white focus:border-amber-500 focus:outline-hidden"
              title="Sumber arsip"
            >
              <option value="alumni">Arsip alumni dan corpus kemiripan</option>
              <option value="pengajuan">Judul mahasiswa yang telah diajukan</option>
            </select>
          </div>
        ) : (
          <input type="hidden" name="mode" value="pengajuan" />
        )}

        {/* Angkatan input */}
        <div className="relative w-28">
          <label htmlFor="filter-angkatan" className="sr-only">Angkatan dari NIM</label>
          <input
            id="filter-angkatan"
            name="angkatan"
            type="number"
            min={1900}
            max={2099}
            placeholder="Angkatan"
            defaultValue={filters.angkatan}
            className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-1.5 px-2.5 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-amber-500 focus:outline-hidden"
            title="Filter angkatan dari NIM"
          />
        </div>

        {/* Urutan (Sort) dropdown */}
        <div className="relative">
          <label htmlFor="filter-sort" className="sr-only">Urutan</label>
          <select
            id="filter-sort"
            name="sort"
            defaultValue={filters.sort}
            className="rounded-lg border border-slate-200 bg-slate-50/70 py-1.5 px-2.5 text-xs font-medium text-slate-700 focus:bg-white focus:border-amber-500 focus:outline-hidden"
            title="Urutan data"
          >
            <option value="latest">Terbaru</option>
            <option value="nim-asc">NIM naik</option>
            <option value="nim-desc">NIM turun</option>
          </select>
        </div>

        {/* Baris per halaman (PerPage) */}
        <div className="relative">
          <label htmlFor="filter-perpage" className="sr-only">Baris per halaman</label>
          <select
            id="filter-perpage"
            name="perPage"
            defaultValue={filters.perPage}
            className="rounded-lg border border-slate-200 bg-slate-50/70 py-1.5 px-2 text-xs font-medium text-slate-700 focus:bg-white focus:border-amber-500 focus:outline-hidden"
            title="Jumlah baris per halaman"
          >
            <option value="20">20 / hal</option>
            <option value="50">50 / hal</option>
            <option value="100">100 / hal</option>
          </select>
        </div>

        {/* Submit button with icon */}
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#14213d] px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#25395e] transition-all"
          title="Terapkan filter"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span>Filter</span>
        </button>

        {/* Reset filter link if active */}
        {hasActiveFilters && (
          <Link
            href={source ? "/arsip-judul" : "/judul"}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/60 px-2 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100/70 transition-all"
            title="Reset filter"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="sr-only sm:not-sr-only">Reset</span>
          </Link>
        )}

        {/* Info tooltip icon */}
        <div
          className="relative inline-flex items-center p-1.5 text-slate-400 hover:text-slate-600 cursor-help"
          title="Angkatan berasal dari NIM numerik dengan awalan dua atau empat digit. NIM kosong atau ambigu tidak masuk filter angkatan. NIM diurutkan sebagai teks, dengan NIM kosong di akhir."
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth="2" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 16v-4m0-4h.01" />
          </svg>
        </div>
      </div>
    </form>
  );
}

export function TitlePagination({ filters, pagination }: { filters: TitleFilters; pagination: ReturnType<typeof titlePage> }) {
  const { total, page, pages } = pagination;
  const href = (value: number) => titleListUrl("", filters, { page: value });
  return (
    <nav aria-label="Navigasi halaman judul" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white p-3 text-xs text-slate-600 shadow-2xs">
      <p className="font-medium text-slate-700">{total} baris · Halaman {page} dari {pages}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {page > 1 && <>
          <Link href={href(1)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium hover:bg-slate-50 transition">Pertama</Link>
          <Link href={href(page - 1)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium hover:bg-slate-50 transition">Sebelumnya</Link>
        </>}
        {pageLinks(page, pages).map((item, index) => item === "ellipsis" ? <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-slate-400">…</span>
          : <Link key={item} href={href(item)} aria-current={item === page ? "page" : undefined} className={`rounded-lg px-2.5 py-1.5 font-medium transition ${item === page ? "bg-[#14213d] text-white" : "border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"}`}>{item}</Link>)}
        {page < pages && <>
          <Link href={href(page + 1)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 hover:bg-slate-50 transition">Berikutnya</Link>
          <Link href={href(pages)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 hover:bg-slate-50 transition">Terakhir</Link>
        </>}
      </div>
      <form className="flex items-center gap-2">
        {Object.entries(filters).filter(([key]) => key !== "page").map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
        <label htmlFor="jump-page" className="sr-only">Lompat ke halaman</label>
        <input id="jump-page" type="number" name="page" min={1} max={pages} defaultValue={page} required className="w-16 rounded-lg border border-slate-200 bg-slate-50/70 py-1 px-2 text-xs text-slate-900" />
        <button className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-white transition">Buka</button>
      </form>
    </nav>
  );
}

export function TitleDownloads({ filters, submissions = false }: { filters: TitleFilters; submissions?: boolean }) {
  const filtered = Boolean(filters.q || filters.angkatan);
  const url = titleListUrl("/api/arsip-judul/export", filters) + (submissions ? "&list=judul" : "");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={url}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 transition-all"
        download
        title={filtered ? "Unduh hasil filter (CSV)" : "Unduh semua judul (CSV)"}
      >
        {filtered ? "Unduh hasil filter (CSV)" : "Unduh semua judul (CSV)"}
      </a>
      {(filtered || filters.mode === "pengajuan") && (
        <a className="text-xs text-slate-500 underline hover:text-slate-700" href="/api/arsip-judul/export?mode=alumni" download>
          Unduh seluruh arsip alumni (CSV)
        </a>
      )}
    </div>
  );
}
