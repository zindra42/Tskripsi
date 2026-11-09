import { WorkspaceShell } from "@/components/workspace-shell";
import { ActionForm, Field, ProgramSelect, ReasonField } from "@/components/account-forms";
import { getCachedSystemSettings } from "@/lib/support/master-data";
import { requireAccountPermission } from "@/lib/accounts/views";
import { database } from "@/lib/db";
import { activeProgramOptions } from "@/lib/organization/store";
import { settingDefinitions } from "@/lib/accounts/validation";
import { academicPeriod } from "@/lib/accounts/policy";

export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const session = await requireAccountPermission("settings");
  const values = await getCachedSystemSettings();
  const period = academicPeriod(values);
  const fields = session.user.role === "superadmin" ? await database().bidangKeahlian.findMany({
    include: { programStudi: { include: { fakultas: true } } }, orderBy: [{ programStudiId: "asc" }, { namaBidang: "asc" }],
  }) : [];
  const programs = session.user.role === "superadmin" ? await activeProgramOptions() : [];
  return <WorkspaceShell session={session}><h1 className="mb-6 text-3xl font-bold">Pengaturan sistem</h1>
    <section className="panel"><p className="mb-6">Periode aktif {period.jenis} {period.tahunMulai}/{period.tahunMulai + 1}</p>
      <ActionForm command="settings"><div className="grid gap-5 sm:grid-cols-2">{Object.entries(settingDefinitions).map(([key, definition]) =>
        "options" in definition ? <label key={key}>{definition.label}<select name={key} defaultValue={values[key] ?? definition.default}>{definition.options.map((value) => <option key={value}>{value}</option>)}</select></label>
          : <Field key={key} name={key} label={definition.label} type={"date" in definition ? "date" : "number"} value={values[key] ?? definition.default} min={"min" in definition ? definition.min : undefined} max={"max" in definition ? definition.max : undefined} />
      )}</div><ReasonField /><p className="text-sm text-slate-600">Penyimpanan menyinkronkan kuota ke seluruh dosen aktif.</p></ActionForm>
    </section>
    {session.user.role === "superadmin" && <section className="panel mt-6"><h2 className="mb-4 text-xl font-semibold">Bidang keahlian</h2>
      <ul className="mb-6 list-inside list-disc text-sm">{fields.filter((item) => item.programStudi).map((item) => <li key={item.id.toString()}>
        {item.programStudi!.fakultas.nama} / {item.programStudi!.nama} ({item.programStudi!.kode}) — {item.namaBidang}
        {(!item.programStudi!.aktif || !item.programStudi!.fakultas.aktif) && " (nonaktif)"}
      </li>)}</ul>
      <ActionForm command="add-expertise" label="Tambah bidang"><ProgramSelect options={programs} /><Field name="namaBidang" label="Nama bidang baru" /><ReasonField /></ActionForm>
      <h3 className="mb-3 mt-8 text-lg font-semibold">Pemetaan bidang legacy</h3>
      <p className="mb-4 text-sm text-slate-600">Bidang belum terpetakan tetap tersimpan dalam histori dan perlu ditautkan sebelum dipilih kembali. Seluruh referensi harus berasal dari prodi tujuan. Jika dipakai lintas prodi, buat bidang baru untuk setiap prodi dan pertahankan bidang legacy.</p>
      {fields.filter((item) => item.programStudiId === null).map((item) => <div key={item.id.toString()} className="mb-4 rounded-lg border border-slate-200 p-4">
        <h4 className="mb-3 font-semibold">{item.namaBidang} (#{item.id.toString()}, belum terpetakan)</h4>
        <ActionForm command="link-expertise" label="Tautkan bidang legacy"><input type="hidden" name="id" value={item.id.toString()} /><ProgramSelect options={programs} /><ReasonField /></ActionForm>
      </div>)}
    </section>}
  </WorkspaceShell>;
}
