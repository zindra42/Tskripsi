import { requireSession } from "@/lib/auth/session";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getPenjadwalanSemproView } from "@/lib/sempro/views";
import {
  TetapkanPengujiForm,
  AturJadwalForm,
} from "@/components/sempro-forms";
import { canManage } from "@/lib/accounts/policy";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SemproJadwalPage() {
  const session = await requireSession();
  if (!canManage(session.user, session.activeRole)) {
    redirect(`/dashboard/${session.activeRole}`);
  }

  const { listSemproSiapJadwal, activeLecturers } = await getPenjadwalanSemproView();

  const formattedLecturers = activeLecturers.map((l) => ({
    id: String(l.id),
    nama: `${l.nama} (NIDN: ${l.dosen?.nidn ?? "-"})`,
  }));

  return (
    <WorkspaceShell session={session}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Penetapan Penguji & Jadwal Seminar</h1>
          <p className="text-sm text-slate-500">
            Tetapkan dua dosen penguji dan jadwalkan seminar proposal untuk pendaftaran yang telah lengkap.
          </p>
        </div>

        {listSemproSiapJadwal.length === 0 ? (
          <div className="panel p-6 text-center text-xs text-slate-500">
            Tidak ada pendaftaran seminar proposal dengan berkas lengkap yang siap dijadwalkan saat ini.
          </div>
        ) : (
          <div className="space-y-6">
            {listSemproSiapJadwal.map((sempro) => {
              const p1 = sempro.penguji.find((p) => p.nomorPenguji === 1);
              const p2 = sempro.penguji.find((p) => p.nomorPenguji === 2);
              const jadwal = sempro.jadwal;

              return (
                <div key={String(sempro.id)} className="panel space-y-4 p-5">
                  <div className="border-b border-slate-100 pb-3">
                    <h2 className="text-base font-bold text-slate-800">
                      {sempro.pengajuan.mahasiswa.nama}
                    </h2>
                    <p className="text-xs text-slate-600 font-medium">
                      Judul: {sempro.pengajuan.judul}
                    </p>
                    <p className="text-xs text-slate-500">
                      Pembimbing: {sempro.pengajuan.bimbingan?.pembimbing1?.nama ?? "-"}
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Status Penguji */}
                    <div className="space-y-2 rounded border border-slate-100 bg-slate-50/50 p-3 text-xs">
                      <h3 className="font-semibold text-slate-800">Dewan Penguji</h3>
                      <p>
                        <strong>Penguji 1 (Ketua):</strong> {p1?.dosen.nama ?? "Belum ditetapkan"}
                      </p>
                      <p>
                        <strong>Penguji 2 (Anggota):</strong> {p2?.dosen.nama ?? "Belum ditetapkan"}
                      </p>

                      <div className="mt-3">
                        <TetapkanPengujiForm
                          pendaftaranId={String(sempro.id)}
                          lecturers={formattedLecturers}
                        />
                      </div>
                    </div>

                    {/* Status Jadwal */}
                    <div className="space-y-2 rounded border border-slate-100 bg-slate-50/50 p-3 text-xs">
                      <h3 className="font-semibold text-slate-800">Jadwal & Ruang</h3>
                      {jadwal && jadwal.tanggal ? (
                        <div className="space-y-1">
                          <p>
                            <strong>Tanggal:</strong> {new Date(jadwal.tanggal).toLocaleDateString("id-ID")}
                          </p>
                          <p>
                            <strong>Waktu:</strong> {jadwal.waktuMulai} - {jadwal.waktuSelesai} WITA
                          </p>
                          <p>
                            <strong>Ruang:</strong> {jadwal.ruang}
                          </p>
                          <p>
                            <strong>Status:</strong>{" "}
                            <span className="font-semibold text-sky-700">{jadwal.status.toUpperCase()}</span>
                          </p>
                        </div>
                      ) : (
                        <p className="text-slate-500">Jadwal belum ditentukan.</p>
                      )}

                      <div className="mt-3">
                        <AturJadwalForm pendaftaranId={String(sempro.id)} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </WorkspaceShell>
  );
}
