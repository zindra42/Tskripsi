"use client";

import { useActionState, useState } from "react";
import { accountAction, finishReset, register, requestReset, type AccountFormState } from "@/app/actions/accounts";
import { roleLabels } from "@/lib/auth/policy";
import type { Role } from "@/generated/prisma/enums";

export type ExpertiseOption = { id: string; namaBidang: string; programStudiId: string };

export function ActionForm({ command, children, label = "Simpan", action = accountAction, className = "space-y-4" }: {
  command?: string; children: React.ReactNode; label?: string; className?: string;
  action?: (state: AccountFormState, form: FormData) => Promise<AccountFormState>;
}) {
  const [state, submit, pending] = useActionState(action, { error: "" });
  const [hidden, setHidden] = useState<string>();
  const submissionDisabled = pending || Boolean(state.secret);
  return <form action={submit} className={className}>
    {command && <input type="hidden" name="command" value={command} />}
    {state.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{state.error}</p>}
    {state.success && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-900">{state.success}</p>}
    {state.secret && hidden !== state.secret && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <p className="mb-3 text-sm">{state.secretLabel}</p>
      <code className="block break-all select-all">{state.secret}</code>
      <button className="button-secondary mt-3" type="button" onClick={() => setHidden(state.secret)}>Sembunyikan rahasia</button>
    </div>}
    <fieldset disabled={submissionDisabled} className="space-y-4">{children}</fieldset>
    <button className="button" disabled={submissionDisabled} type="submit">{pending ? "Memproses…" : label}</button>
  </form>;
}

export function Field({ name, label, type = "text", value, required = true, min, max }: {
  name: string; label: string; type?: string; value?: string | number | null; required?: boolean; min?: number; max?: number;
}) {
  return <label>{label}<input name={name} type={type} defaultValue={value ?? ""} required={required} min={min} max={max}
    minLength={type === "password" ? 8 : undefined} maxLength={type === "password" ? 72 : 255}
    autoComplete={type === "password" ? "new-password" : undefined} /></label>;
}

export function ReasonField() {
  return <label>Alasan tindakan (10–1000 karakter)<input name="reason" required minLength={10} maxLength={1000} /></label>;
}

export function ExpertiseFields({ options, selected = [], other = false }: { options: ExpertiseOption[]; selected?: string[]; other?: boolean }) {
  return <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Bidang keahlian (pilih 2–3)</legend>
    {options.map((option) => <label key={option.id} className="flex items-center gap-2 font-normal">
      <input type="checkbox" name="bidang" value={option.id} defaultChecked={selected.includes(option.id)} />{option.namaBidang}
    </label>)}
    {other && <><label className="flex items-center gap-2"><input type="checkbox" name="bidang" value="lainnya" />Lainnya</label>
      <Field name="bidangLainnya" label="Nama keahlian lainnya" required={false} /></>}
  </fieldset>;
}

export function RegistrationForm({ options, programs = [], admin = false }: { options: ExpertiseOption[]; programs?: ProgramOption[]; admin?: boolean }) {
  const [role, setRole] = useState<Role>("mahasiswa");
  const [programId, setProgramId] = useState("");
  const roles: Role[] = admin ? ["mahasiswa", "dosen", "kaprodi", "sekpro"] : ["mahasiswa", "dosen", "admin_keuangan"];
  const lecturer = ["dosen", "kaprodi", "sekpro"].includes(role);
  return <ActionForm action={admin ? accountAction : register} command={admin ? "create" : undefined} label={admin ? "Buat akun" : "Daftar akun"}>
    <label>Jenis akun<select name="role" value={role} onChange={(event) => setRole(event.target.value as Role)}>{roles.map((value) => <option key={value} value={value}>{roleLabels[value]}</option>)}</select></label>
    <Field name="nama" label="Nama lengkap" /><Field name="email" label="Email" type="email" />
    {!admin && <><Field name="password" label="Password" type="password" /><Field name="confirmation" label="Konfirmasi password" type="password" /></>}
    {role === "mahasiswa" && <><Field name="nim" label="NIM" /><Field name="semester" label="Semester sesuai NIM dan periode aktif (7–14)" type="number" min={7} max={14} /></>}
    {(role === "mahasiswa" || lecturer) && <Field name="noHp" label="Nomor HP (08, total 10–13 digit)" type="tel" />}
    {(role === "mahasiswa" || lecturer) && <ProgramSelect options={programs} value={programId} onChange={setProgramId} />}
    {lecturer && <><Field name="nidn" label="NIDN" />
      <ExpertiseFields key={`${role}:${programId}`} options={options.filter((field) => field.programStudiId === programId)} other={Boolean(programId)} />
      {!programId && <p className="text-sm text-slate-600">Pilih prodi untuk memuat bidang keahlian.</p>}
      {!admin && <p className="text-sm text-slate-600">Jabatan pimpinan ditetapkan Dekan atau superadmin setelah akun aktif.</p>}</>}
    {admin && role === "kaprodi" && <Field name="confirmation" label="Ketik KONFIRMASI" />}
  </ActionForm>;
}

export function RecoveryForms() {
  return <div className="grid gap-8 md:grid-cols-2">
    <section className="panel"><h2 className="mb-4 text-xl font-semibold">Ajukan pemulihan</h2>
      <ActionForm action={requestReset} label="Ajukan reset"><Field name="identitas" label="Email, NIM, atau NIDN" /></ActionForm>
    </section>
    <section className="panel"><h2 className="mb-4 text-xl font-semibold">Gunakan token persetujuan</h2>
      <ActionForm action={finishReset} label="Perbarui password"><Field name="token" label="Token dari pengelola" />
        <Field name="password" label="Password baru" type="password" /><Field name="confirmation" label="Konfirmasi password baru" type="password" />
      </ActionForm>
    </section>
  </div>;
}

export type ProfileValues = { programStudiId?: string | null; nama: string; email: string | null; nim?: string | null; nidn?: string | null; semester?: number; noHp?: string | null; bidang?: string[] };
export function ProfileFields({ values, options, programs = [] }: { values: ProfileValues; options: ExpertiseOption[]; programs?: ProgramOption[] }) {
  const [changeProgram, setChangeProgram] = useState(false);
  const [programId, setProgramId] = useState(values.programStudiId ?? "");
  const [selectionVersion, setSelectionVersion] = useState(0);
  const targetProgram = changeProgram ? programId : values.programStudiId;
  const fields = [["nama", "Nama lengkap", "text"], ["email", "Email", "email"],
    ...(values.semester !== undefined ? [["nim", "NIM", "text"], ["semester", "Semester (1–14)", "number"]] : []),
    ...(values.nidn !== undefined ? [["nidn", "NIDN", "text"]] : []),
    ...(values.noHp !== undefined ? [["noHp", "Nomor HP", "tel"]] : [])];
  return <div className="space-y-5">{fields.map(([key, label, type]) => <div key={key} className="rounded-lg border border-slate-200 p-4">
    <label className="flex items-center gap-2"><input type="checkbox" name="changes" value={key} />Ubah {label.toLowerCase()}</label>
    <Field name={key} label={label} type={type} value={values[key as keyof ProfileValues] as string | number | null} required={false} min={key === "semester" ? 1 : undefined} max={key === "semester" ? 14 : undefined} />
  </div>)}
    {values.programStudiId !== undefined && <div className="rounded-lg border border-slate-200 p-4">
      <label className="flex gap-2"><input type="checkbox" name="changes" value="programStudiId" checked={changeProgram} onChange={(event) => { setChangeProgram(event.target.checked); setSelectionVersion((v) => v + 1); }} />Ubah afiliasi program studi</label>
      <ProgramSelect options={programs} value={programId} required={changeProgram} onChange={(id) => { setProgramId(id); setSelectionVersion((v) => v + 1); }} />
    </div>}
    {values.bidang !== undefined && <div className="rounded-lg border border-slate-200 p-4">
      <label className="flex items-center gap-2"><input type="checkbox" name="changes" value="bidang" />Ubah bidang keahlian</label>
      <ExpertiseFields key={`${targetProgram}:${selectionVersion}`} options={options.filter((field) => field.programStudiId === targetProgram)} selected={selectionVersion === 0 ? values.bidang : []} />
      <p className="text-sm text-slate-600">Pilihan mengikuti afiliasi tujuan. Pilih ulang bidang setelah mengganti prodi. Bidang historis dari prodi lama tetap tercatat.</p>
    </div>}
  </div>;
}

export type ProgramOption = { id: string; label: string };
export function ProgramSelect({ options, value, required = true, onChange }: { options: ProgramOption[]; value?: string | null; required?: boolean; onChange?: (id: string) => void }) {
  return <label>Fakultas / Program studi<select name="programStudiId" required={required} {...(onChange ? { value: value ?? "", onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value) } : { defaultValue: value ?? "" })}><option value="">Pilih program studi aktif</option>{options.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>{!options.length && <span className="text-sm text-amber-900">Belum ada prodi aktif. Hubungi superadmin.</span>}</label>;
}
