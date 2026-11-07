import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { AcademicForm, AdministrationEditor } from "@/components/academic-forms";
import { database } from "@/lib/db";
import { academicViewer, timestamp } from "@/lib/academic/views";
import { pageNumber } from "@/lib/accounts/views";
import Link from "next/link";

export const dynamic = "force-dynamic";
export default async function AdministrationPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { session, actor, finance } = await academicViewer();
  if (actor.role !== "mahasiswa" && !finance) notFound();
  const page = pageNumber((await searchParams).page);
  const rows = await database().verifikasiPembayaran.findMany({ where: finance ? {} : { idMahasiswa: actor.id },
    include: { mahasiswa: { select: { nama: true, mahasiswa: { select: { nim: true } } } } }, orderBy: { id: "desc" }, take: 21, skip: (page - 1) * 20 });
  return <WorkspaceShell session={session}><h1 className="mb-3 text-3xl font-bold">Administrasi skripsi</h1>
    <p className="mb-6 text-slate-600">Kwitansi, bukti transfer, dan KRS/SKA diverifikasi oleh Admin Keuangan aktif. Riwayat periode sebelumnya tetap tersedia.</p>
    {actor.role === "mahasiswa" && <section className="panel mb-6"><h2 className="mb-4 text-xl font-semibold">Ajukan berkas administrasi</h2><AdministrationEditor sender={rows[0]?.namaPengirim ?? ""} date={rows[0]?.tanggalTransfer?.toISOString().slice(0, 10)} /></section>}
    <section className="space-y-5">{rows.slice(0, 20).map((row) => <article key={String(row.id)} className="panel space-y-4">
      <h2 className="text-lg font-semibold">{row.mahasiswa.nama} · {row.mahasiswa.mahasiswa?.nim ?? "NIM arsip"}</h2>
      <p>{row.statusVerifikasi.replaceAll("_", " ")} {row.perluVerifikasiUlang && "· Perlu verifikasi ulang"}</p>
      <p className="text-sm text-slate-600">{row.periode ?? "Periode legacy"} · Siklus {row.siklusKe} · {timestamp(row.createdAt)}</p>
      <p>Pengirim {row.namaPengirim} · {row.tanggalTransfer?.toISOString().slice(0, 10)}</p>
      {row.catatanPenolakan && <p className="rounded-lg bg-amber-50 p-3">{row.catatanPenolakan}</p>}
      <div className="flex flex-wrap gap-4">{[["kwitansi", row.fileKwitansi], ["transfer", row.fileBuktiTransfer], ["krs", row.fileKrsSka]].map(([kind, path]) => path && <a key={kind} className="underline" href={`/berkas/administrasi/${row.id}/${kind}`}>Unduh {kind}</a>)}</div>
      {!finance && (row.statusVerifikasi !== "terverifikasi" || row.perluVerifikasiUlang) && <details><summary>Hapus berkas untuk diperbaiki</summary><div className="mt-4 flex flex-wrap gap-4">{[["kwitansi", row.fileKwitansi], ["transfer", row.fileBuktiTransfer], ["krs", row.fileKrsSka]].map(([kind, path]) => path && <AcademicForm key={kind} command="remove-administration-file" id={String(row.id)} label={`Hapus ${kind}`}><input type="hidden" name="revision" value={row.revision} /><input type="hidden" name="file" value={kind ?? ""} /></AcademicForm>)}</div></details>}
      {finance && <div className="grid gap-5 sm:grid-cols-2"><AcademicForm command="approve-administration" id={String(row.id)} label="Verifikasi administrasi"><input type="hidden" name="revision" value={row.revision} /></AcademicForm><AcademicForm command="reject-administration" id={String(row.id)} label="Tolak / batalkan verifikasi"><input type="hidden" name="revision" value={row.revision} /><label>Alasan penolakan<textarea name="reason" required minLength={10} maxLength={1000} /></label></AcademicForm></div>}
    </article>)}{!rows.length && <p className="panel">Belum ada berkas administrasi.</p>}</section>
    <nav className="mt-5 flex gap-4" aria-label="Halaman administrasi">{page > 1 && <Link href={`?page=${page - 1}`}>Sebelumnya</Link>}{rows.length > 20 && <Link href={`?page=${page + 1}`}>Berikutnya</Link>}</nav>
  </WorkspaceShell>;
}
