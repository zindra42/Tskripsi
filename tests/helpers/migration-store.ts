import { canonical, digest, type Row, type ManifestEntry } from "../../src/lib/migration/contract";
import { archiveOnly, sourceCatalog } from "../../src/lib/migration/catalog";
import { initialRow, type ImportOperation, type ImportPlan, type ImportStore, type ImportTransaction } from "../../src/lib/migration/importer";
import type { ImportedArchive, TargetCapture } from "../../src/lib/migration/reconcile";
import { rowKey } from "../fixtures/migration";

export function syntheticImportStore() {
  let state: { plan: ImportPlan | null; checkpoints: Record<string, string>; tables: Record<string, Row[]>; archive: ImportedArchive[]; sequences: Record<string, string>; files: ManifestEntry[] } = { plan: null, checkpoints: {}, tables: {}, archive: [], sequences: {}, files: [] };
  let failure: string | null = null, writes = 0;
  const store: ImportStore = { async transaction(work) {
    const draft = structuredClone(state);
    const verify = async (op: ImportOperation) => {
      const archived = draft.archive.find((a) => a.table === op.table && a.pk === op.pk);
      if (!archived || archived.checksum !== digest(op.source)) throw new Error("archive-checksum-mismatch");
      if (!archiveOnly.has(op.table)) {
        const row = draft.tables[op.table]?.find((r) => rowKey(op.table, r) === op.pk);
        if (!row || Object.entries(op.mapped).some(([c, v]) => op.kind === "insert" && ["dispensasi_id", "digantikan_oleh_id"].includes(c) ? false : canonical(row[c]) !== canonical(v))) throw new Error("target-row-mismatch");
      }
    };
    const tx: ImportTransaction = {
      async claim(plan) {
        if (draft.plan && draft.plan.binding !== plan.binding) throw new Error("target-already-bound-to-another-snapshot");
        draft.plan = plan;
        for (const table of Object.keys(sourceCatalog.tables)) if (!archiveOnly.has(table)) draft.tables[table] ??= [];
      },
      async checkpoint(stage) { return draft.checkpoints[stage] ?? null; },
      verify,
      async insert(op) {
        writes++;
        if (failure === `${op.table}:${op.pk}`) { failure = null; throw new Error("synthetic-partial-write-failure"); }
        if (draft.archive.some((a) => a.table === op.table && a.pk === op.pk)) throw new Error("duplicate-import");
        draft.archive.push({ table: op.table, pk: op.pk, binding: draft.plan!.binding, checksum: digest(op.source), source: structuredClone(op.source), provenance: op.provenance });
        if (!archiveOnly.has(op.table)) draft.tables[op.table].push(initialRow(op));
      },
      async restore(op) {
        const row = draft.tables[op.table].find((r) => rowKey(op.table, r) === op.pk);
        if (!row) throw new Error("restore-row-missing");
        Object.assign(row, op.mapped);
        if (failure === `restore:${op.table}:${op.pk}`) { failure = null; throw new Error("synthetic-partial-restore-failure"); }
      },
      async saveCheckpoint(stage, checksum) { draft.checkpoints[stage] = checksum; },
      async files(entries, verify) {
        if (verify && canonical(draft.files) !== canonical(entries)) throw new Error("manifest-checkpoint-mismatch");
        if (!verify) draft.files = structuredClone(entries);
      },
      async resetSequences(tables) { for (const table of tables) draft.sequences[table] = String(draft.tables[table].reduce((max, r) => BigInt(String(r.id)) > max ? BigInt(String(r.id)) : max, 0n) + 1n); },
    };
    const result = await work(tx);
    state = draft; return result;
  } };
  return { store, failOn(table: string, row: Row) { failure = `${table}:${rowKey(table, row)}`; },
    failRestore(table: string, row: Row) { failure = `restore:${table}:${rowKey(table, row)}`; },
    capture(): TargetCapture { return structuredClone({ tables: state.tables, archive: state.archive, nextSequences: state.sequences, files: state.files }); },
    checkpoints: () => state.checkpoints, writes: () => writes,
    corrupt(table: string, column: string, value: string) { state.tables[table][0][column] = value; },
  };
}
