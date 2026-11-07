import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace-shell";
import { ActionForm, ReasonField } from "@/components/account-forms";
import { database } from "@/lib/db";
import { accountSelect, jsonValue } from "@/lib/accounts/store";
import { canDecideReset } from "@/lib/accounts/policy";
import { requestSummary } from "@/lib/accounts/profile";
import { pageNumber, requireAccountPermission } from "@/lib/accounts/views";

export const dynamic = "force-dynamic";
export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ page?: string; kind?: string }> }) {
  const session = await requireAccountPermission();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const kind = params.kind === "biodata" || params.kind === "keahlian" ? params.kind : "reset";
  const db = database();
  const skip = (page - 1) * 20;
  const requests = kind === "reset"
    ? await db.passwordResetRequest.findMany({ where: { status: "menunggu" }, select: { id: true, status: true, identitas: true, pengguna: { select: accountSelect } }, orderBy: { id: "asc" }, skip, take: 21 })
    : kind === "biodata"
      ? await db.biodataChangeRequest.findMany({ where: { status: "pending" }, include: { mahasiswa: { select: accountSelect } }, orderBy: { id: "asc" }, skip, take: 21 })
      : await db.keahlianChangeRequest.findMany({ where: { status: "pending" }, include: { dosen: { select: accountSelect } }, orderBy: { id: "asc" }, skip, take: 21 });
  return <WorkspaceShell session={session}><h1 className="mb-5 text-3xl font-bold">Permohonan akun</h1>
    <nav className="mb-6 flex flex-wrap gap-5" aria-label="Jenis permohonan">{[["reset", "Reset password"], ["biodata", "Biodata mahasiswa"], ["keahlian", "Data dan keahlian dosen"]].map(([value, label]) => <Link key={value} className="underline" href={`/akun/permohonan?kind=${value}`} aria-current={kind === value ? "page" : undefined}>{label}</Link>)}</nav>
    <div className="space-y-5">{requests.slice(0, 20).map((request) => {
      const target = "pengguna" in request ? request.pengguna : "mahasiswa" in request ? request.mahasiswa : request.dosen;
      const allowed = kind !== "reset" || canDecideReset(session.user, target);
      return <section key={request.id.toString()} className="panel">
        <h2 className="mb-2 text-xl font-semibold">#{request.id.toString()} · {target.nama}</h2>
        <p className="text-sm text-slate-600">{target.email ?? target.emailArsip} · {request.status}</p>
        {"alasan" in request && <><p className="my-4 text-sm">{request.alasan}</p>
          <pre className="my-4 overflow-x-auto rounded-lg bg-slate-50 p-4 text-sm whitespace-pre-wrap break-all">{JSON.stringify(jsonValue(requestSummary(request)), null, 2)}</pre></>}
        {allowed ? <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <ActionForm command={kind === "reset" ? "approve-reset" : "approve-profile"} label="Setujui"><input type="hidden" name="id" value={request.id.toString()} /><input type="hidden" name="kind" value={kind} /></ActionForm>
          <ActionForm command={kind === "reset" ? "reject-reset" : "reject-profile"} label="Tolak"><input type="hidden" name="id" value={request.id.toString()} /><input type="hidden" name="kind" value={kind} /><ReasonField /></ActionForm>
        </div> : <p className="mt-4 text-sm">Persetujuan reset ini memerlukan Sekpro atau superadmin selain pemilik akun.</p>}
      </section>;
    })}{!requests.length && <p className="panel">Belum ada permohonan menunggu.</p>}</div>
    <nav className="mt-6 flex gap-5" aria-label="Halaman permohonan">{page > 1 && <Link className="underline" href={`/akun/permohonan?kind=${kind}&page=${page - 1}`}>Sebelumnya</Link>}<span>Halaman {page}</span>{requests.length > 20 && <Link className="underline" href={`/akun/permohonan?kind=${kind}&page=${page + 1}`}>Berikutnya</Link>}</nav>
  </WorkspaceShell>;
}
