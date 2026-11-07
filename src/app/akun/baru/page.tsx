import { WorkspaceShell } from "@/components/workspace-shell";
import { RegistrationForm } from "@/components/account-forms";
import { expertiseOptions, requireAccountPermission } from "@/lib/accounts/views";

export const dynamic = "force-dynamic";
export default async function CreateAccountPage() {
  const session = await requireAccountPermission("superadmin");
  return <WorkspaceShell session={session}><section className="panel"><h1 className="mb-4 text-3xl font-bold">Tambah akun langsung</h1>
    <p className="mb-6 text-sm text-slate-600">Akun langsung aktif. Password sementara ditampilkan sekali dan wajib diganti pemilik saat masuk.</p>
    <RegistrationForm admin options={await expertiseOptions()} />
  </section></WorkspaceShell>;
}
