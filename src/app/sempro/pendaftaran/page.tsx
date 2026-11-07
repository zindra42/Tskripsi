import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getPendaftaranSemproView } from "@/lib/sempro/views";
import {
  ChecklistUploadForm,
  CentangMandiriForm,
  SubmitSemproForm,
} from "@/components/sempro-forms";
import {
  SEMPRO_CHECKLIST_DEFINITIONS,
  SUBMIT_REQUIRED_ITEMS,
} from "@/lib/sempro/policy";

export const dynamic = "force-dynamic";

export default async function SemproPendaftaranPage() {
  const session = await requireSession();
  const pengajuan = await getPendaftaranSemproView(session);

  if (!pengajuan) {
    return (
      <WorkspaceShell session={session}>
        <div className="panel p-6">
          <h1 className="text-2xl font-bold text-slate-800">Pendaftaran Seminar Proposal</h1>
          <p className="mt-4 text-slate-600">
            Anda belum memiliki pengajuan judul skripsi yang disetujui, atau belum memenuhi prasyarat awal.
          </p>
          <Link href="/judul" className="mt-4 inline-block text-sky-700 underline">
            Menuju ke Pengajuan Judul
          </Link>
        </div>
      </WorkspaceShell>
    );
  }

  const sempro = pengajuan.sempro;
  type ChecklistItem = NonNullable<NonNullable<typeof pengajuan>["sempro"]>["checklist"][number];
  const itemMap = new Map<number, ChecklistItem>();
  if (sempro) {
    for (const c of sempro.checklist) {
      itemMap.set(c.nomorItem, c);
    }
  }

  const canEdit =
    !sempro || ["draft", "revisi_sebagian", "dikembalikan"].includes(sempro.statusBerkas);

  return (
    <WorkspaceShell session={session}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pendaftaran Seminar Proposal</h1>
          <p className="text-sm text-slate-500">
            Lengkapi seluruh dokumen checklist pendaftaran seminar proposal di bawah ini.
          </p>
        </div>

        {/* Informasi Judul */}
        <div className="panel space-y-2 p-5">
          <h2 className="text-lg font-semibold text-slate-800">{pengajuan.judul}</h2>
          <p className="text-xs text-slate-600">
            Pembimbing: {pengajuan.bimbingan?.pembimbing1?.nama ?? "Belum ditentukan"}
          </p>
          {sempro && (
            <div className="mt-2 flex items-center gap-3 text-xs font-medium">
              <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">
                Status Berkas: {sempro.statusBerkas.toUpperCase()}
              </span>
              {sempro.catatanVerifikasi && (
                <span className="text-amber-700">{sempro.catatanVerifikasi}</span>
              )}
            </div>
          )}
        </div>

        {/* Tabel Checklist */}
        <div className="panel overflow-hidden p-0">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-800">
              <tr>
                <th className="p-3">No</th>
                <th className="p-3">Nama Dokumen Persyaratan</th>
                <th className="p-3">Jenis</th>
                <th className="p-3">Status</th>
                <th className="p-3">Aksi / Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {SUBMIT_REQUIRED_ITEMS.map((itemNo, idx) => {
                const def = SEMPRO_CHECKLIST_DEFINITIONS[itemNo];
                const item = itemMap.get(itemNo);
                const isTerisi = Boolean(item && (item.statusItem === "terisi" || item.statusItem === "diverifikasi"));

                return (
                  <tr key={itemNo} className="hover:bg-slate-50/50">
                    <td className="p-3 font-medium text-slate-500">{idx + 1}</td>
                    <td className="p-3">
                      <p className="font-semibold text-slate-800">{def.namaDokumen}</p>
                      <p className="text-slate-500">{def.deskripsi}</p>
                      {item?.catatanVerifikator && (
                        <p className="mt-1 text-rose-600 font-medium">
                          Catatan: {item.catatanVerifikator}
                        </p>
                      )}
                    </td>
                    <td className="p-3 capitalize">{def.jenisBentuk}</td>
                    <td className="p-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${
                          item?.statusItem === "diverifikasi"
                            ? "bg-emerald-100 text-emerald-800"
                            : item?.statusItem === "terisi"
                            ? "bg-sky-100 text-sky-800"
                            : item?.statusItem === "ditolak"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item?.statusItem ?? "kosong"}
                      </span>
                    </td>
                    <td className="p-3">
                      {canEdit && sempro && (
                        <div>
                          {itemNo === 7 ? (
                            <CentangMandiriForm
                              pendaftaranId={String(sempro.id)}
                              nomorItem={7}
                              isCentang={isTerisi ?? false}
                            />
                          ) : [0, 6, 9, 10].includes(itemNo) ? (
                            <ChecklistUploadForm
                              pendaftaranId={String(sempro.id)}
                              nomorItem={itemNo}
                              label={def.namaDokumen}
                            />
                          ) : (
                            <span className="text-slate-400">Sinkronisasi otomatis sistem</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Submit Form */}
        {sempro && canEdit && (
          <div className="panel p-5">
            <SubmitSemproForm pendaftaranId={String(sempro.id)} />
          </div>
        )}
      </div>
    </WorkspaceShell>
  );
}
