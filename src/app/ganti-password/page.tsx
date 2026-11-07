import { PasswordForm } from "@/components/auth-forms";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const session = await requireSession("password");
  return <WorkspaceShell session={session}><section className="panel">
    <h1 className="text-2xl font-bold">Ganti password</h1>
    <p className="mb-7 mt-3 max-w-lg leading-relaxed text-slate-600">{session.user.wajibGantiPassword
      ? "Anda wajib mengganti password sementara sebelum mengakses area kerja."
      : "Perbarui password untuk menjaga keamanan akun Anda."} Setelah berhasil, sesi lain akan diakhiri.</p>
    <PasswordForm />
  </section></WorkspaceShell>;
}
