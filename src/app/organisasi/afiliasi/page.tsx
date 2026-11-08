import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace-shell";
import { OrganizationForm } from "@/components/organization-forms";
import { requireAccountPermission, pageNumber } from "@/lib/accounts/views";
import { database } from "@/lib/db";
import { activeProgramOptions } from "@/lib/organization/store";

export const dynamic = "force-dynamic";
export default async function AffiliationPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const session = await requireAccountPermission("superadmin");
  const params = await searchParams, page = pageNumber(params.page), q = (params.q ?? "").trim().slice(0, 100);
  const [users, programs] = await Promise.all([
    database().pengguna.findMany({ where: { AND: [{ OR: [{ mahasiswa: { isNot: null } }, { dosen: { isNot: null } }] }, ...(q ? [{ OR: [{ nama: { contains: q, mode: "insensitive" as const } }, ...(/^[1-9]\d{0,18}$/.test(q) && BigInt(q) <= 9223372036854775807n ? [{ id: BigInt(q) }] : [])] }] : [])] }, select: { id: true, nama: true, role: true, deletedAt: true, mahasiswa: { select: { prodi: true, programStudiId: true } }, dosen: { select: { prodi: true, programStudiId: true } } }, orderBy: { id: "asc" }, take: 21, skip: (page - 1) * 20 }),
    activeProgramOptions(),
  ]);
  return <WorkspaceShell session={session}><Link href="/organisasi" className="underline">Tata kelola</Link><h1 className="my-5 text-3xl font-bold">Pemetaan profil historis</h1>
    <p className="panel mb-5">Pilih fakultas dan prodi berdasarkan bukti administrasi. Nama lama tidak digunakan untuk menebak afiliasi. Flag pimpinan yang belum terpetakan dicabut saat ditautkan; tetapkan kembali melalui tata kelola. Profil terhapus tetap dapat dipetakan.</p>
    <form className="panel mb-5 flex flex-wrap items-end gap-4"><label>Cari nama atau ID akun<input name="q" defaultValue={q} /></label><button className="button">Cari</button></form>
    <div className="space-y-4">{users.slice(0, 20).map((u) => <section className="panel" key={String(u.id)}><h2 className="mb-3 font-semibold">{u.nama} · #{String(u.id)} · {u.role}{u.deletedAt ? " · Terhapus" : ""}</h2>{(["mahasiswa", "dosen"] as const).filter((kind) => u[kind]).map((kind) => <details key={kind}><summary className="cursor-pointer py-3">Profil {kind}: label lama {u[kind]!.prodi ?? "kosong"} · ID master {String(u[kind]!.programStudiId ?? "belum dipetakan")}</summary><OrganizationForm command="link" label="Tautkan profil"><input type="hidden" name="targetId" value={String(u.id)} /><input type="hidden" name="kind" value={kind} /><label>Program studi tujuan<select required name="programStudiId" defaultValue=""><option value="" disabled>Pilih fakultas / prodi</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label></OrganizationForm></details>)}</section>)}{!users.length && <p className="panel">Profil tidak ditemukan.</p>}</div>
    <nav className="mt-5 flex gap-4" aria-label="Halaman pemetaan">{page > 1 && <Link href={`?${new URLSearchParams({ q, page: String(page - 1) })}`}>Sebelumnya</Link>}<span>Halaman {page}</span>{users.length > 20 && <Link href={`?${new URLSearchParams({ q, page: String(page + 1) })}`}>Berikutnya</Link>}</nav>
  </WorkspaceShell>;
}
