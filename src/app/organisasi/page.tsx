import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { OrganizationForm, MasterFields } from "@/components/organization-forms";
import { requireSession } from "@/lib/auth/session";
import { organizationData } from "@/lib/organization/store";

export const dynamic = "force-dynamic";

export default async function OrganizationPage() {
  const session = await requireSession();
  if (!["superadmin", "dekan"].includes(session.user.role)) notFound();
  const { actor, faculties, programs, candidates } = await organizationData(session);
  const admin = actor.role === "superadmin";

  return (
    <WorkspaceShell session={session}>
      {/* Header Halaman & Tombol Aksi */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Tata kelola fakultas dan prodi
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Penetapan pejabat dan perubahan afiliasi mencabut sesi pengguna terdampak. Data historis tetap tersimpan.
          </p>
        </div>

        {admin && (
          <Link
            href="/organisasi/afiliasi"
            className="button-secondary text-xs sm:text-sm gap-2"
          >
            <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span>Pemetaan profil lama ke master prodi</span>
          </Link>
        )}
      </div>

      {/* Tambah Fakultas (Khusus Superadmin) */}
      {admin && (
        <div className="panel mb-6 p-4! sm:p-5!">
          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between font-semibold text-slate-800 list-none select-none [&::-webkit-details-marker]:hidden hover:text-[#14213d]">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#14213d] text-white">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                  </svg>
                </span>
                <span className="text-sm font-semibold">Tambah Fakultas Baru</span>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 group-hover:text-slate-800">
                <span>Formulir</span>
                <svg className="details-chevron h-4 w-4 text-slate-400 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </summary>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <OrganizationForm command="faculty" label="Simpan Fakultas">
                <MasterFields />
              </OrganizationForm>
            </div>
          </details>
        </div>
      )}

      {/* State Kosong */}
      {!faculties.length && (
        <div className="panel flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <p className="font-semibold text-slate-800">
            {admin
              ? "Belum ada fakultas. Tambahkan fakultas terlebih dahulu."
              : "Penempatan fakultas belum tersedia atau fakultas nonaktif. Hubungi superadmin."}
          </p>
        </div>
      )}

      {/* Daftar Fakultas */}
      <div className="space-y-6">
        {faculties.map((f) => {
          const facultyPrograms = programs.filter((p) => p.fakultasId === f.id);
          const dekanNames = f.pengguna.map((u) => u.nama).join(", ");

          return (
            <section className="panel space-y-5" key={String(f.id)}>
              {/* Header Fakultas */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                      {f.nama}
                    </h2>
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-mono font-bold text-slate-700 border border-slate-200">
                      {f.kode}
                    </span>
                    {f.aktif ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                        Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500 border border-slate-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                        Nonaktif
                      </span>
                    )}
                  </div>
                </div>

                <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200/60">
                  {facultyPrograms.length} Program Studi
                </span>
              </div>

              {/* Dekan Info Callout */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#14213d] text-white font-bold text-xs">
                    DK
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Dekan Fakultas</p>
                    <p className="font-semibold text-slate-900">
                      {dekanNames || <span className="text-slate-400 italic">Belum ditetapkan</span>}
                    </p>
                  </div>
                </div>
              </div>

              {/* Aksi Tingkat Fakultas */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {admin && (
                  <details className="group rounded-xl border border-slate-200 bg-white">
                    <summary className="flex cursor-pointer items-center justify-between p-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 list-none select-none [&::-webkit-details-marker]:hidden rounded-xl">
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span>Ubah Fakultas</span>
                      </span>
                      <svg className="details-chevron h-4 w-4 text-slate-400 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div className="border-t border-slate-100 p-4 bg-slate-50/50 rounded-b-xl">
                      <OrganizationForm command="faculty">
                        <input type="hidden" name="id" value={String(f.id)} />
                        <MasterFields values={f} />
                      </OrganizationForm>
                    </div>
                  </details>
                )}

                {admin && (
                  <details className="group rounded-xl border border-slate-200 bg-white">
                    <summary className="flex cursor-pointer items-center justify-between p-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 list-none select-none [&::-webkit-details-marker]:hidden rounded-xl">
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span>Tetapkan / Ganti Dekan</span>
                      </span>
                      <svg className="details-chevron h-4 w-4 text-slate-400 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div className="border-t border-slate-100 p-4 bg-slate-50/50 rounded-b-xl">
                      <OrganizationForm command="dean">
                        <input type="hidden" name="fakultasId" value={String(f.id)} />
                        <label>
                          Dosen aktif
                          <select name="targetId">
                            <option value="">Berhentikan Dekan saat ini</option>
                            {candidates.map((c) => (
                              <option key={String(c.id)} value={String(c.id)}>
                                {c.nama} (#{String(c.id)})
                              </option>
                            ))}
                          </select>
                        </label>
                      </OrganizationForm>
                    </div>
                  </details>
                )}

                {f.aktif && (
                  <details className="group rounded-xl border border-slate-200 bg-white">
                    <summary className="flex cursor-pointer items-center justify-between p-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 list-none select-none [&::-webkit-details-marker]:hidden rounded-xl">
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        <span>Tambah Program Studi</span>
                      </span>
                      <svg className="details-chevron h-4 w-4 text-slate-400 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div className="border-t border-slate-100 p-4 bg-slate-50/50 rounded-b-xl">
                      <OrganizationForm command="program">
                        <input type="hidden" name="fakultasId" value={String(f.id)} />
                        <MasterFields program />
                      </OrganizationForm>
                    </div>
                  </details>
                )}
              </div>

              {/* Grid Program Studi */}
              <div className="pt-2">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                    Daftar Program Studi
                  </h3>
                </div>

                {!facultyPrograms.length ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                    Belum ada program studi di fakultas ini.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4.5 items-start">
                    {facultyPrograms.map((p) => {
                      const kaprodi = p.dosen.filter((d) => d.isKaprodi || d.pengguna.role === "kaprodi");
                      const sekpro = p.dosen.filter((d) => d.isSekpro || d.pengguna.role === "sekpro");
                      const kaprodiName = kaprodi.map((k) => k.pengguna.nama).join(", ");
                      const sekproName = sekpro.map((s) => s.pengguna.nama).join(", ");

                      return (
                        <article
                          key={String(p.id)}
                          className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4.5 shadow-2xs transition-all duration-150 hover:border-slate-300 hover:shadow-xs"
                        >
                          <div>
                            {/* Header Kartu Prodi */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <h4 className="text-base font-bold text-slate-900 leading-snug">
                                  {p.nama}
                                </h4>
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                                  <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 font-bold text-amber-900 border border-amber-200/70">
                                    {p.jenjang}
                                  </span>
                                  <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono font-semibold text-slate-700 border border-slate-200">
                                    {p.kode}
                                  </span>
                                </div>
                              </div>

                              {p.aktif ? (
                                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                  Aktif
                                </span>
                              ) : (
                                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 border border-slate-200">
                                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                                  Nonaktif
                                </span>
                              )}
                            </div>

                            {/* Info Pimpinan Prodi */}
                            <div className="my-3.5 rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs space-y-1.5">
                              <div className="flex items-start gap-2">
                                <span className="w-16 shrink-0 font-semibold text-slate-600">Kaprodi</span>
                                <span className="text-slate-400">:</span>
                                <span className={`min-w-0 flex-1 ${kaprodiName ? "font-medium text-slate-900" : "text-slate-400 italic"}`}>
                                  {kaprodiName || "Belum ditetapkan"}
                                </span>
                              </div>
                              <div className="flex items-start gap-2">
                                <span className="w-16 shrink-0 font-semibold text-slate-600">Sekpro</span>
                                <span className="text-slate-400">:</span>
                                <span className={`min-w-0 flex-1 ${sekproName ? "font-medium text-slate-900" : "text-slate-400 italic"}`}>
                                  {sekproName || "Belum ditetapkan"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Formulir Aksi Prodi */}
                          <div className="space-y-2 border-t border-slate-100 pt-3">
                            {f.aktif && (
                              <details className="group rounded-lg border border-slate-200/90 bg-white">
                                <summary className="flex cursor-pointer items-center justify-between p-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 list-none select-none [&::-webkit-details-marker]:hidden rounded-lg">
                                  <span className="flex items-center gap-1.5">
                                    <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    <span>Ubah program studi</span>
                                  </span>
                                  <svg className="details-chevron h-3.5 w-3.5 text-slate-400 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                  </svg>
                                </summary>
                                <div className="border-t border-slate-100 p-3 bg-slate-50/50 rounded-b-lg">
                                  <OrganizationForm command="program">
                                    <input type="hidden" name="id" value={String(p.id)} />
                                    <input type="hidden" name="fakultasId" value={String(f.id)} />
                                    <MasterFields program values={p} />
                                  </OrganizationForm>
                                </div>
                              </details>
                            )}

                            <details className="group rounded-lg border border-slate-200/90 bg-white">
                              <summary className="flex cursor-pointer items-center justify-between p-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 list-none select-none [&::-webkit-details-marker]:hidden rounded-lg">
                                <span className="flex items-center gap-1.5">
                                  <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                  </svg>
                                  <span>Penetapan / rotasi / pemberhentian pimpinan</span>
                                </span>
                                <svg className="details-chevron h-3.5 w-3.5 text-slate-400 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                </svg>
                              </summary>
                              <div className="border-t border-slate-100 p-3 bg-slate-50/50 rounded-b-lg space-y-3">
                                <p className="text-[11px] leading-relaxed text-slate-500">
                                  Pejabat lama kembali menjadi dosen, dengan jabatan lain dan penugasan historis tetap tersimpan. Pilih pemberhentian sebelum menonaktifkan prodi atau memindahkan afiliasi.
                                </p>
                                <OrganizationForm command="leadership" label="Simpan jabatan">
                                  <input type="hidden" name="programStudiId" value={String(p.id)} />
                                  <label>
                                    Jabatan
                                    <select name="office">
                                      <option value="kaprodi">Kaprodi</option>
                                      <option value="sekpro">Sekpro</option>
                                    </select>
                                  </label>
                                  <label>
                                    Pejabat pengganti
                                    <select name="targetId">
                                      <option value="">Berhentikan pejabat saat ini</option>
                                      {p.aktif && f.aktif && candidates.filter((c) => c.role !== "dekan" && c.dosen?.programStudiId === p.id).map((c) => (
                                        <option value={String(c.id)} key={String(c.id)}>
                                          {c.nama} (#{String(c.id)})
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </OrganizationForm>
                              </div>
                            </details>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </WorkspaceShell>
  );
}
