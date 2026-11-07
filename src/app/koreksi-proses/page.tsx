import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { WorkspaceShell } from "@/components/workspace-shell";
import { SidangForm } from "@/components/sidang-form";

export const dynamic = "force-dynamic";
export default async function CorrectionsPage() {
  const session = await requireSession();
  if (session.user.role !== "superadmin") notFound();
  return <WorkspaceShell session={session}><h1 className="mb-5 text-3xl font-bold">Koreksi proses</h1>
    <section className="panel mb-6"><h2 className="mb-4 text-xl font-semibold">Koreksi penugasan</h2>
      <p className="mb-5">Pilih satu slot. Kosongkan dosen pengganti untuk mencabut penugasan. Riwayat dosen lama tetap tersimpan.</p>
      <SidangForm command="correction" label="Simpan koreksi penugasan">
        <label>Penugasan<select name="correction"><option value="correct-supervisor">Pembimbing skripsi</option><option value="sempro-examiner">Penguji seminar proposal</option><option value="sidang-examiner">Penguji sidang</option></select></label>
        <label>Slot<select name="slot"><option value="1">1</option><option value="2">2</option></select></label>
        <div className="grid gap-4 sm:grid-cols-2">{[["bimbinganId", "ID bimbingan (pembimbing)"], ["semproId", "ID pendaftaran sempro (penguji sempro)"], ["id", "ID pendaftaran sidang (penguji sidang)"], ["dosenId", "ID dosen pengganti (kosong untuk mencabut)"]].map(([name, label]) => <label key={name}>{label}<input name={name} inputMode="numeric" pattern="[0-9]*" /></label>)}</div>
        <label>Alasan koreksi<textarea name="reason" minLength={5} maxLength={1000} required /></label>
      </SidangForm>
    </section>
    <section className="panel"><h2 className="mb-4 text-xl font-semibold">Sidang dan dokumen</h2><p className="mb-5">Seluruh koreksi menyimpan alasan, keadaan sebelum/sesudah, dan notifikasi. Nilai tidak dapat dibuka ulang setelah hasil resmi. Pergantian dewan ditolak setelah nilai tersimpan.</p><SidangForm command="correction" label="Jalankan koreksi"><label>Tindakan<select name="correction"><option value="sempro-reopen-score">Buka ulang nilai sempro sebelum hasil</option><option value="sempro-reissue-minutes">Terbitkan ulang berita acara sempro</option><option value="sempro-cancel-schedule">Batalkan jadwal sempro</option><option value="reopen-score">Buka ulang nilai sebelum hasil resmi</option><option value="reissue-minutes">Terbitkan ulang berita acara resmi</option><option value="revoke-document">Cabut dokumen</option><option value="replace-examiners">Koreksi dua penguji</option><option value="cancel-schedule">Batalkan jadwal sebelum penilaian</option></select></label><div className="grid gap-4 sm:grid-cols-2">{[["jadwalId", "ID jadwal sempro/sidang"], ["id", "ID pendaftaran sidang (koreksi penguji)"], ["versi", "Versi jadwal (pembatalan)"], ["dosenId", "ID penilai (buka ulang nilai)"], ["documentId", "ID dokumen (pencabutan)"], ["penguji1Id", "ID Penguji 1 baru"], ["penguji2Id", "ID Penguji 2 baru"]].map(([name, label]) => <label key={name}>{label}<input name={name} inputMode="numeric" pattern="[0-9]*" /></label>)}</div><label>Alasan koreksi<textarea name="reason" minLength={5} maxLength={1000} required /></label></SidangForm></section></WorkspaceShell>;
}
