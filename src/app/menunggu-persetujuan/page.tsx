import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireSession } from "@/lib/auth/session";
import { landingPath } from "@/lib/auth/policy";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const session = await requireSession("status");
  if (session.user.statusAkun === "aktif") redirect(landingPath(session.user, session.activeRole));
  const rejected = session.user.statusAkun === "ditolak";
  return <WorkspaceShell session={session}><section className="panel border-t-4! border-t-[#fca311]!">
    <p className="mb-3 text-sm font-semibold text-slate-500">STATUS AKUN</p>
    <h1 className="text-2xl font-bold">{rejected ? "Pendaftaran akun ditolak" : "Menunggu persetujuan"}</h1>
    <p className="mt-4 leading-relaxed text-slate-600">{rejected
      ? "Hubungi pengelola program studi untuk klarifikasi pendaftaran Anda."
      : "Akun Anda belum diaktifkan oleh pengelola program studi. Area akademik dapat dibuka setelah akun disetujui."}</p>
    {rejected && session.user.catatanPenolakan && <div className="mt-5 rounded-lg bg-slate-50 p-4"><h2 className="text-sm font-semibold">Catatan pengelola</h2><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{session.user.catatanPenolakan}</p></div>}
    <p className="mt-5 text-sm text-slate-500">Muat ulang halaman ini untuk memeriksa perubahan status akun.</p>
  </section></WorkspaceShell>;
}
