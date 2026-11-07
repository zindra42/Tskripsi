import { requireSession } from "@/lib/auth/session";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getKehadiranSemproView } from "@/lib/sempro/views";
import { CatatKehadiranForm } from "@/components/sempro-forms";
import { canManage } from "@/lib/accounts/policy";

export const dynamic = "force-dynamic";

export default async function SemproKehadiranPage() {
  const session = await requireSession();
  const activeSchedules = await getKehadiranSemproView(session);
  const isManager = canManage(session.user, session.activeRole);
  const isStudent = session.user.role === "mahasiswa";

  return (
    <WorkspaceShell session={session}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Kehadiran Seminar Proposal</h1>
          <p className="text-sm text-slate-500">
            Daftar seminar proposal yang berlangsung dan pencatatan presensi kehadiran peserta seminar.
          </p>
        </div>

        {activeSchedules.length === 0 ? (
          <div className="panel p-6 text-center text-xs text-slate-500">
            Tidak ada seminar proposal yang sedang berlangsung atau terjadwal saat ini.
          </div>
        ) : (
          <div className="space-y-6">
            {activeSchedules.map((jadwal) => {
              const sempro = jadwal.sempro!;
              const isOwnSempro = sempro.pengajuan.idMahasiswa === session.user.id;
              const hasAttended = jadwal.kehadiranList.some(
                (k: { idMahasiswa: bigint }) => k.idMahasiswa === session.user.id,
              );

              return (
                <div key={String(jadwal.id)} className="panel space-y-4 p-5">
                  <div className="border-b border-slate-100 pb-3">
                    <h2 className="text-base font-bold text-slate-800">
                      Pemateri: {sempro.pengajuan.mahasiswa.nama}
                    </h2>
                    <p className="text-xs text-slate-600 font-medium">
                      Judul: {sempro.pengajuan.judul}
                    </p>
                    <p className="text-xs text-slate-500">
                      Waktu: {jadwal.tanggal ? new Date(jadwal.tanggal).toLocaleDateString("id-ID") : "-"} ·{" "}
                      {jadwal.waktuMulai} - {jadwal.waktuSelesai} WITA · Ruang: {jadwal.ruang}
                    </p>
                  </div>

                  {/* Mahasiswa peserta form selfie */}
                  {isStudent && !isOwnSempro && (
                    <div className="rounded border border-slate-100 bg-slate-50/50 p-3 text-xs">
                      {hasAttended ? (
                        <p className="font-semibold text-emerald-700">
                          ✓ Anda telah mencatatkan kehadiran pada seminar proposal ini.
                        </p>
                      ) : (
                        <CatatKehadiranForm jadwalId={String(jadwal.id)} />
                      )}
                    </div>
                  )}

                  {/* Daftar Peserta Hadir (Manager/Lecturer view) */}
                  {(isManager || !isStudent) && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-slate-700">
                        Daftar Peserta Hadir ({jadwal.kehadiranList.length})
                      </h4>
                      {jadwal.kehadiranList.length === 0 ? (
                        <p className="text-xs text-slate-400">Belum ada peserta yang hadir.</p>
                      ) : (
                        <div className="divide-y divide-slate-100 rounded border border-slate-200">
                          {jadwal.kehadiranList.map((k) => (
                            <div
                              key={String(k.id)}
                              className="flex items-center justify-between p-2.5 text-xs"
                            >
                              <div>
                                <p className="font-medium text-slate-800">{k.mahasiswa.nama}</p>
                                <p className="text-[11px] text-slate-500">
                                  {new Date(k.waktuAmbil).toLocaleTimeString("id-ID")} WITA ·{" "}
                                  {k.isManual ? "Manual (Prodi)" : "Selfie Foto"}
                                </p>
                              </div>
                              <span
                                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                                  k.status === "valid"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-rose-100 text-rose-800"
                                }`}
                              >
                                {k.status.toUpperCase()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </WorkspaceShell>
  );
}
