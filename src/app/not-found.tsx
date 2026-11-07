import Link from "next/link";

export default function NotFound() {
  return <main id="konten" className="mx-auto max-w-lg px-6 py-20"><section className="panel">
    <h1 className="text-2xl font-bold">Halaman tidak tersedia</h1>
    <p className="my-5 text-slate-600">Halaman belum tersedia atau akun Anda tidak memiliki akses ke area ini.</p>
    <Link href="/dashboard" className="button">Kembali ke area kerja</Link>
  </section></main>;
}
