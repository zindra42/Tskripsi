import { canonical, canonicalJson, digest, parseJson, manifestEntry, cellSchema, type Cell, type Row } from "./contract";
import { archiveOnly, deferred, sourceCatalog, targetCatalog } from "./catalog";
import { initialRow, type ImportPlan, type ImportStore, type ImportTransaction } from "./importer";
import type { TargetCapture } from "./reconcile";

export type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
export type TransactionProvider = <T>(work: (query: Query) => Promise<T>) => Promise<T>;
export const quoteIdentifier = (value: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error("invalid-sql-identifier");
  return `"${value}"`;
};
const param = (v: Cell) => v && typeof v === "object" ? v.$json : v;
function where(table: string, source: Row) {
  const columns = sourceCatalog.tables[table].primaryKey;
  return { sql: columns.map((c, i) => `${quoteIdentifier(c)} = $${i + 1}`).join(" AND "), params: columns.map((c) => param(source[c])) };
}
export function insertStatement(table: string, row: Row) {
  if (!sourceCatalog.tables[table] || archiveOnly.has(table)) throw new Error("unknown-import-target");
  const columns = Object.keys(row);
  if (columns.some((c) => !targetCatalog.tables[table].columns[c])) throw new Error("unknown-import-column");
  return { sql: `INSERT INTO public.${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})`, params: columns.map((c) => param(row[c])) };
}
// Normalizes SELECT values for comparison without Number conversion of BIGINT or NUMERIC.
export function projection(table: string, row: Row) {
  return Object.entries(row).map(([c]) => {
    const col = targetCatalog.tables[table].columns[c], q = quoteIdentifier(c);
    return col.type === "Json" ? `CASE WHEN ${q} IS NULL THEN NULL ELSE ${q}::text END AS ${q}`
      : ["BigInt", "Decimal"].includes(col.type) ? `${q}::text AS ${q}`
      : col.type === "DateTime" ? `to_char(${q}, '${col.native[0] === "Date" ? "YYYY-MM-DD" : 'YYYY-MM-DD"T"HH24:MI:SS".000Z"'}') AS ${q}` : q;
  }).join(", ");
}
function equalValue(actual: unknown, expected: Cell) {
  if (expected && typeof expected === "object") return typeof actual === "string" && canonicalJson(actual) === canonicalJson(expected.$json);
  return actual === expected;
}
export function postgresImportStore(provider: TransactionProvider): ImportStore {
  return { transaction: (work) => provider(async (query) => {
    // A single namespace lock prevents concurrent snapshots from claiming the same target.
    await query("SELECT pg_advisory_xact_lock(735027007)");
    await query("SET LOCAL TIME ZONE 'UTC'");
    let binding = "";
    const tx: ImportTransaction = {
      async claim(plan: ImportPlan) {
        binding = plan.binding;
        const runs = await query("SELECT binding, snapshot_id FROM public.legacy_import_runs");
        if (runs.rows.some((r) => r.binding !== binding)) throw new Error("target-already-bound-to-another-snapshot");
        if (!runs.rows.length) {
          // New target must be empty, including runtime auth/receipt tables. No live account is overwritten.
          for (const table of Object.keys(targetCatalog.tables).filter((t) => !t.startsWith("legacy_import_"))) {
            if ((await query(`SELECT 1 FROM public.${quoteIdentifier(table)} LIMIT 1`)).rows.length) throw new Error(`target-not-empty:${table}`);
          }
          await query("INSERT INTO public.legacy_import_runs (binding, snapshot_id, snapshot_checksum, mapping_version) VALUES ($1,$2,$3,$4)", [binding, plan.snapshotId, plan.checksum, plan.mappingVersion]);
        }
      },
      async checkpoint(stage) { return (await query("SELECT checksum FROM public.legacy_import_checkpoints WHERE binding=$1 AND stage=$2", [binding, stage])).rows[0]?.checksum as string ?? null; },
      async verify(op) {
        const archive = (await query("SELECT source_checksum, binding, source_json::text AS source_json, provenance::text AS provenance FROM public.legacy_import_rows WHERE source_table=$1 AND source_pk=$2", [op.table, op.pk])).rows[0];
        if (!archive || archive.binding !== binding || archive.source_checksum !== digest(op.source)
          || canonicalJson(String(archive.source_json)) !== canonicalJson(canonical(op.source))
          || canonicalJson(String(archive.provenance)) !== canonicalJson(canonical(op.provenance))) throw new Error("archive-checksum-mismatch");
        if (archiveOnly.has(op.table)) return;
        const expected = { ...op.mapped };
        // A completed restore may already have populated these during restart.
        if (op.kind === "insert") for (const c of deferred[op.table] ?? []) delete expected[c];
        const clause = where(op.table, op.source);
        const actual = (await query(`SELECT ${projection(op.table, expected)} FROM public.${quoteIdentifier(op.table)} WHERE ${clause.sql}`, clause.params)).rows[0];
        if (!actual || Object.entries(expected).some(([c, v]) => !equalValue(actual[c], v))) throw new Error("target-row-mismatch");
      },
      async insert(op) {
        // Plain INSERT rejects conflicts. ON CONFLICT UPDATE would overwrite unrelated history.
        await query("INSERT INTO public.legacy_import_rows (source_table, source_pk, binding, source_json, source_checksum, provenance) VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb)", [op.table, op.pk, binding, canonical(op.source), digest(op.source), canonical(op.provenance)]);
        if (!archiveOnly.has(op.table)) { const statement = insertStatement(op.table, initialRow(op)); await query(statement.sql, statement.params); }
      },
      async restore(op) {
        const clause = where(op.table, op.source), columns = deferred[op.table];
        const result = await query(`UPDATE public.${quoteIdentifier(op.table)} SET ${columns.map((c, i) => `${quoteIdentifier(c)}=$${clause.params.length + i + 1}`).join(",")} WHERE ${clause.sql}`, [...clause.params, ...columns.map((c) => param(op.mapped[c]))]);
        if (result.rowCount !== 1) throw new Error("restore-row-missing");
      },
      async saveCheckpoint(stage, checksum) { await query("INSERT INTO public.legacy_import_checkpoints (binding, stage, checksum) VALUES ($1,$2,$3)", [binding, stage, checksum]); },
      async files(entries, verify) {
        for (const entry of entries) {
          const id = digest({ binding, disk: entry.disk, path: entry.path, table: entry.table, pk: entry.pk, pointer: entry.pointer });
          if (verify) {
            const stored = (await query("SELECT descriptor::text AS descriptor FROM public.legacy_import_files WHERE id=$1 AND binding=$2", [id, binding])).rows[0];
            if (!stored || canonicalJson(String(stored.descriptor)) !== canonicalJson(canonical(entry))) throw new Error("manifest-checkpoint-mismatch");
          } else await query("INSERT INTO public.legacy_import_files (id,binding,disk,path,descriptor) VALUES ($1,$2,$3,$4,$5::jsonb)", [id, binding, entry.disk, entry.path, canonical(entry)]);
        }
      },
      async resetSequences(tables) {
        for (const table of tables) {
          await query(`LOCK TABLE public.${quoteIdentifier(table)} IN ACCESS EXCLUSIVE MODE`);
          const column = Object.entries(targetCatalog.tables[table].columns).find(([, c]) => c.generated && c.type === "BigInt")![0];
          const sequence = (await query("SELECT n.nspname AS schema, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=pg_get_serial_sequence($1,$2)::regclass", [`public.${table}`, column])).rows[0];
          const max = (await query(`SELECT COALESCE(MAX(${quoteIdentifier(column)}), 0)::text AS max FROM public.${quoteIdentifier(table)}`)).rows[0].max;
          const next = BigInt(String(max)) + 1n;
          if (!sequence || next > 9223372036854775807n) throw new Error("sequence-range-or-missing");
          await query(`ALTER SEQUENCE ${quoteIdentifier(String(sequence.schema))}.${quoteIdentifier(String(sequence.name))} RESTART WITH ${next}`);
        }
      },
    };
    return work(tx);
  }) };
}

// Supply a read-only REPEATABLE READ transaction on the frozen target. No connection,
// environment or sequence nextval() is opened here. Execution still needs operator approval.
export async function capturePostgres(query: Query): Promise<TargetCapture> {
  const tables: TargetCapture["tables"] = {}, nextSequences: Record<string, string> = {};
  for (const [table, spec] of Object.entries(targetCatalog.tables).filter(([t]) => !t.startsWith("legacy_import_"))) {
    const shape = Object.fromEntries(Object.keys(spec.columns).map((c) => [c, null]));
    const result = await query(`SELECT ${projection(table, shape)} FROM public.${quoteIdentifier(table)}`);
    tables[table] = result.rows.map((row) => Object.fromEntries(Object.entries(spec.columns).map(([c, column]) => [c,
      column.type === "Json" && row[c] !== null ? { $json: String(row[c]) } : cellSchema.parse(row[c]),
    ])));
    const generated = Object.entries(spec.columns).find(([, c]) => c.generated && c.type === "BigInt");
    if (generated) {
      const sequence = (await query("SELECT n.nspname AS schema, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=pg_get_serial_sequence($1,$2)::regclass", [`public.${table}`, generated[0]])).rows[0];
      if (!sequence) throw new Error("sequence-missing");
      const state = (await query(`SELECT last_value::text AS value, is_called AS called FROM ${quoteIdentifier(String(sequence.schema))}.${quoteIdentifier(String(sequence.name))}`)).rows[0];
      if (!state || typeof state.called !== "boolean" || !/^\d+$/.test(String(state.value))) throw new Error("sequence-state-unverified");
      nextSequences[table] = String(BigInt(String(state.value)) + (state.called ? 1n : 0n));
    }
  }
  const archive = (await query("SELECT source_table, source_pk, binding, source_json::text AS source_json, source_checksum, provenance::text AS provenance FROM public.legacy_import_rows")).rows.map((row) => ({
    table: String(row.source_table), pk: String(row.source_pk), binding: String(row.binding), source: parseJson(String(row.source_json)) as Row,
    checksum: String(row.source_checksum), provenance: parseJson(String(row.provenance)),
  }));
  const files = (await query("SELECT descriptor::text AS descriptor FROM public.legacy_import_files")).rows.map((row) => manifestEntry.parse(parseJson(String(row.descriptor))));
  return { tables, nextSequences, archive, files };
}
