import { snapshotSchema, digest, canonical, primaryKey, jsonValue, parseJson, type Snapshot, type Row, type Issue } from "./contract";
import { sourceCatalog, targetCatalog, tableOrder, foreignKeys, archiveOnly, mapRow, assertBigint, timestamp, sourceColumnType } from "./catalog";
import { inventoryFiles, validateManifest, verifyFiles } from "./files";
import { preserveLegacyDecision, reconcileSidang } from "../sidang/reconciliation";
import { releaseCompatibility } from "./compatibility";

export type Validation = { valid: boolean; issues: Issue[]; observations: Issue[]; releaseGaps: Issue[]; snapshot?: Snapshot; order: string[]; schemaEpoch: string; filesVerified: boolean };
export function validateSnapshot(input: unknown): Validation {
  const parsed = snapshotSchema.safeParse(input), issues: Issue[] = [], observations: Issue[] = [];
  const report: Validation = { valid: false, issues, observations, releaseGaps: [], order: [], schemaEpoch: "unverified", filesVerified: false };
  if (!parsed.success) { issues.push(...parsed.error.issues.map((i) => ({ code: "invalid-contract", column: i.path.map(String).join(".") }))); return report; }
  const snapshot = parsed.data; report.snapshot = snapshot;
  const { checksum, ...payload } = snapshot;
  if (digest(payload) !== checksum) issues.push({ code: "snapshot-checksum" });
  const ledger = snapshot.source.migrations, known = sourceCatalog.migrations;
  const prefix = ledger.length <= known.length && ledger.every((m, i) => m.name === known[i].name && m.sha256 === known[i].sha256);
  if (!prefix) issues.push({ code: "schema-version-unverified" });
  else {
    const names = ledger.map((m) => m.name);
    report.schemaEpoch = !names.some((n) => n.includes("backfill_dokumen_acc")) ? "before-acc-backfill" : !names.some((n) => n.includes("update_modul_0_2_paket_a")) ? "after-acc-before-archives" : !names.some((n) => n.includes("backfill_legacy_berita_acara")) ? "after-archives-before-approval-backfill" : ledger.length === known.length ? "terminal-20261105" : "after-approval-before-cleanup";
    if (ledger.length !== known.length) issues.push({ code: `unsupported-schema-epoch:${report.schemaEpoch}` });
  }
  if (!["Asia/Makassar", "UTC"].includes(snapshot.source.timezone ?? "") || !snapshot.source.timezoneEvidence) issues.push({ code: "timezone-unverified" });
  if (!snapshot.source.storageInventoryComplete.private || !snapshot.source.storageInventoryComplete.public) issues.push({ code: "storage-inventory-incomplete" });
  try { report.order = tableOrder(); } catch { issues.push({ code: "additional-topology-cycle" }); }
  for (const table of Object.keys(snapshot.tables)) if (!sourceCatalog.tables[table]) issues.push({ code: "unknown-source-table", table });
  for (const table of Object.keys(snapshot.source.schema)) if (!sourceCatalog.tables[table]) issues.push({ code: "unknown-schema-table", table });
  const mapped: Record<string, Row[]> = {};
  for (const [table, schema] of Object.entries(sourceCatalog.tables)) {
    const data = snapshot.tables[table], actualSchema = snapshot.source.schema[table];
    if (!data) { issues.push({ code: "table-missing", table }); continue; }
    if (!actualSchema || canonical([...actualSchema.columns].sort()) !== canonical(Object.keys(schema.columns).sort())) issues.push({ code: "schema-columns-mismatch", table });
    if (!actualSchema || canonical(actualSchema.primaryKey) !== canonical(schema.primaryKey)
      || canonical(actualSchema.unique.map(canonical).sort()) !== canonical(schema.unique.map(canonical).sort())) issues.push({ code: "schema-keys-mismatch", table });
    const expectedTypes = Object.fromEntries(Object.entries(schema.columns).map(([c, spec]) => [c, { type: sourceColumnType(spec), nullable: spec.nullable }]));
    if (!actualSchema || canonical(actualSchema.columnTypes) !== canonical(expectedTypes)) issues.push({ code: "schema-types-mismatch", table });
    // Source's conditional sidang FK is absent on the normal migration path.
    const expectedFks = schema.foreignKeys.map(({ column, table, target }) => ({ column, table, target }));
    if (!actualSchema || canonical(actualSchema.foreignKeys.map(canonical).sort()) !== canonical(expectedFks.map(canonical).sort())) issues.push({ code: "schema-constraints-mismatch", table });
    if (data.count !== String(data.rows.length) || data.checksum !== digest(data.rows)) issues.push({ code: "table-integrity", table });
    const pks = new Set<string>(); mapped[table] = [];
    for (const row of data.rows) {
      const pk = primaryKey(row, schema.primaryKey);
      if (pks.has(pk)) issues.push({ code: "duplicate-primary-key", table, pk });
      pks.add(pk);
      if (canonical(Object.keys(row).sort()) !== canonical(Object.keys(schema.columns).sort())) { issues.push({ code: "row-columns-mismatch", table, pk }); continue; }
      for (const [column, spec] of Object.entries(schema.columns)) {
        const value = row[column];
        try {
          if (value === null) { if (!spec.nullable) throw new Error("source-nullability"); continue; }
          if (["id", "foreignId", "unsignedBigInteger", "bigInteger"].includes(spec.type)) assertBigint(value);
          if (spec.type === "json") { if (!value || typeof value !== "object") throw new Error("json-tag-required"); parseJson(value.$json); }
          if (spec.type === "enum") {
            const values = [...(spec.definition ?? "").matchAll(/'([^']*)'/g)].slice(1).map((m) => m[1]);
            if (typeof value !== "string" || !values.includes(value)) throw new Error("unknown-source-enum");
          }
          if (["date", "timestamp", "dateTime"].includes(spec.type)) timestamp(String(value), spec.type === "date" ? "date" : "timestamp", snapshot.source.timezone ?? "");
        } catch (e) { issues.push({ code: e instanceof Error ? e.message : "source-value", table, pk, column }); }
      }
      try { mapped[table].push(mapRow(table, row, snapshot.source.timezone ?? "")); }
      catch (e) { issues.push({ code: e instanceof Error ? e.message : "mapping", table, pk }); }
      if (table === "pengguna" && (typeof row.password !== "string" || !/^(\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}|\$argon2(?:id|i)\$v=\d+\$[^$]+\$[^$]+\$[^$]+)$/.test(row.password))) issues.push({ code: "unsupported-password-hash", table, pk });
      if (table === "notifications" && row.notifiable_type !== "App\\Models\\Pengguna") issues.push({ code: "unknown-notifiable-type", table, pk });
      for (const c of ["siklus_ke", "versi", "versi_jadwal"]) if (row[c] !== undefined && (typeof row[c] !== "number" && typeof row[c] !== "string" || !/^[1-9]\d*$/.test(String(row[c])))) issues.push({ code: "invalid-cycle-version", table, pk, column: c });
      if (table === "pengguna" && row.role === "admin_keuangan" && (row.status_akun !== "nonaktif" || row.deleted_at === null)) issues.push({ code: "finance-cleanup-state-ambiguous", table, pk });
    }
    const target = targetCatalog.tables[table];
    for (const columns of [...schema.unique, ...(target?.unique ?? [])]) {
      const seen = new Set<string>();
      for (const row of mapped[table]) {
        if (columns.some((c) => row[c] === null || row[c] === undefined)) continue;
        const key = canonical(columns.map((c) => target?.columns[c]?.native[0] === "Citext" ? String(row[c]).toLowerCase() : row[c]));
        if (seen.has(key)) issues.push({ code: "unique-conflict", table, pk: primaryKey(row, schema.primaryKey), column: columns.join(",") });
        seen.add(key);
      }
    }
  }
  for (const [table, data] of Object.entries(snapshot.tables)) if (sourceCatalog.tables[table] && !archiveOnly.has(table)) for (const row of data.rows) {
    for (const fk of foreignKeys(table)) {
      const value = row[fk.column];
      if (value === null || value === undefined) continue;
      if (!snapshot.tables[fk.table]?.rows.some((r) => r[fk.target] === value)) issues.push({ code: "orphan-physical-or-logical-fk", table, pk: primaryKey(row, sourceCatalog.tables[table].primaryKey), column: fk.column, stage: table });
    }
    if (table === "pendaftaran_sempro" && row.dispensasi_id) {
      const d = snapshot.tables.dispensasi_kehadiran_sempro?.rows.find((r) => r.id === row.dispensasi_id);
      if (d && d.pendaftaran_sempro_id !== row.id) issues.push({ code: "dispensation-cycle-owner-mismatch", table, pk: String(row.id) });
    }
    if (table === "dokumen_verifikasi") {
      const visited = new Set<string>(); let current: Row | undefined = row;
      while (current?.digantikan_oleh_id) {
        if (visited.has(String(current.id))) { issues.push({ code: "replacement-cycle", table, pk: String(row.id) }); break; }
        visited.add(String(current.id)); current = snapshot.tables[table].rows.find((r) => r.id === current?.digantikan_oleh_id);
      }
    }
  }
  // Compare archive/suffixed identities against reused active identifiers without rewriting either.
  for (const [table, active, archived] of [["pengguna", "email", "email_arsip"], ["mahasiswa", "nim", "nim_arsip"], ["dosen", "nidn", "nidn_arsip"]]) {
    const rows = snapshot.tables[table]?.rows ?? [];
    for (const row of rows) {
      const historic = String(row[archived] ?? row[active] ?? "").replace(/\.deleted\.\d+$|_DEL_\d+$/, "").toLowerCase();
      if (historic && rows.some((r) => r !== row && typeof r[active] === "string" && r[active].toLowerCase() === historic)) observations.push({ code: "identity-reused-preserved", table, pk: primaryKey(row, sourceCatalog.tables[table].primaryKey), column: active });
    }
  }
  try {
    const result = reconcileSidang({
      registrations: (snapshot.tables.pendaftaran_sidang?.rows ?? []).map((r) => ({ id: String(r.id), id_pengajuan: String(r.id_pengajuan), siklus_ke: String(r.siklus_ke) })),
      assignments: (snapshot.tables.penugasan_penguji?.rows ?? []).map((r) => ({ id: String(r.id), id_sidang_daftar: r.id_sidang_daftar as string | null })),
      checklist: (snapshot.tables.checklist_dokumen?.rows ?? []).map((r) => ({ id: String(r.id), id_sidang_daftar: r.id_sidang_daftar as string | null })),
      schedules: (snapshot.tables.jadwal_sidang?.rows ?? []).map((r) => ({ id: String(r.id), id_sidang: String(r.id_sidang), status: String(r.status), versi: Number(r.versi) })),
      invitations: (snapshot.tables.dokumen_verifikasi?.rows ?? []).map((r) => ({ id: String(r.id), jenis_dokumen: String(r.jenis_dokumen), id_jadwal: r.id_jadwal as string | null, id_jadwal_sidang: r.id_jadwal_sidang as string | null, status: String(r.status), snapshot_json: jsonValue(r.snapshot_json) })),
    });
    issues.push(...result.issues.map((i) => ({ code: i.code, table: i.table, pk: i.id })));
  } catch { issues.push({ code: "sidang-preflight-invalid-input" }); }
  try { issues.push(...validateManifest(snapshot)); } catch { issues.push({ code: "manifest-invalid-json" }); }
  report.releaseGaps = releaseCompatibility(snapshot);
  report.valid = issues.length === 0;
  return report;
}
export function provenance(table: string, row: Row) {
  return { rule: "lossless-source-preservation-v1", sourceUnchanged: true, archiveOnly: archiveOnly.has(table),
    ...(table === "berita_acara" ? { decision: preserveLegacyDecision(row as { hasil: string | null; status_persetujuan: string | null; disetujui_kaprodi_at: string | null }) } : {}),
    ...(table === "pengguna" || table === "mahasiswa" || table === "dosen" ? { identityNormalization: "none" } : {}),
  };
}
export async function dryRun(input: unknown, roots?: Record<"private" | "public", string>): Promise<Validation> {
  const result = validateSnapshot(input);
  if (result.snapshot && result.valid && roots) {
    result.issues.push(...await verifyFiles(result.snapshot.files, roots));
    try {
      const inventory = await inventoryFiles(result.snapshot, roots);
      const key = (f: { disk: string; path: string }) => canonical([f.disk, f.path]);
      if (canonical([...new Set(inventory.map(key))].sort()) !== canonical([...new Set(result.snapshot.files.map(key))].sort())) result.issues.push({ code: "disk-inventory-mismatch" });
    } catch { result.issues.push({ code: "disk-inventory-unreadable" }); }
    result.filesVerified = result.issues.length === 0;
  }
  if (!roots) result.issues.push({ code: "file-bytes-unverified" });
  result.valid = result.issues.length === 0;
  return result;
}
