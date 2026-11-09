import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Account, Tx } from "@/lib/accounts/store";
import { scopedTitles } from "./views";
import { cohortPattern, type TitleFilters } from "./title-list-params";

export const titleOwner = { select: { nama: true, mahasiswa: { select: { nim: true, prodi: true } } } } as const;

export async function titleListQuery(tx: Tx, filters: TitleFilters, actor: Account, manager: boolean, submittedOnly = true) {
  const pattern = cohortPattern(filters.angkatan);
  // Prisma's string filters cannot express a fully numeric identifier. Resolve only matching
  // NIM values in PostgreSQL, then AND them with the unchanged application authorization scope.
  const matching = !filters.angkatan ? [] : await tx.$queryRaw<{ nim: string }[]>(
    filters.mode === "alumni"
      ? Prisma.sql`SELECT DISTINCT nim FROM arsip_judul_skripsi WHERE nim ~ ${pattern}`
      : Prisma.sql`SELECT DISTINCT nim FROM mahasiswa WHERE nim ~ ${pattern}`,
  );
  const nims = matching.map((row) => row.nim);
  const search = { contains: filters.q, mode: "insensitive" as const };
  const archiveWhere: Prisma.ArsipJudulSkripsiWhereInput = { AND: [
    ...(filters.q ? [{ OR: [{ judul: search }, { namaPenulis: search }, { nim: search }] }] : []),
    ...(filters.angkatan ? [{ nim: { in: nims } }] : []),
  ] };
  const titleWhere: Prisma.PengajuanJudulWhereInput = { AND: [
    actor.role === "dekan" ? { id: -1n } : scopedTitles(actor, manager),
    { deletedAt: null, ...(submittedOnly ? { statusDraft: "diajukan" } : {}) },
    ...(filters.q ? [{ OR: [{ judul: search }, { mahasiswa: { nama: search } }, { mahasiswa: { mahasiswa: { nim: search } } }] }] : []),
    ...(filters.angkatan ? [{ mahasiswa: { mahasiswa: { nim: { in: nims } } } }] : []),
  ] };
  const direction = filters.sort === "nim-desc" ? "desc" : "asc";
  const nimOrder = { sort: direction, nulls: "last" } satisfies Prisma.SortOrderInput;
  const archiveOrder: Prisma.ArsipJudulSkripsiOrderByWithRelationInput[] = filters.sort === "latest"
    ? [{ id: "desc" }] : [{ nim: nimOrder }, { id: direction }];
  const titleOrder: Prisma.PengajuanJudulOrderByWithRelationInput[] = filters.sort === "latest"
    ? [{ id: "desc" }] : [{ mahasiswa: { mahasiswa: { nim: nimOrder } } }, { id: direction }];
  return { archiveWhere, titleWhere, archiveOrder, titleOrder };
}
