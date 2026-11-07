import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getPendaftaranSemproView } from "@/lib/sempro/views";
import {
  UnggahRevisiForm,
  DispensasiForm,
} from "@/components/sempro-forms";
import { getKualifikasiKehadiran } from "@/lib/sempro/attendance";

export const dynamic = "force-dynamic";

export default async function SemproStatusPage() {
  const session = await requireSession();
  const pengajuan = await getPendaftaranSemproView(session);

  if (!pengajuan || !pengajuan.sempro) {
    return (
      <WorkspaceShell session={session}>
        <div className="panel p-6">
          <h1 className="text-2xl font-bold text-slate-800">Status Seminar Proposal</h1>
          <p className="mt-4 text-slate-600">
            Anda belum mendaftar seminar proposal.
          </p>
          <Link href="/sempro/pendaftaran" className="mt-4 inline-block text-sky-700 underline">
            Daftar Seminar Proposal
          </Link>
        </div>
      </WorkspaceShell>
    );
  }

  const sempro = pengajuan.sempro;
  const jadwal = sempro.jadwal;
  const ba = jadwal?.beritaAcara;

  const attendanceStats = await getKualifikasiKehadiran(sempro.id);

  return (
    <WorkspaceShell session={session}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Status Seminar Proposal</h1>
          <p className="text-sm text-slate-500">
            Pantau jadwal, hasil kelulusan, dan status revisi seminar proposal Anda.
          </p>
        </div>

        {/* Status Berkas & Pendaftaran */}
        <div className="panel space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800">Status Pendaftaran</h2>
            <span className="rounded bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
              {sempro.statusBerkas.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Judul: <strong className="text-slate-800">{pengajuan.judul}</strong>
          </p>
          <p className="text-xs text-slate-600">
            Dosen Pembimbing: {pengajuan.bimbingan?.pembimbing1?.nama ?? "-"}
          </p>
        </div>

        {/* Jadwal Pelaksanaan */}
        <div className="panel space-y-3 p-5">
          <h3 className="text-base font-semibold text-slate-800">Jadwal Seminar Proposal</h3>
          {jadwal && jadwal.tanggal ? (
            <div className="space-y-2 text-xs text-slate-700">
              <p>
                <strong>Tanggal:</strong> {new Date(jadwal.tanggal).toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </p>
              <p>
                <strong>Waktu:</strong> {jadwal.waktuMulai} - {jadwal.waktuSelesai} WITA
              </p>
              <p>
                <strong>Ruangan:</strong> {jadwal.ruang}
              </p>
              <p>
                <strong>Status Jadwal:</strong>{" "}
                <span className="font-semibold text-sky-700">{jadwal.status.toUpperCase()}</span>
              </p>

              {/* Download Surat Undangan */}
              {jadwal.documents?.length > 0 && (
                <div className="mt-3">
                  <a
                    href={`/api/sempro/dokumen/${jadwal.documents[0].token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded bg-sky-700 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-sky-800"
                  >
                    📄 Unduh Surat Undangan Resmi (PDF Ber-QR)
                  </a>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Jadwal pelaksanaan seminar proposal belum ditentukan oleh program studi.
            </p>
          )}
        </div>

        {/* Kualifikasi Kehadiran Seminar Lain */}
        <div className="panel space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">Syarat Kehadiran Seminar Lain</h3>
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${
                attendanceStats.statusFinal === "memenuhi" || attendanceStats.statusFinal === "dispensasi_disetujui"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {attendanceStats.statusFinal.toUpperCase()}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded border border-slate-200 p-2">
              <div className="text-lg font-bold text-slate-800">{attendanceStats.terkumpulFinal}</div>
              <div className="text-slate-500">Hadir Tercatat</div>
            </div>
            <div className="rounded border border-slate-200 p-2">
              <div className="text-lg font-bold text-slate-800">{attendanceStats.syaratFinal}</div>
              <div className="text-slate-500">Syarat Minimum</div>
            </div>
            <div className="rounded border border-slate-200 p-2">
              <div className="text-lg font-bold text-slate-800">{attendanceStats.nFinal}</div>
              <div className="text-slate-500">Total Seminar Digelar</div>
            </div>
          </div>

          {attendanceStats.statusFinal === "belum_memenuhi" && (
            <div className="mt-2">
              <DispensasiForm pendaftaranId={String(sempro.id)} />
            </div>
          )}
        </div>

        {/* Hasil Kelulusan & Berita Acara */}
        {ba && (
          <div className="panel space-y-4 p-5">
            <h3 className="text-base font-semibold text-slate-800">Hasil Keputusan Seminar</h3>
            <div className="space-y-2 text-xs text-slate-700">
              <p>
                <strong>Status Kelulusan:</strong>{" "}
                <span className="font-bold text-slate-900">
                  {ba.hasil ? ba.hasil.toUpperCase() : "MENUNGGU PENGESAHAN KAPRODI"}
                </span>
              </p>
              {ba.nilai && (
                <p>
                  <strong>Nilai Akhir:</strong> {Number(ba.nilai).toFixed(2)}
                </p>
              )}
              {ba.catatanRevisi && (
                <p>
                  <strong>Catatan Dewan Penguji:</strong> {ba.catatanRevisi}
                </p>
              )}
              {ba.tenggatRevisi && (
                <p>
                  <strong>Tenggat Revisi:</strong>{" "}
                  {new Date(ba.tenggatRevisi).toLocaleDateString("id-ID")}
                </p>
              )}
            </div>

            {/* Unggah revisi jika lulus_revisi */}
            {ba.hasil === "lulus_revisi" && (
              <div className="border-t border-slate-200 pt-4">
                <UnggahRevisiForm beritaAcaraId={String(ba.id)} />
              </div>
            )}
          </div>
        )}
      </div>
    </WorkspaceShell>
  );
}
