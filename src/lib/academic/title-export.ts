import "server-only";
import { database } from "@/lib/db";
import { ensure } from "@/lib/accounts/store";
import type { AuthenticatedSession } from "@/lib/auth/session";
import { checkedArchiveActor } from "./archive-access";
import { archiveCsvHeader, archiveCsvRow } from "./archive-csv";
import { titleListQuery, titleOwner } from "./title-list";
import type { TitleFilters } from "./title-list-params";

export async function exportTitleList(session: AuthenticatedSession, filters: TitleFilters, submissions = false) {
  // One repeatable snapshot keeps all batches consistent during concurrent imports/edits.
  return database().$transaction(async (tx) => {
    const { actor, manager, canExport } = await checkedArchiveActor(tx, session);
    ensure(canExport, "Anda tidak memiliki kewenangan mengunduh judul.");
    const source = submissions ? { ...filters, mode: "pengajuan" as const } : filters;
    const query = await titleListQuery(tx, source, actor, manager, !submissions);
    const lines = [archiveCsvHeader];
    const batchSize = 500;
    let skip = 0;
    for (;;) {
      const rows = source.mode === "alumni"
        ? await tx.arsipJudulSkripsi.findMany({ where: query.archiveWhere, orderBy: query.archiveOrder,
          select: { judul: true, namaPenulis: true, tahun: true, nim: true, prodi: true }, take: batchSize, skip })
        : (await tx.pengajuanJudul.findMany({ where: query.titleWhere, orderBy: query.titleOrder,
          select: { judul: true, tanggalPengajuan: true, mahasiswa: titleOwner }, take: batchSize, skip })).map((row) => ({
          judul: row.judul, namaPenulis: row.mahasiswa.nama, nim: row.mahasiswa.mahasiswa?.nim ?? null,
          prodi: row.mahasiswa.mahasiswa?.prodi ?? null,
          tahun: row.tanggalPengajuan ? new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Makassar" }).format(row.tanggalPengajuan) : null,
        }));
      lines.push(...rows.map(archiveCsvRow));
      if (rows.length < batchSize) break;
      skip += batchSize;
    }
    return "\uFEFF" + lines.join("\r\n") + "\r\n";
  }, { isolationLevel: "RepeatableRead", maxWait: 10000, timeout: 60000 });
}
