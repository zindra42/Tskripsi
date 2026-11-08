import { scopedAccounts } from "@/lib/accounts/policy";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { WorkspaceShell } from "@/components/workspace-shell";
import { ActionForm } from "@/components/account-forms";
import { database } from "@/lib/db";
import { roleLabels } from "@/lib/auth/policy";
import { accountSelect } from "@/lib/accounts/store";
import { pageNumber, requireAccountPermission } from "@/lib/accounts/views";

export const dynamic = "force-dynamic";
export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const session = await requireAccountPermission();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const query = (params.q ?? "").slice(0, 255).trim();
  const status = ["aktif", "nonaktif", "ditolak", "deleted"].includes(params.status ?? "") ? params.status! : "menunggu_persetujuan";
  const admin = session.user.role === "superadmin";
  const deleted = status === "deleted" && admin;
  const where: Prisma.PenggunaWhereInput = {
    role: { not: "superadmin" }, deletedAt: deleted ? { not: null } : null,
    ...(!deleted ? { statusAkun: status === "deleted" ? "menunggu_persetujuan" : status as "aktif" | "nonaktif" | "ditolak" | "menunggu_persetujuan" } : {}),
    AND: [scopedAccounts(session.user)],
    ...(query ? { OR: [{ nama: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } },
      { mahasiswa: { nim: { contains: query } } }, { dosen: { nidn: { contains: query } } },
      ...(admin ? [{ emailArsip: { contains: query, mode: "insensitive" as const } }] : [])] } : {}),
  };
  const rows = await database().pengguna.findMany({ where, select: accountSelect, orderBy: { id: "desc" }, take: 21, skip: (page - 1) * 20 });
  const next = rows.length > 20;
  const accounts = rows.slice(0, 20);
  const pageLink = (target: number) => `/akun?${new URLSearchParams({ q: query, status, page: String(target) })}`;
  return <WorkspaceShell session={session}><div className="mb-6 flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-bold">Kelola akun</h1>
    <div className="flex gap-4"><Link href="/akun/permohonan" className="underline">Permohonan</Link>{admin && <Link href="/akun/baru" className="underline">Tambah akun</Link>}</div></div>
    <form className="panel mb-6 grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
      <label>Cari nama, email, NIM, NIDN<input name="q" defaultValue={query} maxLength={255} /></label>
      <label>Status<select name="status" defaultValue={status}>
        <option value="menunggu_persetujuan">Menunggu persetujuan</option><option value="aktif">Aktif</option><option value="ditolak">Ditolak</option><option value="nonaktif">Nonaktif</option>{admin && <option value="deleted">Terhapus</option>}
      </select></label><button className="button">Cari</button>
    </form>
    <section className="panel"><ActionForm command="approve" label="Setujui akun terpilih">
      {accounts.map((user) => <article key={user.id.toString()} className="flex items-start gap-4 border-b border-slate-200 py-4">
        {user.statusAkun === "menunggu_persetujuan" && !user.deletedAt && <input className="mt-1 h-5 w-5" type="checkbox" name="ids" value={user.id.toString()} aria-label={`Pilih ${user.nama}`} />}
        <div><Link href={`/akun/${user.id}`} className="font-semibold underline">{user.nama}</Link>
          <p className="mt-1 break-all text-sm">{user.email ?? user.emailArsip ?? "Email kosong"}</p>
          <p className="text-sm text-slate-600">{roleLabels[user.role]} · {user.mahasiswa?.nim ?? user.mahasiswa?.nimArsip ?? user.dosen?.nidn ?? user.dosen?.nidnArsip} · {user.deletedAt ? "terhapus" : user.statusAkun}</p>
        </div>
      </article>)}
      {!accounts.length && <p>Daftar akun kosong.</p>}
    </ActionForm></section>
    <nav aria-label="Halaman daftar akun" className="mt-6 flex gap-5">{page > 1 && <Link href={pageLink(page - 1)} className="underline">Sebelumnya</Link>}<span>Halaman {page}</span>{next && <Link href={pageLink(page + 1)} className="underline">Berikutnya</Link>}</nav>
  </WorkspaceShell>;
}
