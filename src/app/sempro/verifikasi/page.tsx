import { requireSession } from "@/lib/auth/session";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getListVerifikasiSemproView } from "@/lib/sempro/views";
import { VerifikasiItemForm } from "@/components/sempro-forms";
import { canManage } from "@/lib/accounts/policy";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SemproVerifikasiPage() {
  const session = await requireSession();
  if (!canManage(session.user, session.activeRole)) {
    redirect(`/dashboard/${session.activeRole}`);
  }

  const list = await getListVerifikasiSemproView();

  return (
    <WorkspaceShell session={session}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Verifikasi Berkas Seminar Proposal</h1>
          <p className="text-sm text-slate-500">
            Periksa kelengkapan dan keabsahan dokumen persyaratan seminar proposal mahasiswa.
          </p>
        </div>

        {list.length === 0 ? (
          <div className="panel p-6 text-center text-xs text-slate-500">
            Tidak ada pendaftaran seminar proposal yang menunggu verifikasi saat ini.
          </div>
        ) : (
          <div className="space-y-6">
            {list.map((sempro) => (
              <div key={String(sempro.id)} className="panel space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-800">
                      {sempro.pengajuan.mahasiswa.nama}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Judul: <span className="font-medium text-slate-700">{sempro.pengajuan.judul}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Pembimbing: {sempro.pengajuan.bimbingan?.pembimbing1?.nama ?? "-"}
                    </p>
                  </div>
                  <span
                    className={`rounded px-2.5 py-1 text-xs font-semibold ${
                      sempro.statusBerkas === "lengkap"
                        ? "bg-emerald-100 text-emerald-800"
                        : sempro.statusBerkas === "revisi_sebagian"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-sky-100 text-sky-800"
                    }`}
                  >
                    {sempro.statusBerkas.toUpperCase()}
                  </span>
                </div>

                {/* Items */}
                <div className="grid gap-3">
                  {sempro.checklist.map((item) => (
                    <div
                      key={String(item.id)}
                      className="flex flex-col gap-2 rounded border border-slate-100 bg-slate-50/50 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-semibold text-slate-800">{item.namaDokumen}</p>
                        <p className="text-slate-500">
                          Bentuk: <span className="capitalize">{item.jenisBentuk}</span> · Status:{" "}
                          <span className="font-medium text-slate-700">{item.statusItem}</span>
                        </p>
                        {item.filePindaian && (
                          <div className="mt-1">
                            <a
                              href={`/api/sempro/file/${item.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-700 underline"
                            >
                              Lihat berkas terlampir
                            </a>
                          </div>
                        )}
                        {item.catatanVerifikator && (
                          <p className="text-rose-600 font-medium">Catatan: {item.catatanVerifikator}</p>
                        )}
                      </div>

                      {item.statusItem !== "diverifikasi" && (
                        <div className="w-full sm:w-72">
                          <VerifikasiItemForm checklistItemId={String(item.id)} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </WorkspaceShell>
  );
}
