import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { AcademicForm } from "@/components/academic-forms";
import { ResearchMatrix } from "@/components/research-matrix";
import { database } from "@/lib/db";
import { academicViewer, recommendations, routeId, storedIds, timestamp } from "@/lib/academic/views";
import { canReadTitle } from "@/lib/academic/policy";
import { getCachedSystemSettings } from "@/lib/support/master-data";
import { similarityWarning } from "@/lib/academic/similarity";

export const dynamic = "force-dynamic";
export default async function TitlePage({ params }: { params: Promise<{ id: string }> }) {
  const { session, actor, manager } = await academicViewer();
  const id = routeId((await params).id);
  const row = await database().pengajuanJudul.findUnique({ where: { id }, include: { bimbingan: true, mahasiswa: { select: { nama: true } } } });
  if (!row || row.deletedAt || !canReadTitle(actor, session.activeRole, row, row.bimbingan)) notFound();
  const suggestions = manager && row.status === "disetujui" ? await recommendations(row, row.bimbingan?.id) : [];
  const current = !row.isDiarsipkan && row.statusDraft === "diajukan";
  const pref = storedIds(row.preferensiDosenIds);
  const warning = similarityWarning(row.skorKemiripan, await getCachedSystemSettings());
  return <WorkspaceShell session={session}><Link href="/judul" className="underline">Kembali ke daftar judul</Link><article className="panel mt-5 space-y-4">
    <h1 className="text-2xl font-bold">{row.judul}</h1><p>{row.mahasiswa.nama} · {row.status} · {row.statusDraft} {row.isDiarsipkan && "· Diarsipkan"}</p>
    <p>{row.periodeAkademikSaatPengajuan} · Semester {row.semesterSaatPengajuan} · Siklus {row.siklusKe} · Pengajuan ke-{row.counterPengajuan}</p>
    <p className="text-sm text-slate-600">{timestamp(row.tanggalPengajuan)} · Pemeriksa {row.lastVerifierRole ?? "—"}</p>
    {row.fileProposal && <a className="inline-block underline" href={`/berkas/proposal/${row.id}/proposal`}>Unduh proposal PDF</a>}
    {pref.length > 0 && <p>Preferensi ID pembimbing {pref.join(", ")}</p>}
    <h2 className="text-lg font-semibold">Matriks penelitian</h2><ResearchMatrix value={row.matriksPenelitian} />
    <h2 className="text-lg font-semibold">Kemiripan {row.skorKemiripan ?? "Belum diperiksa"}%</h2><p>{row.judulTermirip} {row.penulisTermirip && `· ${row.penulisTermirip}`}</p>
    {row.skorKemiripan !== null && warning.high && <p role="status" className="rounded-lg bg-amber-50 p-3">Kemiripan mencapai ambang peringatan {warning.threshold}%. Tinjau hasil dan orisinalitas penelitian sebelum keputusan.</p>}
    <ul className="space-y-2">{Array.isArray(row.topKemiripan) && row.topKemiripan.map((match, index) => match && typeof match === "object" && !Array.isArray(match)
      ? <li key={index}>{String(match.judul ?? "Judul arsip")} · {String(match.skor ?? 0)}% · {String(match.penulis ?? "")}</li> : null)}</ul>
    {row.catatanKaprodi && <p className="rounded-lg bg-amber-50 p-3">{row.catatanKaprodi}</p>}
    {row.isDiarsipkan && <p>Diarsipkan {timestamp(row.diarsipkanAt)}. {row.alasanArsip}</p>}
    {row.bimbingan && <Link className="inline-block font-semibold underline" href={`/bimbingan/${row.bimbingan.id}`}>Buka bimbingan dan logbook</Link>}
  </article>
    {current && manager && <section className="panel mt-6 grid gap-6 sm:grid-cols-2"><AcademicForm command="approve-title" id={String(id)} label="Setujui judul" />
      <AcademicForm command="revise-title" id={String(id)} label="Minta revisi"><label>Arahan revisi<textarea name="reason" required minLength={10} maxLength={1000} /></label></AcademicForm>
      <AcademicForm command="cancel-title" id={String(id)} label="Batalkan persetujuan"><label>Alasan pembatalan<textarea name="reason" required minLength={5} maxLength={1000} /></label></AcademicForm>
      {actor.role === "superadmin" && <AcademicForm command="archive-title" id={String(id)} label="Arsipkan judul"><label>Alasan arsip<textarea name="reason" required minLength={5} maxLength={1000} /></label></AcademicForm>}
    </section>}
    {current && actor.id === row.idMahasiswa && row.status === "diajukan" && <section className="panel mt-6"><AcademicForm command="cancel-title" id={String(id)} label="Batalkan pengajuan saya" /></section>}
    {current && manager && row.status === "disetujui" && <section className="panel mt-6"><h2 className="mb-4 text-xl font-semibold">Rekomendasi dan penetapan pembimbing</h2>
      <ul className="mb-5 space-y-3">{suggestions.filter((dosen) => dosen.remaining > 0).map((dosen) => <li key={dosen.id}>{dosen.nama} · Skor {dosen.score} · Sisa kuota {dosen.remaining}<p className="text-sm text-slate-600">{dosen.expertise}</p></li>)}</ul>
      <AcademicForm command="assign" id={String(id)} label="Tetapkan pembimbing"><div className="grid gap-4 sm:grid-cols-2">{[1, 2].map((slot) => <label key={slot}>Pembimbing {slot}<select name="supervisors" required={slot === 1} defaultValue={String(slot === 1 ? row.bimbingan?.idDosenPembimbing ?? "" : row.bimbingan?.idDosenPembimbing2 ?? "")}><option value="">{slot === 1 ? "Pilih pembimbing utama" : "Tanpa pembimbing kedua"}</option>{suggestions.map((dosen) => <option key={dosen.id} value={dosen.id}>{dosen.nama} · {dosen.remaining} kuota</option>)}</select></label>)}</div></AcademicForm>
    </section>}
  </WorkspaceShell>;
}
