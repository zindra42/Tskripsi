import { canonical, digest, primaryKey, snapshotBinding, type Row, type Snapshot, type ManifestEntry } from "./contract";
import { archiveOnly, deferred, mapRow, sourceCatalog, targetCatalog } from "./catalog";
import { dryRun, provenance } from "./validate";

export type ImportOperation = { kind: "insert" | "restore"; table: string; pk: string; source: Row; mapped: Row; provenance: ReturnType<typeof provenance> };
export type ImportStage = { name: string; checksum: string; operations: ImportOperation[] };
export type ImportPlan = { binding: string; snapshotId: string; checksum: string; mappingVersion: string; stages: ImportStage[] };
export function createPlan(snapshot: Snapshot, order: string[], batchSize = 250): ImportPlan {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error("invalid-batch-size");
  const stages: ImportStage[] = [];
  const add = (name: string, operations: ImportOperation[]) => {
    // Include empty tables in the journal so omission cannot masquerade as completion.
    for (let i = 0; i < Math.max(operations.length, 1); i += batchSize) {
      const rows = operations.slice(i, i + batchSize);
      stages.push({ name: `${name}:${i / batchSize}`, checksum: digest({ name, batchSize, rows }), operations: rows });
    }
  };
  for (const table of order) {
    const rows = [...snapshot.tables[table].rows].sort((a, b) => primaryKey(a, sourceCatalog.tables[table].primaryKey).localeCompare(primaryKey(b, sourceCatalog.tables[table].primaryKey), "en"));
    add(`insert:${table}`, rows.map((source) => {
      const mapped = mapRow(table, source, snapshot.source.timezone!);
      if (table === "berita_acara") {
        const decision = provenance(table, source).decision!;
        mapped.source_hasil = decision.sourceHasil; mapped.source_status_persetujuan = decision.sourceStatusPersetujuan;
        mapped.transform_provenance = { $json: canonical(decision.transformProvenance) };
      }
      return { kind: "insert", table, pk: primaryKey(source, sourceCatalog.tables[table].primaryKey), source, mapped, provenance: provenance(table, source) };
    }));
  }
  for (const [table, columns] of Object.entries(deferred)) add(`restore:${table}`, snapshot.tables[table].rows.filter((r) => columns.some((c) => r[c] !== null)).map((source) => ({
    kind: "restore", table, pk: primaryKey(source, sourceCatalog.tables[table].primaryKey), source,
    mapped: Object.fromEntries([...sourceCatalog.tables[table].primaryKey, ...columns].map((c) => [c, source[c]])), provenance: provenance(table, source),
  })));
  return { binding: snapshotBinding(snapshot), snapshotId: snapshot.id, checksum: snapshot.checksum, mappingVersion: snapshot.mappingVersion, stages };
}
export interface ImportTransaction {
  claim(plan: ImportPlan): Promise<void>;
  checkpoint(stage: string): Promise<string | null>;
  verify(operation: ImportOperation): Promise<void>;
  insert(operation: ImportOperation): Promise<void>;
  restore(operation: ImportOperation): Promise<void>;
  saveCheckpoint(stage: string, checksum: string): Promise<void>;
  resetSequences(tables: string[]): Promise<void>;
  files(entries: ManifestEntry[], verify: boolean): Promise<void>;
}
export interface ImportStore {
  // Must use one physical connection, BEGIN/COMMIT, rollback on ANY error, and an exclusive
  // transaction advisory lock for this import namespace. Checkpoints commit WITH data.
  transaction<T>(work: (tx: ImportTransaction) => Promise<T>): Promise<T>;
}
// An approved operator can supply a store; this module never creates a DB client or reads env.
// There is intentionally no live-import CLI. The provided CLI only performs a read-only dry-run.
export async function importSnapshot(input: unknown, roots: Record<"private" | "public", string>, store: ImportStore, batchSize = 250) {
  const report = await dryRun(input, roots);
  if (!report.valid || !report.snapshot) throw new Error(`import-preflight-failed:${report.issues.map((i) => i.code).join(",")}`);
  const plan = createPlan(report.snapshot, report.order, batchSize), completed: string[] = [];
  for (const stage of plan.stages) await store.transaction(async (tx) => {
    await tx.claim(plan);
    const checkpoint = await tx.checkpoint(stage.name);
    if (checkpoint) {
      if (checkpoint !== stage.checksum) throw new Error("checkpoint-checksum-mismatch");
      for (const operation of stage.operations) await tx.verify(operation);
    } else {
      for (const operation of stage.operations) {
        if (operation.kind === "insert") await tx.insert(operation); else await tx.restore(operation);
      }
      await tx.saveCheckpoint(stage.name, stage.checksum);
    }
    completed.push(stage.name);
  });
  await store.transaction(async (tx) => {
    await tx.claim(plan);
    const checksum = digest(report.snapshot!.files), previous = await tx.checkpoint("files");
    if (previous && previous !== checksum) throw new Error("checkpoint-checksum-mismatch");
    await tx.files(report.snapshot!.files, Boolean(previous));
    if (!previous) await tx.saveCheckpoint("files", checksum);
  });
  // ALTER SEQUENCE RESTART is transactional; setval() is deliberately avoided.
  await store.transaction(async (tx) => {
    await tx.claim(plan);
    const sum = digest(plan.stages.map((s) => s.checksum));
    const previous = await tx.checkpoint("sequences");
    if (previous && previous !== sum) throw new Error("checkpoint-checksum-mismatch");
    // Verify final deferred references too before advancing a single sequence.
    for (const stage of plan.stages) for (const op of stage.operations) await tx.verify({ ...op, kind: "restore" });
    if (!previous) {
      await tx.resetSequences(report.order.filter((t) => !archiveOnly.has(t) && Object.values(targetCatalog.tables[t].columns).some((c) => c.generated && c.type === "BigInt")));
      await tx.saveCheckpoint("sequences", sum);
    }
  });
  return { binding: plan.binding, stages: completed, sourceRows: Object.values(report.snapshot.tables).reduce((n, t) => n + t.rows.length, 0), sequencesPrepared: true, cutoverVerified: false };
}

export function initialRow(operation: ImportOperation): Row {
  return { ...operation.mapped, ...Object.fromEntries((deferred[operation.table] ?? []).map((c) => [c, null])) };
}
