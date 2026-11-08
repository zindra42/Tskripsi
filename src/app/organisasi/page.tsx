import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { OrganizationForm, MasterFields } from "@/components/organization-forms";
import { requireSession } from "@/lib/auth/session";
import { organizationData } from "@/lib/organization/store";

export const dynamic = "force-dynamic";
export default async function OrganizationPage() {
  const session = await requireSession();
  if (!["superadmin", "dekan"].includes(session.user.role)) notFound();
  const { actor, faculties, programs, candidates } = await organizationData(session);
  const admin = actor.role === "superadmin";
  return <WorkspaceShell session={session}><h1 className="mb-4 text-3xl font-bold">Tata kelola fakultas dan prodi</h1>
    <p className="mb-6 text-slate-600">Penetapan pejabat dan perubahan afiliasi mencabut sesi pengguna terdampak. Data historis tetap tersimpan.</p>
    {admin && <div className="panel mb-6 space-y-4"><Link href="/organisasi/afiliasi" className="underline">Pemetaan profil lama ke master prodi</Link><details><summary className="cursor-pointer font-semibold">Tambah fakultas</summary><OrganizationForm command="faculty"><MasterFields /></OrganizationForm></details></div>}
    {!faculties.length && <p className="panel">{admin ? "Belum ada fakultas. Tambahkan fakultas terlebih dahulu." : "Penempatan fakultas belum tersedia atau fakultas nonaktif. Hubungi superadmin."}</p>}
    <div className="space-y-6">{faculties.map((f) => <section className="panel space-y-5" key={String(f.id)}><h2 className="text-2xl font-semibold">{f.nama} ({f.kode}) · {f.aktif ? "Aktif" : "Nonaktif"}</h2>
      <p>Dekan: {f.pengguna.map((u) => u.nama).join(", ") || "Belum ditetapkan"}</p>
      {admin && <><details><summary className="cursor-pointer font-semibold">Ubah fakultas</summary><OrganizationForm command="faculty"><input type="hidden" name="id" value={String(f.id)} /><MasterFields values={f} /></OrganizationForm></details>
        <details><summary className="cursor-pointer font-semibold">Tetapkan / ganti / berhentikan Dekan</summary><OrganizationForm command="dean"><input type="hidden" name="fakultasId" value={String(f.id)} /><label>Dosen aktif<select name="targetId"><option value="">Berhentikan Dekan saat ini</option>{candidates.map((c) => <option key={String(c.id)} value={String(c.id)}>{c.nama} (#{String(c.id)})</option>)}</select></label></OrganizationForm></details></>}
      {f.aktif && <details><summary className="cursor-pointer font-semibold">Tambah program studi</summary><OrganizationForm command="program"><input type="hidden" name="fakultasId" value={String(f.id)} /><MasterFields program /></OrganizationForm></details>}
      {programs.filter((p) => p.fakultasId === f.id).map((p) => <article key={String(p.id)} className="rounded-xl border border-slate-200 p-5"><h3 className="text-lg font-semibold">{p.nama} · {p.jenjang} · {p.kode} · {p.aktif ? "Aktif" : "Nonaktif"}</h3>
        <p className="my-3 text-sm">{p.dosen.map((d) => `${d.pengguna.nama}: ${d.isKaprodi || d.pengguna.role === "kaprodi" ? "Kaprodi" : ""} ${d.isSekpro || d.pengguna.role === "sekpro" ? "Sekpro" : ""}`).join(", ") || "Pimpinan belum ditetapkan"}</p>
        {f.aktif && <details><summary className="cursor-pointer font-semibold">Ubah program studi</summary><OrganizationForm command="program"><input type="hidden" name="id" value={String(p.id)} /><input type="hidden" name="fakultasId" value={String(f.id)} /><MasterFields program values={p} /></OrganizationForm></details>}
      </article>)}
    </section>)}</div>
  </WorkspaceShell>;
}
