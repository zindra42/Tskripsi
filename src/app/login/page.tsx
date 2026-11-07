import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { landingPath } from "@/lib/auth/policy";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Masuk" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const params = await searchParams;
  const session = await getSession();
  if (session) redirect(landingPath(session.user, session.activeRole));
  return <main id="konten" className="grid min-h-screen lg:grid-cols-2">
    <section className="flex flex-col justify-between bg-[#14213d] px-7 py-10 text-white sm:px-14 lg:p-16">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#fca311] text-xl font-bold text-[#14213d]" aria-hidden="true">S</span>
        <div><p className="text-xl font-bold tracking-wide">SIAS</p><p className="text-xs text-slate-300">Universitas Teknologi Sumbawa</p></div>
      </div>
      <div className="my-10 max-w-lg lg:my-20">
        <p className="mb-4 text-sm font-semibold text-[#fca311]">Sistem Informasi Akademik Skripsi</p>
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">Satu akses untuk<br />perjalanan skripsi Anda.</h1>
        <p className="mt-5 leading-relaxed text-slate-300">Masuk untuk membuka area kerja sesuai peran dan kewenangan akun Anda.</p>
      </div>
      <p className="text-sm text-slate-300">Program Studi Informatika</p>
    </section>
    <section className="flex items-center justify-center p-6 py-12 sm:p-12">
      <div className="w-full max-w-md">
        <p className="mb-2 text-sm font-semibold text-slate-500">PORTAL SIAS</p>
        <h2 className="mb-3 text-3xl font-bold">Selamat datang kembali</h2>
        <p className="mb-8 text-slate-600">Silakan masuk menggunakan akun Anda.</p>
        {params.session === "expired" && <p role="status" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Sesi telah berakhir. Silakan masuk kembali.</p>}
        <LoginForm />
        <p className="mt-8 border-t border-slate-200 pt-5 text-xs leading-relaxed text-slate-500">Sesi biasa berakhir setelah 5 menit tanpa aktivitas. Pilih “ingat saya” hanya pada perangkat pribadi.</p>
      </div>
    </section>
  </main>;
}
