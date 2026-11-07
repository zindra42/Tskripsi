import { requireSession } from "@/lib/auth/session";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getKonfirmasiJadwalDosenView } from "@/lib/sempro/views";
import {
  KonfirmasiJadwalForm,
  NilaiPengujiForm,
  NilaiPembimbingForm,
  KeputusanPenguji1Form,
} from "@/components/sempro-forms";

export const dynamic = "force-dynamic";

export default async function SemproKonfirmasiJadwalPage() {
  const session = await requireSession();
  const schedules = await getKonfirmasiJadwalDosenView(session);

  return (
    <WorkspaceShell session={session}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Konfirmasi Jadwal & Penilaian Sempro</h1>
          <p className="text-sm text-slate-500">
            Konfirmasi ketersediaan hadir, input penilaian rubrik seminar proposal, dan tetapkan keputusan dewan penguji.
          </p>
        </div>

        {schedules.length === 0 ? (
          <div className="panel p-6 text-center text-xs text-slate-500">
            Tidak ada penugasan seminar proposal aktif yang memerlukan tindakan Anda saat ini.
          </div>
        ) : (
          <div className="space-y-6">
            {schedules.map((jadwal) => {
              const sempro = jadwal.sempro!;
              const isDospem = sempro.idDosenPembimbingSempro === session.user.id;
              const p1 = sempro.penguji.find((p: { nomorPenguji: number | null }) => p.nomorPenguji === 1);
              const isP1 = p1?.idDosenPenguji === session.user.id;
              const konfirmasi = jadwal.konfirmasiList[0];
              const ba = jadwal.beritaAcara;

              return (
                <div key={String(jadwal.id)} className="panel space-y-4 p-5">
                  <div className="border-b border-slate-100 pb-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold text-slate-800">
                        {sempro.pengajuan.mahasiswa.nama}
                      </h2>
                      <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                        Peran Anda: {isDospem ? "Pembimbing" : isP1 ? "Penguji 1 (Ketua)" : "Penguji 2"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 font-medium">
                      Judul: {sempro.pengajuan.judul}
                    </p>
                    <p className="text-xs text-slate-500">
                      Waktu: {jadwal.tanggal ? new Date(jadwal.tanggal).toLocaleDateString("id-ID") : "-"} ·{" "}
                      {jadwal.waktuMulai} - {jadwal.waktuSelesai} WITA · Ruang: {jadwal.ruang}
                    </p>
                  </div>

                  {/* Konfirmasi Ketersediaan */}
                  <div className="rounded border border-slate-100 bg-slate-50/50 p-3 text-xs">
                    <p className="font-semibold text-slate-700">
                      Status Konfirmasi Kehadiran Anda:{" "}
                      <span className="font-bold text-sky-700">
                        {konfirmasi ? konfirmasi.status.toUpperCase() : "MENUNGGU"}
                      </span>
                    </p>
                    {(!konfirmasi || konfirmasi.status === "menunggu") && (
                      <div className="mt-2">
                        <KonfirmasiJadwalForm jadwalId={String(jadwal.id)} />
                      </div>
                    )}
                  </div>

                  {/* Formulir Penilaian (bila jadwal final) */}
                  {jadwal.status === "final" && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        {isDospem ? (
                          <NilaiPembimbingForm jadwalId={String(jadwal.id)} />
                        ) : (
                          <NilaiPengujiForm jadwalId={String(jadwal.id)} />
                        )}
                      </div>

                      {/* Tier 1 Keputusan Penguji 1 */}
                      {isP1 && ba && (
                        <div>
                          <KeputusanPenguji1Form jadwalId={String(jadwal.id)} />
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
