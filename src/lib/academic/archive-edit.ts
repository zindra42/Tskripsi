import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { AuthenticatedSession } from "@/lib/auth/session";
import { accountTransaction, audit, checkedActor, ensure } from "@/lib/accounts/store";
import { idSchema, reasonSchema } from "@/lib/accounts/validation";
import { preprocess } from "./similarity";

const nullable = (max: number) => z.string().trim().max(max).nullable().transform((value) => value || null);
export const archiveEditSchema = z.object({
  id: z.string().regex(/^[1-9]\d{0,18}$/).pipe(idSchema),
  judul: z.string().trim().min(3).max(10000),
  namaPenulis: nullable(255),
  nim: nullable(50),
  tahun: nullable(10),
  prodi: nullable(100),
  reason: reasonSchema,
  original: z.string().length(64).regex(/^[a-f0-9]+$/),
});

// A content fingerprint also covers legacy rows with a null/second-precision updatedAt.
export function archiveFingerprint(row: { judul: string; namaPenulis: string | null; nim: string | null; tahun: string | null; prodi: string | null }) {
  return createHash("sha256").update(JSON.stringify([row.judul, row.namaPenulis, row.nim, row.tahun, row.prodi])).digest("hex");
}

export async function editArchive(session: AuthenticatedSession, input: unknown) {
  const { id, reason, original, ...data } = archiveEditSchema.parse(input);
  return accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session, "superadmin");
    await tx.$queryRaw`SELECT id FROM arsip_judul_skripsi WHERE id = ${id} FOR UPDATE`;
    const before = await tx.arsipJudulSkripsi.findUnique({ where: { id } });
    ensure(before, "Entri arsip tidak ditemukan. Muat ulang daftar.");
    ensure(archiveFingerprint(before) === original, "Entri telah diubah. Muat ulang halaman sebelum mengedit kembali.");
    if (archiveFingerprint(data) === original) return;
    const after = await tx.arsipJudulSkripsi.update({ where: { id }, data: {
      ...data, keywords: preprocess(data.judul, true), updatedAt: new Date(),
    } });
    await audit(tx, actor.id, "edit_arsip_judul", `arsip_judul_skripsi:${id}`, { before, after, reason });
  });
}
