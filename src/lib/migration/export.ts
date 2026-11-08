import { MAPPING_VERSION, digest, sealSnapshot, primaryKey, type Snapshot } from "./contract";
import { inventoryFiles } from "./files";

export type ControlledCapture = { id: string; source: Omit<Snapshot["source"], "storageInventoryComplete">; rows: Record<string, Snapshot["tables"][string]["rows"]>;
  // Explicit operator evidence is required: cache filenames do not encode document versions.
  cacheBindings?: { disk: "private" | "public"; path: string; documentId: string; version: string; status: string; evidence: string }[] };
// Capture is supplied by an approved, consistent read-only export (data + migration ledger +
// information_schema on the same frozen snapshot). This never opens a database connection.
export async function assembleSnapshot(capture: ControlledCapture, roots: Record<"private" | "public", string>): Promise<Snapshot> {
  const tables = Object.fromEntries(Object.entries(capture.rows).map(([name, rows]) => [name, { rows, count: String(rows.length), checksum: digest(rows) }]));
  const files = await inventoryFiles({ tables }, roots);
  for (const binding of capture.cacheBindings ?? []) {
    const row = capture.rows.dokumen_verifikasi?.find((r) => r.id === binding.documentId);
    const existing = files.find((f) => f.disk === binding.disk && f.path === binding.path);
    if (!row || !existing || !binding.evidence || String(row.versi) !== binding.version || row.status !== binding.status) throw new Error("cache-ownership-unverified");
    if (files.some((f) => f.disk === binding.disk && f.path === binding.path && f.purpose === "pdf-cache")) throw new Error("cache-owner-ambiguous");
    files.push({ ...existing, table: "dokumen_verifikasi", pk: primaryKey(row, ["id"]), pointer: "/cached_pdf", purpose: "pdf-cache",
      ownershipEvidence: binding.evidence, version: binding.version, status: binding.status, urls: [`/verifikasi/${row.token}`] });
  }
  // A reviewed cache binding replaces the anonymous inventory entry, retaining any other owners.
  const manifest = files.filter((f) => f.purpose !== "unreferenced" || !files.some((c) => c.purpose === "pdf-cache" && c.disk === f.disk && c.path === f.path));
  return sealSnapshot({ format: "sias-controlled-export-v1", id: capture.id, mappingVersion: MAPPING_VERSION,
    source: { ...capture.source, storageInventoryComplete: { private: true, public: true } }, tables, files: manifest });
}
