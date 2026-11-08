import { ActionForm, Field, ReasonField } from "./account-forms";
import { organizationAction } from "@/app/actions/organization";

export function OrganizationForm({ command, children, label }: { command: string; children: React.ReactNode; label?: string }) {
  return <ActionForm action={organizationAction} command={command} label={label}>{children}<ReasonField /></ActionForm>;
}

export function MasterFields({ values, program = false }: { values?: { kode: string; nama: string; aktif: boolean; jenjang?: string }; program?: boolean }) {
  return <><Field name="kode" label="Kode (2–20 huruf, angka, titik atau tanda hubung)" value={values?.kode} />
    <Field name="nama" label="Nama (3–100 karakter)" value={values?.nama} />
    {program && <label>Jenjang<select name="jenjang" defaultValue={values?.jenjang ?? "S1"}>{["D1", "D2", "D3", "D4", "S1", "S2", "S3", "Profesi"].map((v) => <option key={v}>{v}</option>)}</select></label>}
    <label className="flex gap-2"><input type="checkbox" name="aktif" defaultChecked={values?.aktif ?? true} />Aktif</label></>;
}
