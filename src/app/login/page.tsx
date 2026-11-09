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
  return <main id="konten" className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
    {/* Left panel – branding */}
    <section className="relative hidden flex-col justify-between overflow-hidden bg-[#14213d] p-10 text-white lg:flex xl:p-14">
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/[0.03]" />
      <div aria-hidden="true" className="pointer-events-none absolute bottom-20 -left-16 h-56 w-56 rounded-full bg-[#fca311]/10" />

      <div className="relative flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fca311] text-base font-bold text-[#14213d]" aria-hidden="true">S</span>
        <div>
          <p className="text-base font-bold tracking-wide leading-none">SIAS</p>
          <p className="text-xs text-slate-400 mt-0.5">Universitas Teknologi Sumbawa</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <p className="mb-3 text-xs font-semibold tracking-widest text-[#fca311] uppercase">Sistem Informasi Akademik Skripsi</p>
        <h1 className="text-3xl font-bold leading-snug tracking-tight xl:text-4xl">
          Satu akses untuk<br />perjalanan skripsi Anda.
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-slate-300">
          Masuk untuk membuka area kerja sesuai peran dan kewenangan akun Anda.
        </p>
      </div>

      <p className="relative text-xs text-slate-400">Program Studi Informatika &middot; Universitas Teknologi Sumbawa</p>
    </section>

    {/* Right panel – login form */}
    <section className="flex items-center justify-center bg-[#f1f4f9] px-6 py-14 sm:px-12">
      <div className="w-full max-w-sm">
        {/* Mobile brand mark */}
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#14213d] text-sm font-bold text-[#fca311]">S</span>
          <div>
            <p className="text-sm font-bold text-[#14213d]">SIAS</p>
            <p className="text-xs text-slate-500">Universitas Teknologi Sumbawa</p>
          </div>
        </div>

        <p className="mb-1 text-[10px] font-bold tracking-widest text-slate-400 uppercase">Portal SIAS</p>
        <h2 className="mb-1.5 text-2xl font-bold tracking-tight text-[#14213d]">Selamat datang kembali</h2>
        <p className="mb-7 text-sm text-slate-500">Silakan masuk menggunakan akun Anda.</p>

        {params.session === "expired" && (
          <p role="status" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Sesi telah berakhir. Silakan masuk kembali.
          </p>
        )}

        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <LoginForm />
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-slate-400">
          Sesi berakhir setelah 5 menit tanpa aktivitas.<br />
          Pilih &ldquo;ingat saya&rdquo; hanya pada perangkat pribadi.
        </p>
      </div>
    </section>
  </main>;
}
