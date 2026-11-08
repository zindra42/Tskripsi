import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { AcademicForm, TitleEditor } from "@/components/academic-forms";
import { ResearchMatrix } from "@/components/research-matrix";
import { database } from "@/lib/db";
import { getCachedSystemSettings } from "@/lib/support/master-data";
import { pageNumber } from "@/lib/accounts/views";
import { academicViewer, initialMatrix, routeId, timestamp, titleOptions } from "@/lib/academic/views";
import { canReadTitle, currentTitle, isAssigned } from "@/lib/academic/policy";
import { getJenisDokumenLabel } from "@/lib/documents/labels";

export const dynamic = "force-dynamic";
export default async function GuidanceDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { session, actor, manager, kaprodi } = await academicViewer();
  const id = routeId((await params).id);
  const page = pageNumber((await searchParams).page);
  const b = await database().bimbingan.findUnique({ where: { id }, include: { pengajuan: true,
    pembimbing1: { select: { nama: true } }, pembimbing2: { select: { nama: true } },
    logbook: { orderBy: { id: "desc" }, take: 21, skip: (page - 1) * 20 },
    schedules: { where: { deletedAt: null }, orderBy: { id: "desc" }, take: 21, skip: (page - 1) * 20 },
    changes: { orderBy: { id: "desc" }, take: 21, skip: (page - 1) * 20 },
    documents: { where: { jenisDokumen: { in: ["acc", "acc_sidang"] } }, orderBy: { id: "desc" }, take: 21, skip: (page - 1) * 20 },
  } });
  if (!b || b.pengajuan.deletedAt || !canReadTitle(actor, session.activeRole, b.pengajuan, b)) notFound();
  const owner = actor.role === "mahasiswa" && b.pengajuan.idMahasiswa === actor.id;
  const supervisor = Boolean(actor.dosen && ["dosen", "kaprodi", "sekpro"].includes(actor.role) && isAssigned(actor.id, b));
  const writable = currentTitle(b.pengajuan) && b.pengajuan.status === "disetujui";
  const [settings, options, count] = await Promise.all([getCachedSystemSettings(), owner ? titleOptions() : null,
    database().logbookBimbingan.count({ where: { idBimbingan: id, fase: "sempro", statusSelesai: true, isDibatalkan: false } }),
  ]);
  const supervisors = [[b.idDosenPembimbing, b.pembimbing1?.nama], [b.idDosenPembimbing2, b.pembimbing2?.nama]] as const;
  const phaseInput = <label>Fase<select name="fase"><option value="sempro">Seminar proposal</option>{b.faseSkripsiAt && <option value="skripsi">Skripsi</option>}</select></label>;
  const matrices = Array.isArray(b.pengajuan.matriksPenelitian) ? b.pengajuan.matriksPenelitian.map((row) => initialMatrix([row])) : undefined;
  const reasonInput = <label>Catatan / alasan<textarea name="reason" required minLength={5} maxLength={1000} /></label>;
  return <WorkspaceShell session={session}><Link href="/bimbingan" className="underline">Kembali ke bimbingan</Link>
    <section className="panel mt-5 space-y-3"><h1 className="text-2xl font-bold">{b.pengajuan.judul}</h1><p>{b.pembimbing1?.nama ?? "Menunggu pembimbing utama"} · {b.pembimbing2?.nama ?? "Tanpa pembimbing kedua"}</p>
      <p>Siklus {b.siklusKe} · Sesi sempro selesai {count}/{settings.minimal_sesi_bimbingan_acc_sempro || "7"} · {writable ? "Aktif" : "Arsip"}</p><Link href={`/judul/${b.idPengajuan}`} className="inline-block underline">Rincian judul dan proposal</Link>
      {(b.pembatalanP1 || b.pembatalanP2) && <details><summary>Riwayat pembatalan pembimbing</summary><pre className="overflow-auto whitespace-pre-wrap text-sm">{JSON.stringify({ pembimbing1: b.pembatalanP1, pembimbing2: b.pembatalanP2 }, null, 2)}</pre></details>}
    </section>
    {writable && manager && <details className="panel mt-5"><summary>Pembatalan penetapan pembimbing</summary><div className="mt-4 grid gap-5 sm:grid-cols-2">{supervisors.map(([dosenId, name], index) => dosenId && <AcademicForm key={index} command="cancel-supervisor" id={String(id)} label={`Batalkan ${name}`}><input type="hidden" name="slot" value={index + 1} />{reasonInput}</AcademicForm>)}</div></details>}
    {writable && (owner || supervisor) && <details className="panel mt-5"><summary className="font-semibold">Catat sesi bimbingan</summary><div className="mt-4"><AcademicForm command="add-log" id={String(id)} label="Simpan sesi">
      <label>Tanggal sesi<input type="date" name="tanggal" required /></label>{phaseInput}
      {owner && <label>Dosen pembimbing<select name="dosenId" required>{supervisors.map(([dosenId, name]) => dosenId && <option key={String(dosenId)} value={String(dosenId)}>{name}</option>)}</select></label>}
      <label>Catatan sesi<textarea name="catatan" required minLength={3} maxLength={5000} /></label><label className="flex items-center gap-3"><input type="checkbox" name="selesai" className="h-5 w-5" />Konfirmasi sesi telah selesai</label>
    </AcademicForm></div></details>}
    <section className="panel mt-5"><h2 className="mb-4 text-xl font-semibold">Logbook</h2><div className="space-y-4">{b.logbook.slice(0, 20).map((row) => <article key={String(row.id)} className="rounded-xl border border-slate-200 p-4">
      <p className="font-semibold">{row.tanggal.toISOString().slice(0, 10)} · {row.fase} · Siklus {row.siklusKe} · {row.isDibatalkan ? "Dibatalkan" : row.statusSelesai ? "Selesai" : "Berjalan"}</p><p className="mt-2 whitespace-pre-wrap">{row.catatan}</p>
      {row.catatanMahasiswa && <p className="mt-2">Catatan mahasiswa {row.catatanMahasiswa}</p>}{row.isDibatalkan && <p className="mt-2 text-sm">{row.alasanPembatalan} · Pelaku {String(row.dibatalkanOlehId ?? "—")} · {timestamp(row.dibatalkanAt)}</p>}
      {writable && !row.isDibatalkan && row.siklusKe === b.siklusKe && <div className="mt-4 grid gap-4 sm:grid-cols-2">{owner && <AcademicForm command="note-log" id={String(row.id)} label="Simpan catatan mahasiswa"><label>Catatan saya<textarea name="catatan" required minLength={3} maxLength={1000} defaultValue={row.catatanMahasiswa ?? ""} /></label></AcademicForm>}
        {(supervisor || kaprodi) && <AcademicForm command="cancel-log" id={String(row.id)} label="Batalkan sesi">{reasonInput}</AcademicForm>}</div>}
    </article>)}{!b.logbook.length && <p>Belum ada sesi bimbingan.</p>}</div></section>
    <section className="panel mt-5"><h2 className="mb-4 text-xl font-semibold">ACC bimbingan</h2><div className="space-y-3">{b.documents.slice(0, 20).map((doc) => <p key={String(doc.id)}>{doc.namaPenandatangan} · {getJenisDokumenLabel(doc.jenisDokumen)} {doc.jenisDokumen === "acc_sidang" && doc.status === "sah" && <a className="underline" href={`/api/sidang/dokumen/${doc.token}`}>Unduh ACC Sidang</a>} · {doc.status} · Versi {doc.versi} · {timestamp(doc.diterbitkanAt)}</p>)}{!b.documents.length && <p>ACC belum diterbitkan.</p>}</div>
      {writable && supervisor && <div className="mt-5 grid gap-5 sm:grid-cols-2"><AcademicForm command="issue-acc" id={String(id)} label="Terbitkan ACC">{phaseInput}</AcademicForm><AcademicForm command="revoke-acc" id={String(id)} label="Cabut ACC">{phaseInput}{reasonInput}</AcademicForm></div>}
    </section>
    {writable && supervisor && <details className="panel mt-5"><summary className="font-semibold">Buat jadwal bimbingan</summary><div className="mt-4"><AcademicForm command="schedule" id={String(id)} label="Kirim jadwal">
      <label>Mulai (WITA)<input type="datetime-local" name="mulai" required /></label><label>Selesai (WITA)<input type="datetime-local" name="selesai" required /></label><label>Lokasi / tautan pertemuan<input name="lokasi" required maxLength={255} /></label><label>Catatan<textarea name="catatan" maxLength={1000} /></label>
    </AcademicForm></div></details>}
    <section className="panel mt-5"><h2 className="mb-4 text-xl font-semibold">Jadwal bimbingan</h2><div className="space-y-4">{b.schedules.slice(0, 20).map((row) => <article className="rounded-xl border border-slate-200 p-4" key={String(row.id)}><p className="font-semibold">{timestamp(row.waktuMulai)} hingga {timestamp(row.waktuSelesai)} WITA</p><p>{row.lokasi} · {row.status.replaceAll("_", " ")}</p><p>{row.catatan}</p>{row.alasanReschedule && <p className="mt-2">{row.alasanReschedule} · Usulan {timestamp(row.usulanWaktuReschedule)}</p>}
      {writable && !["selesai", "dibatalkan"].includes(row.status) && <div className="mt-4 space-y-5">{owner && <>
        <AcademicForm command="confirm-schedule" id={String(row.id)} label="Konfirmasi hadir" /><AcademicForm command="reschedule" id={String(row.id)} label="Minta jadwal ulang">{reasonInput}<label>Usulan waktu (WITA)<input name="usulan" type="datetime-local" /></label></AcademicForm>
      </>}{supervisor && <>
        <AcademicForm command="complete-schedule" id={String(row.id)} label="Selesaikan jadwal" /><AcademicForm command="cancel-schedule" id={String(row.id)} label="Batalkan jadwal" />
        {row.dosenId === actor.id && <details><summary>Ubah jadwal</summary><AcademicForm command="edit-schedule" id={String(row.id)} label="Simpan jadwal baru"><label>Mulai (WITA)<input type="datetime-local" name="mulai" required /></label><label>Selesai (WITA)<input type="datetime-local" name="selesai" required /></label><label>Lokasi<input name="lokasi" required maxLength={255} defaultValue={row.lokasi} /></label><label>Catatan<textarea name="catatan" maxLength={1000} defaultValue={row.catatan ?? ""} /></label></AcademicForm></details>}
      </>}</div>}
    </article>)}{!b.schedules.length && <p>Belum ada jadwal bimbingan.</p>}</div></section>
    {writable && owner && options && <details className="panel mt-5"><summary className="font-semibold">Ajukan perubahan judul</summary><div className="mt-5"><TitleEditor fields={options.fields} lecturers={[]} matrices={matrices} initial={initialMatrix(b.pengajuan.matriksPenelitian)} changeId={String(id)} /></div></details>}
    <section className="panel mt-5"><h2 className="mb-4 text-xl font-semibold">Riwayat perubahan judul</h2><div className="space-y-5">{b.changes.slice(0, 20).map((row) => <article className="rounded-xl border border-slate-200 p-4" key={String(row.id)}><h3 className="font-semibold">{row.judulBaru}</h3><p className="mt-2">{row.judulLama} → {row.judulBaru}</p><p>{row.jenisPerubahan} · {row.status.replaceAll("_", " ")} · Kemiripan {row.skorKemiripan}%</p><p>{row.alasan}</p><p>Pembimbing 1 {row.disetujuiDospem1 ? "setuju" : "menunggu"} · Pembimbing 2 {row.disetujuiDospem2 ? "setuju" : "menunggu"}</p><p>{row.catatanDospem} {row.catatanKaprodi}</p>
      {(supervisor || manager) && row.catatanInternalDospem && <p className="mt-2 rounded-lg bg-amber-50 p-3">Catatan internal pembimbing {row.catatanInternalDospem}</p>}
      <details className="mt-3"><summary>Matriks lama dan baru</summary><h4 className="my-3 font-semibold">Matriks lama</h4><ResearchMatrix value={row.matriksLama} /><h4 className="my-3 font-semibold">Matriks baru</h4><ResearchMatrix value={row.matriksBaru} /></details>
      {writable && row.status === "menunggu_dospem" && supervisor && <div className="mt-4 grid gap-5 sm:grid-cols-2"><AcademicForm command="approve-change-supervisor" id={String(row.id)} label="Setujui sebagai pembimbing"><label>Catatan untuk mahasiswa<textarea name="reason" maxLength={1000} /></label><label>Catatan internal untuk pengelola<textarea name="internal" maxLength={5000} /></label></AcademicForm><AcademicForm command="reject-change-supervisor" id={String(row.id)} label="Tolak perubahan">{reasonInput}</AcademicForm></div>}
      {writable && row.status === "menunggu_kaprodi" && manager && <div className="mt-4 grid gap-5 sm:grid-cols-2"><AcademicForm command="approve-change-final" id={String(row.id)} label="Setujui perubahan final"><label>Catatan pengelola<textarea name="reason" maxLength={1000} /></label></AcademicForm><AcademicForm command="reject-change-final" id={String(row.id)} label="Tolak perubahan final">{reasonInput}</AcademicForm></div>}
    </article>)}{!b.changes.length && <p>Belum ada pengajuan perubahan judul.</p>}</div></section>
    <nav className="mt-5 flex gap-4" aria-label="Halaman riwayat bimbingan">{page > 1 && <Link href={`?page=${page - 1}`}>Sebelumnya</Link>}{[b.logbook, b.schedules, b.documents, b.changes].some((rows) => rows.length > 20) && <Link href={`?page=${page + 1}`}>Berikutnya</Link>}</nav>
  </WorkspaceShell>;
}
