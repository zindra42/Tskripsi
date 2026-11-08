import { canonical, canonicalJson, digest, primaryKey, type Row, type Snapshot, type Issue, type ManifestEntry } from "./contract";
import { sourceCatalog, targetCatalog, archiveOnly } from "./catalog";
import { createPlan } from "./importer";
import { validateSnapshot } from "./validate";
import { verifyFiles, inventoryFiles } from "./files";

export type ImportedArchive = { table: string; pk: string; binding: string; source: Row; checksum: string; provenance: unknown };
export type TargetCapture = { tables: Record<string, Row[]>; archive: ImportedArchive[]; nextSequences: Record<string, string>; files: ManifestEntry[] };
function summary(rows: Row[]) {
  const histograms: Record<string, Record<string, number>> = {}, decimals: Record<string, string> = {};
  for (const row of rows) for (const [column, value] of Object.entries(row)) {
    // Per-column digests include JSON/null/timestamp/identity/lifecycle, without exposing values.
    const hash = digest(value); ((histograms[column] ??= {})[hash] ??= 0); histograms[column][hash]++;
    if (typeof value === "string" && /^-?\d+\.\d\d$/.test(value)) decimals[column] = (BigInt(decimals[column] ?? "0") + BigInt(value.replace(".", ""))).toString();
  }
  return { count: String(rows.length), columnDigests: Object.fromEntries(Object.entries(histograms).map(([c, v]) => [c, digest(v)])), decimalSumsInHundredths: decimals };
}
// Target capture uses the SQL projections in postgres.ts: BIGINT/DECIMAL remain strings,
// SQL NULL is null, JSON values are {$json: raw-json-text}, UTC timestamp(0) uses ISO strings.
export async function reconcileImported(snapshot: Snapshot, target: TargetCapture, roots: Record<"private" | "public", string>) {
  const preflight = validateSnapshot(snapshot), issues: Issue[] = [...preflight.issues];
  if (!preflight.valid) return { valid: false, issues, tables: {}, cutoverVerified: false };
  const plan = createPlan(snapshot, preflight.order), tables: Record<string, { expected: ReturnType<typeof summary>; actual: ReturnType<typeof summary> }> = {};
  if (canonical(target.files.map(canonical).sort()) !== canonical(snapshot.files.map(canonical).sort())) issues.push({ code: "target-manifest-mismatch" });
  const inserts = plan.stages.flatMap((s) => s.operations).filter((o) => o.kind === "insert");
  const archives = new Map(target.archive.map((a) => [canonical([a.table, a.pk]), a]));
  if (archives.size !== target.archive.length || archives.size !== inserts.length) issues.push({ code: "archive-count-or-duplicate" });
  for (const op of inserts) {
    const actual = archives.get(canonical([op.table, op.pk]));
    if (!actual || actual.binding !== plan.binding || actual.checksum !== digest(op.source) || digest(actual.source) !== digest(op.source) || digest(actual.provenance) !== digest(op.provenance)) issues.push({ code: "archive-reconciliation-mismatch", table: op.table, pk: op.pk });
  }
  for (const table of preflight.order.filter((t) => !archiveOnly.has(t))) {
    const ops = inserts.filter((o) => o.table === table), expected = ops.map((o) => o.mapped), actual = target.tables[table] ?? [];
    if (!Object.hasOwn(target.tables, table)) issues.push({ code: "target-table-capture-missing", table });
    const sourceKeys = sourceCatalog.tables[table].primaryKey;
    const rows = new Map(actual.map((r) => [primaryKey(r, sourceKeys), r]));
    if (rows.size !== actual.length || actual.length !== expected.length) issues.push({ code: "target-count-or-duplicate", table });
    for (const row of expected) {
      const pk = primaryKey(row, sourceKeys), found = rows.get(pk);
      // Ignore target-only defaults, but compare every imported column including explicit nulls.
      const comparable = found && Object.fromEntries(Object.keys(row).map((c) => [c, found[c]]));
      const normalize = (r: Row) => Object.fromEntries(Object.entries(r).map(([c, v]) => [c, v && typeof v === "object" ? { $json: canonicalJson(v.$json) } : v]));
      if (!comparable || digest(normalize(comparable)) !== digest(normalize(row))) issues.push({ code: "target-value-mismatch", table, pk });
    }
    const columns = [...new Set(expected.flatMap(Object.keys))];
    tables[table] = { expected: summary(expected), actual: summary(actual.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]])))) };
    if (Object.values(targetCatalog.tables[table].columns).some((c) => c.generated && c.type === "BigInt")) {
      const max = expected.reduce((n, r) => BigInt(String(r.id)) > n ? BigInt(String(r.id)) : n, 0n);
      if (target.nextSequences[table] !== String(max + 1n)) issues.push({ code: "sequence-reconciliation-mismatch", table });
    }
  }
  for (const table of Object.keys(target.tables)) {
    if (!sourceCatalog.tables[table] && target.tables[table].length) issues.push({ code: "unexpected-runtime-rows", table });
  }
  issues.push(...await verifyFiles(snapshot.files, roots));
  try {
    const inventory = await inventoryFiles(snapshot, roots);
    const key = (f: Pick<ManifestEntry, "disk" | "path">) => canonical([f.disk, f.path]);
    if (canonical([...new Set(inventory.map(key))].sort()) !== canonical([...new Set(snapshot.files.map(key))].sort())) issues.push({ code: "target-storage-inventory-mismatch" });
  } catch { issues.push({ code: "target-storage-unreadable" }); }
  return { valid: issues.length === 0, binding: plan.binding, issues, tables, cutoverVerified: false };
}
