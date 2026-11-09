import "server-only";
import { activeProgram } from "@/lib/organization/store";
import { ensure, type Tx } from "./store";
import { idSchema } from "./validation";

export async function assertProgramExpertise(tx: Tx, ids: bigint[], programId: bigint | null | undefined) {
  const program = await activeProgram(tx, programId);
  const unique = [...new Set(ids)];
  ensure(await tx.bidangKeahlian.count({ where: { id: { in: unique }, programStudiId: program.id } }) === unique.length,
    "Bidang keahlian harus terpetakan ke program studi aktif yang sama.");
  return program;
}

/** Read only known ID slots. Never round historical bigint JSON through Number. */
export function matrixExpertiseIds(value: unknown): bigint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    return [row.bidang_keahlian_id, row.bidang_keahlian_2_id]
      .filter((id) => id !== null && id !== undefined && id !== "")
      .map((id) => {
        ensure(typeof id === "string" || typeof id === "number" && Number.isSafeInteger(id), "ID bidang historis tidak valid. Periksa data legacy.");
        return idSchema.parse(String(id));
      });
  });
}
