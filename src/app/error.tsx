"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="konten" className="mx-auto max-w-lg px-6 py-20"><section className="panel">
    <h1 className="text-2xl font-bold">Layanan belum tersedia</h1>
    <p className="my-5 text-slate-600">Halaman belum dapat dimuat. Silakan coba kembali atau hubungi pengelola SIAS.</p>
    <button onClick={reset} className="button">Coba kembali</button>
  </section></main>;
}
