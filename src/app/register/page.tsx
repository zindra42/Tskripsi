import Link from "next/link";
import { redirect } from "next/navigation";
import { RegistrationForm } from "@/components/account-forms";
import { getSession } from "@/lib/auth/session";
import { landingPath } from "@/lib/auth/policy";
import { expertiseOptions } from "@/lib/accounts/views";

export const dynamic = "force-dynamic";
export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect(landingPath(session.user, session.activeRole));
  let options: Awaited<ReturnType<typeof expertiseOptions>> = [];
  let unavailable = false;
  try { options = await expertiseOptions(); } catch { unavailable = true; }
  return <main id="konten" className="mx-auto max-w-2xl space-y-6 px-5 py-12">
    <Link href="/login" className="text-sm underline">Kembali ke halaman masuk</Link>
    <section className="panel"><h1 className="mb-3 text-3xl font-bold">Daftar akun SIAS</h1>
      <p className="mb-6 text-slate-600">Akun baru menunggu persetujuan Kaprodi atau Sekpro. Password minimal 8 karakter dan maksimal 72 byte UTF-8.</p>
      {unavailable && <p role="status" className="mb-5 text-sm text-amber-900">Daftar keahlian belum dapat dimuat. Layanan pendaftaran memerlukan database yang telah disiapkan.</p>}
      <RegistrationForm options={options} />
    </section>
  </main>;
}
