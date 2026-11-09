"use client";

import { useActionState, useState, useEffect } from "react";
import { importArchiveTitlesAction } from "@/app/actions/academic";

export function ArchiveImportForm() {
  const [state, formAction, isPending] = useActionState(importArchiveTitlesAction, {});
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (state?.error || state?.success) {
      setIsOpen(true);
    }
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 transition-all"
        title="Impor arsip judul dari file CSV"
      >
        <svg className="h-3.5 w-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <span>Impor CSV</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-modal-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-[#bf7600]">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </div>
                <h2 id="import-modal-title" className="text-base font-bold text-slate-900">
                  Impor Arsip Judul (CSV)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                aria-label="Tutup form impor"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Unggah berkas CSV dengan header: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">judul,nama_penulis,tahun,nim,prodi</code>. Kata kunci kemiripan akan dihitung secara otomatis.
            </p>

            {state?.error && (
              <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700" role="alert">
                {state.error}
              </div>
            )}
            {state?.success && (
              <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700" role="status">
                {state.success}
              </div>
            )}

            <form action={formAction} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="csv-file-input" className="mb-1 block text-xs font-semibold text-slate-700">
                    Berkas CSV
                  </label>
                  <input
                    id="csv-file-input"
                    type="file"
                    name="file"
                    accept=".csv,text/csv"
                    required
                    disabled={isPending}
                    className="block w-full text-xs text-slate-700 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                  />
                </div>
                <div>
                  <label htmlFor="csv-mode-select" className="mb-1 block text-xs font-semibold text-slate-700">
                    Mode Impor
                  </label>
                  <select
                    id="csv-mode-select"
                    name="mode"
                    defaultValue="append"
                    disabled={isPending}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                  >
                    <option value="append">Tambahkan ke arsip (Append)</option>
                    <option value="replace">Ganti seluruh arsip (Replace)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                  disabled={isPending}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#14213d] px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#25395e] transition disabled:opacity-60"
                  disabled={isPending}
                >
                  {isPending ? "Mengimpor..." : "Unggah dan Impor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
