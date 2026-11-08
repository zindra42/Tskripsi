import "server-only";
import { manifestEntry, primaryKey, sha256 } from "./contract";
import { readStoredFile } from "../academic/files";
import type { Tx } from "../accounts/store";

// Call only AFTER document authorization. Imported PHP snapshots cannot be rendered by
// the TypeScript templates without a reviewed transformation. Prefer the original bytes.
export async function importedDocumentFile(tx: Tx, doc: { id: bigint; versi: number; status: string }) {
  if (!tx.legacyImportRow || !tx.legacyImportFile) return { imported: false as const, entries: [] };
  const pk = primaryKey({ id: String(doc.id) }, ["id"]);
  const source = await tx.legacyImportRow.findUnique({ where: { sourceTable_sourcePk: { sourceTable: "dokumen_verifikasi", sourcePk: pk } } });
  if (!source) return { imported: false as const, entries: [] };
  const files = await tx.legacyImportFile.findMany({ where: { binding: source.binding, descriptor: { path: ["pk"], equals: pk } } });
  const entries = files.flatMap((f) => {
    const parsed = manifestEntry.safeParse(f.descriptor);
    if (!parsed.success) return [];
    const entry = parsed.data;
    return entry.table === "dokumen_verifikasi" && entry.pk === pk && entry.version === String(doc.versi) && entry.status === doc.status
      && (entry.purpose === "pdf-cache" && entry.ownershipEvidence || entry.purpose === "reference" && entry.pointer === "/snapshot_json/file_acc_lama") ? [entry] : [];
  });
  return { imported: true as const, entries };
}
export async function readImportedDocument(files: Awaited<ReturnType<typeof importedDocumentFile>>) {
  for (const entry of files.entries) {
    try {
      const bytes = await readStoredFile(entry.path, [entry.disk]);
      if (bytes.subarray(0, 5).toString() === "%PDF-" && String(bytes.length) === entry.bytes && sha256(bytes) === entry.fileSha256) return bytes;
    } catch { /* Missing bytes stay a reconciliation gap; never regenerate a legacy document. */ }
  }
  return null;
}
