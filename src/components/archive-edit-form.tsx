"use client";

import { useActionState } from "react";
import { editArchiveAction } from "@/app/actions/archive";

export function ArchiveEditForm({ initial }: { initial: Record<string, string> }) {
  const [state, action, pending] = useActionState(editArchiveAction, {});
  const values = state.values ?? initial;
  return <form action={action} className="panel space-y-4">
    {state.error && <p role="alert" className="text-rose-700">{state.error}</p>}
    {state.success && <p role="status" className="text-emerald-700">{state.success}</p>}
    <input type="hidden" name="id" value={values.id} />
    <input type="hidden" name="original" value={values.original} />
    <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2">Judul<textarea name="judul" defaultValue={values.judul} required minLength={3} maxLength={10000} rows={4} /></label>
      <label>Penulis<input name="namaPenulis" defaultValue={values.namaPenulis} maxLength={255} /></label>
      <label>NIM<input name="nim" type="text" defaultValue={values.nim} maxLength={50} /></label>
      <label>Tahun judul/lulus<input name="tahun" defaultValue={values.tahun} maxLength={10} /></label>
      <label>Program studi arsip<input name="prodi" defaultValue={values.prodi} maxLength={100} /></label>
      <label className="sm:col-span-2">Alasan perubahan<textarea name="reason" defaultValue={values.reason} required minLength={10} maxLength={1000} /></label>
      <button className="button sm:col-span-2" type="submit">{pending ? "Menyimpan…" : "Simpan perubahan arsip"}</button>
    </fieldset>
  </form>;
}
