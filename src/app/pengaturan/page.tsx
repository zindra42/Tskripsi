import { WorkspaceShell } from "@/components/workspace-shell";
import { ActionForm, Field, ReasonField } from "@/components/account-forms";
import { getCachedSystemSettings } from "@/lib/support/master-data";
import { expertiseOptions, requireAccountPermission } from "@/lib/accounts/views";
import { settingDefinitions } from "@/lib/accounts/validation";
import { academicPeriod } from "@/lib/accounts/policy";

export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const session = await requireAccountPermission("settings");
  const values = await getCachedSystemSettings();
  const period = academicPeriod(values);
  return <WorkspaceShell session={session}><h1 className="mb-6 text-3xl font-bold">Pengaturan sistem</h1>
    <section className="panel"><p className="mb-6">Periode aktif {period.jenis} {period.tahunMulai}/{period.tahunMulai + 1}</p>
      <ActionForm command="settings"><div className="grid gap-5 sm:grid-cols-2">{Object.entries(settingDefinitions).map(([key, definition]) =>
        "options" in definition ? <label key={key}>{definition.label}<select name={key} defaultValue={values[key] ?? definition.default}>{definition.options.map((value) => <option key={value}>{value}</option>)}</select></label>
          : <Field key={key} name={key} label={definition.label} type={"date" in definition ? "date" : "number"} value={values[key] ?? definition.default} min={"min" in definition ? definition.min : undefined} max={"max" in definition ? definition.max : undefined} />
      )}</div><ReasonField /><p className="text-sm text-slate-600">Penyimpanan menyinkronkan kuota ke seluruh dosen aktif.</p></ActionForm>
    </section>
    {session.user.role === "superadmin" && <section className="panel mt-6"><h2 className="mb-4 text-xl font-semibold">Bidang keahlian</h2>
      <ul className="mb-6 list-inside list-disc text-sm">{(await expertiseOptions()).map((item) => <li key={item.id}>{item.namaBidang}</li>)}</ul>
      <ActionForm command="add-expertise" label="Tambah bidang"><Field name="namaBidang" label="Nama bidang baru" /><ReasonField /></ActionForm>
    </section>}
  </WorkspaceShell>;
}
