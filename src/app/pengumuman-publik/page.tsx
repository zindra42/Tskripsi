import Link from "next/link";
import { AnnouncementText } from "@/components/announcement-text";
import { database } from "@/lib/db";
import { pageNumber } from "@/lib/accounts/views";

export const dynamic = "force-dynamic";
export default async function PublicAnnouncements({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = pageNumber((await searchParams).page), now = new Date();
  let rows: Awaited<ReturnType<ReturnType<typeof database>["pengumuman"]["findMany"]>> = [];
  let unavailable = false;
  try { rows = await database().pengumuman.findMany({ where: { deletedAt: null, status: "terbit", isPublik: true, AND: [
    { OR: [{ tampilMulai: null }, { tampilMulai: { lte: now } }] }, { OR: [{ tampilSelesai: null }, { tampilSelesai: { gte: now } }] },
  ] }, orderBy: [{ disematkan: "desc" }, { terbitAt: "desc" }, { id: "desc" }], take: 21, skip: (page - 1) * 20 }); }
  catch { unavailable = true; }
  return <main id="konten" className="mx-auto max-w-3xl space-y-5 p-6 sm:p-10"><Link className="underline" href="/login">Masuk SIAS</Link><h1 className="text-3xl font-bold">Pengumuman publik SIAS</h1>{unavailable ? <p role="status" className="panel">Layanan pengumuman belum tersedia. Silakan coba kembali nanti.</p> : !rows.length ? <p className="panel">Belum ada pengumuman publik.</p> : rows.slice(0, 20).map((r) => <article className="panel" key={String(r.id)}><p className="text-sm text-slate-600">{r.kategori}{r.disematkan ? " · Disematkan" : ""}</p><h2 className="my-3 text-xl font-semibold">{r.judul}</h2><AnnouncementText text={r.isi} />{r.lampiranPath && <a className="mt-4 block underline" href={`/api/pengumuman/${r.id}/lampiran`}>{r.lampiranNama ?? "Unduh lampiran"}</a>}</article>)}<nav aria-label="Halaman pengumuman publik" className="flex gap-4">{page > 1 && <Link href={`?page=${page - 1}`}>Sebelumnya</Link>}{rows.length > 20 && <Link href={`?page=${page + 1}`}>Berikutnya</Link>}</nav></main>;
}
