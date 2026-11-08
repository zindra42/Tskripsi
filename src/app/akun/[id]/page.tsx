import { activeProgramOptions } from "@/lib/organization/store";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { ActionForm, Field, ProfileFields, ReasonField } from "@/components/account-forms";
import { database } from "@/lib/db";
import { roleLabels } from "@/lib/auth/policy";
import { canDecideAccount, inAccountScope } from "@/lib/accounts/policy";
import { accountSelect } from "@/lib/accounts/store";
import { idSchema } from "@/lib/accounts/validation";
import { expertiseOptions, profileValues, requireAccountPermission } from "@/lib/accounts/views";

export const dynamic = "force-dynamic";
export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAccountPermission();
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const user = await database().pengguna.findUnique({ where: { id: parsed.data }, select: accountSelect });
  const admin = session.user.role === "superadmin";
  if (!user || !inAccountScope(session.user, user) || user.role === "superadmin" || (user.deletedAt && !admin)) notFound();
  const id = user.id.toString();
  return <WorkspaceShell session={session}><Link href="/akun" className="text-sm underline">Kembali ke daftar akun</Link>
    <h1 className="my-5 text-3xl font-bold">{user.nama}</h1>
    <div className="space-y-6">
      <section className="panel space-y-2"><h2 className="text-xl font-semibold">Identitas akun #{id}</h2>
        <p>{roleLabels[user.role]} · {user.deletedAt ? "terhapus" : user.statusAkun}</p>
        <p className="break-all">{user.email ?? user.emailArsip ?? "Email kosong"}</p>
        <p>NIM {user.mahasiswa?.nim ?? user.mahasiswa?.nimArsip ?? "—"} · NIDN {user.dosen?.nidn ?? user.dosen?.nidnArsip ?? "—"}</p>
        {user.dosen && <p>Jabatan {user.dosen.isKaprodi ? "Kaprodi" : user.dosen.isSekpro ? "Sekpro" : "Dosen"} · Kuota {user.dosen.kuotaBimbingan}</p>}
        {user.catatanPenolakan && <p>{user.catatanPenolakan}</p>}
      </section>
      {!user.deletedAt && user.statusAkun === "menunggu_persetujuan" && canDecideAccount(session.user, user) && <section className="panel grid gap-6 sm:grid-cols-2">
        <ActionForm command="approve" label="Setujui akun"><input type="hidden" name="ids" value={id} /><p>Aktifkan akun setelah memeriksa identitas.</p></ActionForm>
        <ActionForm command="reject" label="Tolak akun"><input type="hidden" name="ids" value={id} /><ReasonField /></ActionForm>
      </section>}
      {admin && !user.deletedAt && user.statusAkun === "aktif" && <>
        <section className="panel"><h2 className="mb-4 text-xl font-semibold">Koreksi data pribadi</h2>
          <ActionForm command="edit-profile"><input type="hidden" name="id" value={id} /><ProfileFields programs={await activeProgramOptions()} values={profileValues(user)} options={await expertiseOptions()} /><ReasonField /></ActionForm>
        </section>
        <section className="panel"><h2 className="mb-3 text-xl font-semibold">Penetapan peran</h2><Link href="/organisasi" className="underline">Tetapkan / ganti Dekan melalui tata kelola fakultas</Link>
          <p className="mb-5 text-sm text-slate-600">Penetapan Kaprodi mengalihkan jabatan dari pemegang sebelumnya. Sesi pengguna terdampak dicabut. Profil historis tetap terhubung ke ID sumber.</p>
          <ActionForm command="role" label="Tetapkan peran"><input type="hidden" name="id" value={id} />
            <label>Peran tujuan<select name="role"><option value="mahasiswa">Mahasiswa</option><option value="dosen">Dosen</option><option value="kaprodi">Kaprodi</option><option value="sekpro">Sekpro</option></select></label>
            <Field name="identifier" label="NIM atau NIDN jika profil tujuan belum ada" required={false} /><ReasonField /><Field name="confirmation" label="Ketik UBAH PERAN" />
          </ActionForm>
        </section>
      </>}
      <section className="panel"><h2 className="mb-4 text-xl font-semibold">Status dan pemulihan akun</h2>
        {admin && (user.deletedAt || ["aktif", "nonaktif"].includes(user.statusAkun)) && <ActionForm command={user.deletedAt ? "restore" : user.statusAkun === "aktif" ? "deactivate" : "activate"} label={user.deletedAt ? "Pulihkan akun" : user.statusAkun === "aktif" ? "Nonaktifkan akun" : "Aktifkan akun"}>
          <input type="hidden" name="id" value={id} /><ReasonField />{user.deletedAt && <Field name="confirmation" label="Ketik KONFIRMASI" />}
        </ActionForm>}
        {!user.deletedAt && <details className="mt-6"><summary className="cursor-pointer font-semibold">Hapus akun secara soft delete</summary>
          <p className="my-4 text-sm text-slate-600">Email, NIM, dan NIDN dipindahkan ke arsip. Pemulihan oleh superadmin memeriksa konflik identitas dengan akun lain.</p>
          <ActionForm command="delete" label="Hapus akun"><input type="hidden" name="id" value={id} /><ReasonField /><Field name="confirmation" label="Ketik KONFIRMASI" /></ActionForm>
        </details>}
      </section>
    </div>
  </WorkspaceShell>;
}
