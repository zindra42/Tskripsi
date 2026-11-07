import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { requireSession } from "@/lib/auth/session";
import { canManage } from "@/lib/accounts/policy";
import { pageNumber } from "@/lib/accounts/views";
import { database } from "@/lib/db";
import { WorkspaceShell } from "@/components/workspace-shell";
import { SidangForm } from "@/components/sidang-form";

export const dynamic = "force-dynamic";
export default async function SidangPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const session = await requireSession();
  const manager = canManage(session.user, session.activeRole);
  const student = session.user.role === "mahasiswa";
  const lecturer = Boolean(session.user.dosen && ["dosen", "kaprodi", "sekpro"].includes(session.user.role));
  if (!manager && !student && !lecturer) notFound();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const q = (params.q ?? "").slice(0, 100);
  const actor = session.user.id;
  const scope: Prisma.PendaftaranSidangWhereInput = manager ? {} : student ? { pengajuan: { idMahasiswa: actor } } : {
    OR: [{ pengajuan: { bimbingan: { OR: [{ idDosenPembimbing: actor }, { idDosenPembimbing2: actor }] } } },
      { penguji: { some: { idDosenPenguji: actor } } }, { jadwalList: { some: { konfirmasiList: { some: { dosenId: actor } } } } }],
  };
  const rows = await database().pendaftaranSidang.findMany({ where: { AND: [scope, q ? { pengajuan: { OR: [
    { judul: { contains: q, mode: "insensitive" } }, { mahasiswa: { nama: { contains: q, mode: "insensitive" } } }] } } : {}] },
    include: { pengajuan: { include: { mahasiswa: true } }, jadwalList: { take: 1, orderBy: { id: "desc" }, include: { beritaAcaraList: true } } },
    orderBy: { id: "desc" }, take: 21, skip: (page - 1) * 20 });
  return <WorkspaceShell session={session}><h1 className="mb-5 text-3xl font-bold">Sidang dan revisi akhir</h1>
    <p className="mb-5 text-slate-600">Pendaftaran, verifikasi berkas, dewan sidang, nilai, hasil resmi, dan perbaikan naskah.</p>
    <details className="panel mb-6"><summary className="cursor-pointer font-semibold">Template acuan dokumen sidang</summary><ul className="mt-4 space-y-2">{[["acc", "Lembar ACC"], ["undangan", "Undangan"], ["form-nilai", "Form penilaian"], ["rekap", "Rekap nilai"], ["berita-acara", "Berita acara"]].map(([kind, label]) => <li key={kind}><a className="underline" href={`/sidang/templates/${kind}`}>{label}</a> - <a className="underline" href={`/sidang/templates/${kind}?download=1`}>Unduh {label.toLowerCase()}</a></li>)}</ul></details>
    {manager && <section className="panel mb-6"><h2 className="mb-3 font-semibold">Pengingat pelaksanaan</h2><p className="mb-4 text-sm">Proses pengingat H-7, H-3, dan H-1 untuk jadwal aktif. Pengingat yang sama tidak dikirim dua kali.</p><SidangForm command="process-reminders" label="Proses pengingat sidang" /></section>}
    {student && <section className="panel mb-6"><h2 className="mb-3 text-lg font-semibold">Mulai pendaftaran</h2><p className="mb-4">Sempro harus lulus dan revisinya selesai. ACC Sidang diperlukan dari seluruh pembimbing sebelum pengajuan.</p><SidangForm command="initialize" label="Buka atau buat draf sidang" /></section>}
    <form className="panel mb-5 flex flex-wrap items-end gap-4"><label className="grow">Cari mahasiswa atau judul<input name="q" maxLength={100} defaultValue={q} /></label><button className="button">Cari</button></form>
    <section className="space-y-4">{rows.slice(0, 20).map((r) => <article key={String(r.id)} className="panel"><h2 className="text-lg font-semibold"><Link className="underline" href={`/sidang/${r.id}`}>{r.pengajuan.mahasiswa.nama}</Link></h2><p className="my-2">{r.pengajuan.judul}</p><p className="text-sm text-slate-600">Siklus {r.siklusKe} · Berkas: {r.statusBerkas.replaceAll("_", " ")} · {r.jadwalList[0]?.beritaAcaraList[0]?.hasil?.replaceAll("_", " ") ?? r.jadwalList[0]?.status.replaceAll("_", " ") ?? "Belum dijadwalkan"}</p></article>)}{!rows.length && <p className="panel">Belum ada pendaftaran sidang untuk area Anda.</p>}</section>
    <nav aria-label="Halaman sidang" className="mt-5 flex gap-4">{page > 1 && <Link href={`?page=${page - 1}&q=${encodeURIComponent(q)}`}>Sebelumnya</Link>}{rows.length > 20 && <Link href={`?page=${page + 1}&q=${encodeURIComponent(q)}`}>Berikutnya</Link>}</nav>
  </WorkspaceShell>;
}
