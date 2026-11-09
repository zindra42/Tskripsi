import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace-shell";
import { OrganizationForm } from "@/components/organization-forms";
import { requireAccountPermission, pageNumber } from "@/lib/accounts/views";
import { database } from "@/lib/db";
import { activeProgramOptions } from "@/lib/organization/store";
import { roleLabels } from "@/lib/auth/policy";

export const dynamic = "force-dynamic";

export default async function AffiliationPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const session = await requireAccountPermission("superadmin");
  const params = await searchParams;
  const page = pageNumber(params.page);
  const q = (params.q ?? "").trim().slice(0, 100);

  const [users, programs] = await Promise.all([
    database().pengguna.findMany({
      where: {
        AND: [
          { OR: [{ mahasiswa: { isNot: null } }, { dosen: { isNot: null } }] },
          ...(q
            ? [{
                OR: [
                  { nama: { contains: q, mode: "insensitive" as const } },
                  ...(/^[1-9]\d{0,18}$/.test(q) && BigInt(q) <= 9223372036854775807n ? [{ id: BigInt(q) }] : []),
                ],
              }]
            : []),
        ],
      },
      select: {
        id: true,
        nama: true,
        role: true,
        deletedAt: true,
        mahasiswa: { select: { prodi: true, programStudiId: true } },
        dosen: { select: { prodi: true, programStudiId: true } },
      },
      orderBy: { id: "asc" },
      take: 21,
      skip: (page - 1) * 20,
    }),
    activeProgramOptions(),
  ]);

  return (
    <WorkspaceShell session={session}>
      {/* Header & Navigasi Balik */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
            <Link href="/organisasi" className="hover:text-slate-800 transition-colors flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              <span>Tata kelola fakultas & prodi</span>
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Pemetaan profil historis
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Tautkan profil pengguna ke master fakultas dan prodi terdaftar.
          </p>
        </div>
      </div>

      <div className="panel mb-6 p-4! sm:p-5! text-xs text-slate-600 bg-amber-50/40 border-amber-200/60 leading-relaxed">
        Pilih fakultas dan prodi berdasarkan bukti administrasi. Nama lama tidak digunakan untuk menebak afiliasi. Flag pimpinan yang belum terpetakan dicabut saat ditautkan; tetapkan kembali melalui tata kelola. Profil terhapus tetap dapat dipetakan.
      </div>

      {/* Pencarian */}
      <form className="panel mb-6 flex flex-wrap items-end gap-3 p-4! sm:p-5!">
        <label className="min-w-64 flex-1">
          Cari nama atau ID akun
          <input name="q" defaultValue={q} placeholder="Ketik nama atau ID pengguna..." />
        </label>
        <button className="button" type="submit">
          Cari
        </button>
      </form>

      {/* Grid Pengguna */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {users.slice(0, 20).map((u) => (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs hover:border-slate-300 transition-all" key={String(u.id)}>
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {u.nama}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-mono text-slate-400">#{String(u.id)}</span>
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                    {roleLabels[u.role] ?? u.role}
                  </span>
                  {u.deletedAt && (
                    <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200/60">
                      Terhapus
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3.5 space-y-3">
              {(["mahasiswa", "dosen"] as const)
                .filter((kind) => u[kind])
                .map((kind) => (
                  <details key={kind} className="group rounded-lg border border-slate-200/90 bg-white">
                    <summary className="flex cursor-pointer items-center justify-between p-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 list-none select-none [&::-webkit-details-marker]:hidden rounded-lg">
                      <div className="min-w-0 flex-1">
                        <span className="capitalize text-slate-900 font-bold">Profil {kind}:</span>{" "}
                        <span className="text-slate-500 font-normal">
                          Label lama: <strong className="text-slate-700">{u[kind]!.prodi ?? "kosong"}</strong> · ID master: <strong className="text-slate-700">{String(u[kind]!.programStudiId ?? "belum dipetakan")}</strong>
                        </span>
                      </div>
                      <svg className="details-chevron h-4 w-4 shrink-0 ml-2 text-slate-400 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div className="border-t border-slate-100 p-3 bg-slate-50/50 rounded-b-lg">
                      <OrganizationForm command="link" label="Tautkan profil">
                        <input type="hidden" name="targetId" value={String(u.id)} />
                        <input type="hidden" name="kind" value={kind} />
                        <label>
                          Program studi tujuan
                          <select required name="programStudiId" defaultValue="">
                            <option value="" disabled>Pilih fakultas / prodi</option>
                            {programs.map((p) => (
                              <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                          </select>
                        </label>
                      </OrganizationForm>
                    </div>
                  </details>
                ))}
            </div>
          </section>
        ))}
      </div>

      {!users.length && (
        <div className="panel text-center py-8 text-sm text-slate-500">
          Profil tidak ditemukan.
        </div>
      )}

      {/* Navigasi Pagination */}
      <nav className="mt-6 flex items-center justify-between gap-4 text-sm font-medium" aria-label="Halaman pemetaan">
        {page > 1 ? (
          <Link href={`?${new URLSearchParams({ q, page: String(page - 1) })}`} className="button-secondary text-xs">
            Sebelumnya
          </Link>
        ) : <div />}
        <span className="text-xs text-slate-600">Halaman {page}</span>
        {users.length > 20 ? (
          <Link href={`?${new URLSearchParams({ q, page: String(page + 1) })}`} className="button-secondary text-xs">
            Berikutnya
          </Link>
        ) : <div />}
      </nav>
    </WorkspaceShell>
  );
}
