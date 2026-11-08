"use client";

import { useActionState } from "react";
import { importArchiveTitlesAction } from "@/app/actions/academic";

export function ArchiveImportForm() {
  const [state, formAction, isPending] = useActionState(importArchiveTitlesAction, {});

  return (
    <form action={formAction} className="panel mb-6 space-y-4">
      <h2 className="text-xl font-semibold">Impor Arsip Judul (CSV)</h2>
      <p className="text-sm text-slate-600">
        Unggah berkas CSV dengan kolom <code>judul,nama_penulis,tahun,nim,prodi</code>. Kata kunci kemiripan akan dihitung secara otomatis.
      </p>

      {state?.error && (
        <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert">
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700" role="status">
          {state.success}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          Berkas CSV
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            disabled={isPending}
            className="mt-1"
          />
        </label>
        <label>
          Mode Impor
          <select name="mode" defaultValue="append" disabled={isPending} className="mt-1">
            <option value="append">Tambahkan ke arsip (Append)</option>
            <option value="replace">Ganti seluruh arsip (Replace)</option>
          </select>
        </label>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="button" disabled={isPending}>
          {isPending ? "Mengimpor data..." : "Unggah dan Impor"}
        </button>
      </div>
    </form>
  );
}
