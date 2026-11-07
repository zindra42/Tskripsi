import Link from "next/link";
import { RecoveryForms } from "@/components/account-forms";

export const dynamic = "force-dynamic";
export default function RecoveryPage() {
  return <main id="konten" className="mx-auto max-w-5xl space-y-6 px-5 py-12">
    <Link href="/login" className="text-sm underline">Kembali ke halaman masuk</Link>
    <h1 className="text-3xl font-bold">Pemulihan password</h1>
    <p className="text-slate-600">Permohonan memerlukan persetujuan pengelola. Pemulihan akun Kaprodi ditangani Sekpro atau superadmin. Token berlaku 24 jam dan hanya dapat digunakan sekali.</p>
    <RecoveryForms />
  </main>;
}
