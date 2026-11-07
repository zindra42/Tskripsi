import { WorkspaceShell } from "@/components/workspace-shell";
import { ActionForm, Field, ProfileFields, ReasonField } from "@/components/account-forms";
import { requireSession } from "@/lib/auth/session";
import { database } from "@/lib/db";
import { accountSelect } from "@/lib/accounts/store";
import { expertiseOptions, profileValues } from "@/lib/accounts/views";

export const dynamic = "force-dynamic";
export default async function ProfilePage() {
  const session = await requireSession();
  const db = database();
  const [user, options, biodata, keahlian] = await Promise.all([
    db.pengguna.findUniqueOrThrow({ where: { id: session.user.id }, select: accountSelect }),
    expertiseOptions(),
    db.biodataChangeRequest.findMany({ where: { mahasiswaId: session.user.id }, orderBy: { id: "desc" }, take: 20 }),
    db.keahlianChangeRequest.findMany({ where: { dosenId: session.user.id }, orderBy: { id: "desc" }, take: 20 }),
  ]);
  return <WorkspaceShell session={session}><h1 className="mb-6 text-3xl font-bold">Profil saya</h1>
    <div className="space-y-6">
      <section className="panel"><h2 className="mb-4 text-xl font-semibold">Nama tampilan</h2>
        <ActionForm command="name"><Field name="nama" label="Nama lengkap" value={user.nama} /></ActionForm>
      </section>
      {(user.mahasiswa || user.dosen) && <section className="panel"><h2 className="mb-3 text-xl font-semibold">Permohonan perubahan biodata dan keahlian</h2>
        <p className="mb-5 text-sm text-slate-600">Centang data yang ingin diubah. Perubahan berlaku setelah disetujui pengelola. Perubahan email mencabut sesi aktif.</p>
        <ActionForm command="request-profile" label="Ajukan perubahan"><ProfileFields values={profileValues(user)} options={options} /><ReasonField /></ActionForm>
      </section>}
      <section className="panel"><h2 className="mb-4 text-xl font-semibold">Riwayat permohonan terbaru</h2>
        {[...biodata, ...keahlian].map((request) => <article key={`${"mahasiswaId" in request ? "m" : "d"}-${request.id}`} className="border-b border-slate-200 py-4">
          <p className="font-semibold">#{request.id.toString()} · {request.status}</p><p className="text-sm">{request.alasan}</p>
          {request.catatanKaprodi && <p className="mt-2 text-sm text-slate-600">{request.catatanKaprodi}</p>}
        </article>)}
        {!biodata.length && !keahlian.length && <p className="text-sm text-slate-600">Belum ada permohonan.</p>}
      </section>
    </div>
  </WorkspaceShell>;
}
