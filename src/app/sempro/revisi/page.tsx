import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { database } from "@/lib/db";
import { WorkspaceShell } from "@/components/workspace-shell";
import { SupportForm } from "@/components/support-form";

export const dynamic = "force-dynamic";
export default async function SemproRevisionsPage() {
  const session = await requireSession();
  if (!session.user.dosen || !["dosen", "kaprodi", "sekpro"].includes(session.user.role)) notFound();
  const rows = await database().revisiDokumen.findMany({ where: { tipe: "sempro", status: "menunggu_persetujuan",
    beritaAcara: { hasil: "lulus_revisi", statusRevisi: "dalam_revisi", jadwal: { sempro: {
      OR: [{ idDosenPembimbingSempro: session.user.id }, { penguji: { some: { idDosenPenguji: session.user.id, nomorPenguji: 1, isPengganti: false } } }] },
    } } }, include: { mahasiswa: true, beritaAcara: { include: { revisiList: { orderBy: { versi: "desc" }, take: 1 } } } }, orderBy: { createdAt: "desc" } });
  const current = rows.filter((r) => r.beritaAcara.revisiList[0]?.id === r.id);
  return <WorkspaceShell session={session}><h1 className="mb-5 text-3xl font-bold">Review revisi seminar proposal</h1>
    <p className="mb-5">Pembimbing seminar atau Penguji 1 dapat menyelesaikan review revisi sempro. Persetujuan ini berbeda dari persetujuan per penilai pada sidang.</p>
    <section className="space-y-5">{current.map((r) => <article key={String(r.id)} className="panel space-y-4"><h2 className="text-xl font-semibold">{r.mahasiswa.nama} · Versi {r.versi}</h2><p>{r.catatanMahasiswa}</p>
      <a className="block underline" href={`/sempro/revisi-draft/${r.id}`}>Buka naskah revisi</a>
      <SupportForm command="sempro-review-revision" values={{ revisiId: String(r.id) }} label="Simpan review revisi"><label>Keputusan<select name="status"><option value="disetujui">Disetujui</option><option value="ditolak">Ditolak</option></select></label><label>Alasan jika ditolak<textarea name="reason" minLength={5} maxLength={1000} /></label></SupportForm>
    </article>)}{!current.length && <p className="panel">Tidak ada revisi sempro yang menunggu review Anda.</p>}</section>
  </WorkspaceShell>;
}
