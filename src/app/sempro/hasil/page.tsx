import { requireSession } from "@/lib/auth/session";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getHasilSemproView } from "@/lib/sempro/views";
import { SahkanHasilSemproForm } from "@/components/sempro-forms";
import { canManage } from "@/lib/accounts/policy";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SemproHasilPage() {
  const session = await requireSession();
  if (!canManage(session.user, session.activeRole)) {
    redirect(`/dashboard/${session.activeRole}`);
  }

  const list = await getHasilSemproView();

  return (
    <WorkspaceShell session={session}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pengesahan Hasil Seminar Proposal</h1>
          <p className="text-sm text-slate-500">
            Tinjau hasil keputusan dewan penguji (Tier 1) dan sahkan kelulusan seminar proposal serta penerbitan Berita Acara resmi (Tier 2).
          </p>
        </div>

        {list.length === 0 ? (
          <div className="panel p-6 text-center text-xs text-slate-500">
            Tidak ada seminar proposal yang menunggu pengesahan hasil saat ini.
          </div>
        ) : (
          <div className="space-y-6">
            {list.map((ba) => {
              const jadwal = ba.jadwal!;
              const sempro = jadwal.sempro!;
              const doc = jadwal.documents[0];

              return (
                <div key={String(ba.id)} className="panel space-y-4 p-5">
                  <div className="border-b border-slate-100 pb-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold text-slate-800">
                        {sempro.pengajuan.mahasiswa.nama}
                      </h2>
                      <span
                        className={`rounded px-2.5 py-1 text-xs font-semibold ${
                          ba.statusPersetujuan === "disetujui_kaprodi"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {ba.statusPersetujuan.toUpperCase()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 font-medium">
                      Judul: {sempro.pengajuan.judul}
                    </p>
                    <p className="text-xs text-slate-500">
                      Nilai Angka: {ba.nilai ? Number(ba.nilai).toFixed(2) : "-"} · Usulan Dewan:{" "}
                      <strong className="text-slate-800">
                        {ba.keputusanPenguji1 ? ba.keputusanPenguji1.toUpperCase() : "-"}
                      </strong>
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 rounded border border-slate-100 bg-slate-50/50 p-3 text-xs">
                      <h3 className="font-semibold text-slate-800">Rincian Keputusan Dewan (Tier 1)</h3>
                      <p>
                        <strong>Ketua Dewan (Penguji 1):</strong> {ba.penguji1?.nama ?? "-"}
                      </p>
                      <p>
                        <strong>Catatan Dewan:</strong> {ba.catatanPenguji1 ?? "-"}
                      </p>
                      {ba.tenggatRevisiPenguji1 && (
                        <p>
                          <strong>Usulan Tenggat:</strong>{" "}
                          {new Date(ba.tenggatRevisiPenguji1).toLocaleDateString("id-ID")}
                        </p>
                      )}
                      {doc && (
                        <div className="mt-3">
                          <a
                            href={`/api/sempro/dokumen/${doc.token}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-emerald-800"
                          >
                            📄 Unduh Berita Acara Resmi (PDF Ber-QR)
                          </a>
                        </div>
                      )}
                    </div>

                    <div>
                      {ba.statusPersetujuan !== "disetujui_kaprodi" && (
                        <SahkanHasilSemproForm jadwalId={String(jadwal.id)} />
                      )}
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
