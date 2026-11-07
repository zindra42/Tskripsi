"use client";

import { useActionState, useRef, useState } from "react";
import { academicAction, type AcademicFormState } from "@/app/actions/academic";

export function AcademicForm({ command, id, label, children }: {
  command: string; id?: string; label: string; children?: React.ReactNode;
}) {
  const key = useRef<string | null>(null);
  const [state, action, pending] = useActionState<AcademicFormState, FormData>(async (previous, form) => {
    key.current ??= crypto.randomUUID();
    form.set("key", key.current);
    const result = await academicAction(previous, form);
    if (result.success) key.current = null;
    return result;
  }, {});
  return <form action={action} className="space-y-4">
    <input type="hidden" name="command" value={command} />
    {id && <input type="hidden" name="id" value={id} />}
    <fieldset disabled={pending} className="space-y-4">{children}</fieldset>
    {state.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">{state.error}</p>}
    {state.success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{state.success}</p>}
    {state.result && <section className="space-y-3 rounded-lg bg-slate-50 p-4" aria-label="Hasil kemiripan">
      <p className="font-semibold">Kemiripan tertinggi {state.result.skor}% dari {state.result.corpusSize} judul arsip.</p>
      {state.result.high && <p className="text-amber-900">Mencapai ambang peringatan {state.result.threshold}%. Tinjau orisinalitas penelitian.</p>}
      <ul className="space-y-3">{state.result.top.map((row) => <li key={row.id}><p>{row.judul} · {row.skor}%</p><p className="text-sm text-slate-600">{row.penulis} · {row.tahun}</p></li>)}</ul>
      {!state.result.top.length && <p>Belum ditemukan kecocokan dalam arsip.</p>}
    </section>}
    <button className="button" disabled={pending}>{pending ? "Menyimpan…" : label}</button>
  </form>;
}

export function TitleEditor({ fields, lecturers, initial = {}, changeId, preferences = [], matrices }: {
  fields: { id: string; namaBidang: string }[];
  lecturers: { id: string; nama: string }[];
  initial?: Record<string, string>;
  changeId?: string;
  preferences?: string[];
  matrices?: Record<string, string>[];
}) {
  const [draft, setDraft] = useState(false);
  return <div className="space-y-5">
    {!changeId && <label className="flex items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={draft} onChange={(event) => setDraft(event.target.checked)} />Simpan sebagai draft</label>}
    <AcademicForm command={changeId ? "submit-change" : draft ? "draft" : "submit-title"} id={changeId} label={changeId ? "Ajukan perubahan judul" : draft ? "Simpan draft" : "Ajukan judul"}>
      <label>Judul penelitian<input name="judul" minLength={draft ? 0 : 10} maxLength={255} required={!draft} defaultValue={initial.judul} /></label>
      <MatrixEditor fields={fields} initialRows={matrices ?? [initial]} draft={draft} multiple={Boolean(changeId)} />
      {changeId ? <>
        <label>Jalur perubahan<select name="jenis"><option value="revisi_minor">Revisi minor</option><option value="seminar_ulang">Seminar ulang dan penetapan pembimbing kembali</option></select></label>
        <label>Alasan perubahan<textarea name="reason" minLength={10} maxLength={5000} required /></label>
      </> : <>
        <label>Proposal PDF, maksimal 10 MB<input type="file" name="proposal" accept="application/pdf" required={!draft} /></label>
        <fieldset><legend className="mb-2 font-medium">Preferensi pembimbing, maksimal dua</legend>{lecturers.map((lecturer) => <label key={lecturer.id} className="mb-2 flex items-center gap-3"><input type="checkbox" name="preferensi" value={lecturer.id} defaultChecked={preferences.includes(lecturer.id)} className="h-5 w-5" />{lecturer.nama}</label>)}</fieldset>
      </>}
    </AcademicForm>
  </div>;
}

export function AdministrationEditor({ sender, date }: { sender: string; date?: string }) {
  const [draft, setDraft] = useState(false);
  return <div className="space-y-4">
    <label className="flex items-center gap-3"><input type="checkbox" checked={draft} onChange={(event) => setDraft(event.target.checked)} className="h-5 w-5" />Simpan berkas bertahap</label>
    <AcademicForm command={draft ? "draft-administration" : "submit-administration"} label={draft ? "Simpan berkas sementara" : "Ajukan verifikasi"}>
      <label>Nama pengirim rekening<input name="namaPengirim" required={!draft} minLength={3} maxLength={255} defaultValue={sender} /></label>
      <label>Tanggal transfer<input name="tanggalTransfer" type="date" required={!draft} defaultValue={date} /></label>
      {[["kwitansi", "Kwitansi pembayaran"], ["transfer", "Bukti transfer"], ["krs", "KRS / Surat Keterangan Aktif"]].map(([key, label]) => <label key={key}>{label}, PDF/JPG/PNG maksimal 2 MB<input name={key} type="file" accept="application/pdf,image/jpeg,image/png" /></label>)}
      <p className="text-sm text-slate-600">Berkas dapat disimpan satu per satu. Lengkapi ketiga berkas sebelum verifikasi. Saat revisi, unggah bagian yang perlu diperbaiki.</p>
    </AcademicForm>
  </div>;
}

function MatrixEditor({ fields, initialRows, draft, multiple }: {
  fields: { id: string; namaBidang: string }[];
  initialRows: Record<string, string>[];
  draft: boolean;
  multiple: boolean;
}) {
  const textFields = [["variabel_penelitian", "Variabel penelitian"], ["lokasi", "Lokasi / objek"], ["metode", "Metode"], ["instrumen", "Instrumen"], ["analisis_data", "Analisis data"]];
  const fieldKeys = ["bidang_keahlian_id", "bidang_keahlian_2_id", ...textFields.map(([key]) => key)];
  const [rows, setRows] = useState(() => (initialRows.length ? initialRows : [{}]).map((row) => Object.fromEntries(fieldKeys.map((key) => [key, row[key] ?? ""]))));
  function update(index: number, key: string, value: string) {
    setRows((previous) => previous.map((row, i) => i === index ? { ...row, [key]: value } : row));
  }
  return <div className="space-y-4">
    <input type="hidden" name="matriksJson" value={JSON.stringify(rows)} />
    {rows.map((row, index) => <fieldset key={index} className="rounded-xl border border-slate-200 p-4">
      <legend className="px-2 font-semibold">Matriks penelitian {index + 1}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {["bidang_keahlian_id", "bidang_keahlian_2_id"].map((key, i) => <label key={key}>Bidang keahlian {i + 1}
          <select value={row[key]} onChange={(event) => update(index, key, event.target.value)}>
            <option value="">Pilih bidang (opsional)</option>
            {fields.map((field) => <option value={field.id} key={field.id}>{field.namaBidang}</option>)}
          </select>
        </label>)}
        {textFields.map(([key, label]) => <label key={key}>{label}
          <input minLength={draft ? 0 : 3} maxLength={255} required={!draft} value={row[key]} onChange={(event) => update(index, key, event.target.value)} />
        </label>)}
      </div>
      {multiple && rows.length > 1 && <button type="button" className="button-secondary" onClick={() => setRows((previous) => previous.filter((_row, i) => i !== index))}>Hapus baris {index + 1}</button>}
    </fieldset>)}
    {multiple && rows.length < 20 && <button type="button" className="button-secondary" onClick={() => setRows((previous) => [...previous, Object.fromEntries(fieldKeys.map((key) => [key, ""]))])}>Tambah baris matriks</button>}
  </div>;
}
