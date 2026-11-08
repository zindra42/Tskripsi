import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { canonical, canonicalJson, primaryKey } from "../src/lib/migration/contract";
import { sourceCatalog, targetCatalog, tableOrder, deferred, foreignKeys, mapCell, timestamp } from "../src/lib/migration/catalog";
import { validateSnapshot, dryRun } from "../src/lib/migration/validate";
import { inventoryFiles, verifyFiles, safeRelative } from "../src/lib/migration/files";
import { createPlan, importSnapshot } from "../src/lib/migration/importer";
import { postgresImportStore, insertStatement, projection, capturePostgres, type Query } from "../src/lib/migration/postgres";
import { assembleSnapshot } from "../src/lib/migration/export";
import { legacyRequest } from "../src/lib/migration/urls";
import { reconcileImported } from "../src/lib/migration/reconcile";
import { syntheticSnapshot, reseal, SYNTHETIC_PASSWORD } from "./fixtures/migration";
import { syntheticImportStore } from "./helpers/migration-store";

async function fixture() {
  const folder = await mkdtemp(path.join(tmpdir(), "sias-synthetic-import-"));
  const roots = { private: path.join(folder, "private"), public: path.join(folder, "public") };
  for (const root of Object.values(roots)) { await mkdir(root); await writeFile(path.join(root, "synth.pdf"), "%PDF-1.4 synthetic fixture only"); }
  let snapshot = syntheticSnapshot(); snapshot.files = await inventoryFiles(snapshot, roots); snapshot = reseal(snapshot);
  return { roots, snapshot, dispose: () => rm(folder, { recursive: true, force: true }) };
}
test("terminal catalog covers all 78 up() bodies, actual drops and both deferred graph edges", async () => {
  assert.equal(sourceCatalog.migrations.length, 78); assert.equal(Object.keys(sourceCatalog.tables).length, 51);
  assert.ok(sourceCatalog.tables.jobs && sourceCatalog.tables.job_batches && sourceCatalog.tables.cache && sourceCatalog.tables.log_super_admin);
  assert.ok(!sourceCatalog.tables.password_reset_tokens && !sourceCatalog.tables.otp_codes && !sourceCatalog.tables.dokumen_acc);
  assert.ok(!sourceCatalog.tables.penugasan_penguji.foreignKeys.some((k) => k.column === "id_sidang_daftar"));
  assert.ok(!sourceCatalog.tables.checklist_dokumen.foreignKeys.some((k) => k.column === "id_sidang_daftar"));
  assert.ok(foreignKeys("penugasan_penguji").some((k) => k.column === "id_sidang_daftar"));
  const order = tableOrder();
  for (const table of order) for (const fk of foreignKeys(table).filter((k) => !deferred[table]?.includes(k.column))) assert.ok(order.indexOf(fk.table) < order.indexOf(table), `${table}.${fk.column}`);
  const text = await readFile("prisma/schema.prisma", "utf8");
  const crypto = await import("node:crypto");
  assert.equal(targetCatalog.schemaSha256, crypto.createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex"));
});
test("synthetic rehearsal preserves bigint, raw identity/hash, decimals, decisions and full source state", async () => {
  const f = await fixture();
  try {
    const before = structuredClone(f.snapshot), report = await dryRun(f.snapshot, f.roots);
    assert.deepEqual(report.issues, []); assert.ok(report.valid && report.filesVerified);
    assert.ok(report.observations.some((i) => i.code === "identity-reused-preserved"));
    const memory = syntheticImportStore(), outcome = await importSnapshot(f.snapshot, f.roots, memory.store, 2);
    assert.equal(outcome.cutoverVerified, false);
    const target = memory.capture();
    assert.equal(target.tables.pengguna[0].id, "9007199254740993");
    assert.equal(target.tables.pengguna[0].password, SYNTHETIC_PASSWORD);
    assert.match(String(target.tables.pengguna[1].email), /\.deleted\.1791160000$/);
    assert.match(String(target.tables.mahasiswa[1].nim), /_DEL_1791160000$/);
    assert.equal(target.tables.berita_acara[0].nilai, "79.99");
    assert.equal(target.tables.berita_acara[0].status_persetujuan, "menunggu_nilai_lengkap");
    assert.equal(target.tables.berita_acara[0].source_hasil, "lulus_revisi");
    assert.equal(target.tables.pendaftaran_sempro[0].dispensasi_id, f.snapshot.tables.dispensasi_kehadiran_sempro.rows[0].id);
    assert.equal(target.tables.dokumen_verifikasi[0].digantikan_oleh_id, "9007199254741999");
    assert.equal(target.tables.dokumen_verifikasi[0].hash_sha256, null);
    assert.equal(target.tables.dokumen_verifikasi[0].token, f.snapshot.tables.dokumen_verifikasi.rows[0].token);
    assert.equal(target.tables.revisi_dokumen[0].versi, 3);
    assert.equal(target.tables.pengguna[0].created_at, "2026-10-20T00:01:02.000Z");
    assert.equal(target.tables.checklist_dokumen[0].status_item, before.tables.checklist_dokumen.rows[0].status_item);
    assert.ok(!target.tables.jobs && target.archive.some((r) => r.table === "jobs"));
    const reconciliation = await reconcileImported(f.snapshot, target, f.roots);
    assert.deepEqual(reconciliation.issues, []); assert.ok(reconciliation.valid);
    assert.deepEqual(f.snapshot, before);
    const after = canonical(target); await importSnapshot(f.snapshot, f.roots, memory.store, 2);
    assert.equal(canonical(memory.capture()), after);
  } finally { await f.dispose(); }
});
test("partial chunk rolls back rows and checkpoint; restart resumes without duplicates", async () => {
  const f = await fixture();
  try {
    const memory = syntheticImportStore(); memory.failOn("pengguna", f.snapshot.tables.pengguna.rows[1]);
    await assert.rejects(importSnapshot(f.snapshot, f.roots, memory.store, 100), /synthetic-partial-write-failure/);
    assert.equal(memory.capture().tables.pengguna.length, 0);
    assert.equal(memory.checkpoints()["insert:pengguna:0"], undefined);
    assert.ok(memory.checkpoints()["insert:bidang_keahlian:0"]);
    await importSnapshot(f.snapshot, f.roots, memory.store, 100);
    assert.equal(memory.capture().tables.pengguna.length, 2);
    assert.ok((await reconcileImported(f.snapshot, memory.capture(), f.roots)).valid);
    await assert.rejects(importSnapshot(f.snapshot, f.roots, memory.store, 1), /checkpoint-checksum-mismatch/);
    const changed = structuredClone(f.snapshot); changed.id = "different-snapshot";
    await assert.rejects(importSnapshot(reseal(changed), f.roots, memory.store, 100), /target-already-bound/);
    memory.corrupt("berita_acara", "nilai", "80.00");
    await assert.rejects(importSnapshot(f.snapshot, f.roots, memory.store, 100), /target-row-mismatch/);
  } finally { await f.dispose(); }
});
test("FK orphans, replacement loops and missing files stop preflight before any transaction", async () => {
  const f = await fixture();
  try {
    const snapshot = structuredClone(f.snapshot);
    snapshot.tables.checklist_dokumen.rows[0].id_sidang_daftar = "9223372036854775806";
    snapshot.tables.penugasan_penguji.rows[0].id_sidang_daftar = "9223372036854775806";
    const report = validateSnapshot(reseal(snapshot));
    assert.equal(report.issues.filter((i) => i.code === "orphan-sidang-fk").length, 2);
    assert.equal(report.issues.filter((i) => i.code === "orphan-physical-or-logical-fk" && i.column === "id_sidang_daftar").length, 2);
    const loop = structuredClone(f.snapshot); loop.tables.dokumen_verifikasi.rows[1].digantikan_oleh_id = loop.tables.dokumen_verifikasi.rows[0].id;
    assert.ok(validateSnapshot(reseal(loop)).issues.some((i) => i.code === "replacement-cycle"));
    await rm(path.join(f.roots.private, "synth.pdf"));
    const store = syntheticImportStore(); await assert.rejects(importSnapshot(f.snapshot, f.roots, store.store), /file-missing-or-unsafe/);
    assert.equal(store.writes(), 0);
  } finally { await f.dispose(); }
});
test("manifest binds JSON pointer, private/public bytes and completeness independently", async () => {
  const f = await fixture();
  try {
    const entries = f.snapshot.files.filter((x) => x.pointer === "/snapshot_json/file_acc_lama");
    assert.equal(entries.length, 4); assert.equal(new Set(entries.map((x) => x.disk)).size, 2);
    await writeFile(path.join(f.roots.public, "synth.pdf"), "%PDF-1.4 corrupt");
    assert.ok((await verifyFiles(f.snapshot.files, f.roots)).some((i) => i.code === "file-integrity-mismatch"));
    await writeFile(path.join(f.roots.public, "unlisted.pdf"), "%PDF-1.4 extra");
    assert.ok((await dryRun(f.snapshot, f.roots)).issues.some((i) => i.code === "disk-inventory-mismatch"));
    const changed = structuredClone(f.snapshot); changed.files[0].pointer = "/nonexistent";
    assert.ok(validateSnapshot(reseal(changed)).issues.some((i) => i.code === "file-owner-pointer-mismatch"));
    for (const value of ["../secret", "a/../b", "/absolute", "C:/secret", "a\\b", "%2e%2e/x", "a/./b", "a//b", "x.", "a\0b"]) assert.throws(() => safeRelative(value));
    assert.equal(safeRelative("public-file_1.pdf"), "public-file_1.pdf");
  } finally { await f.dispose(); }
});
test("storage directory symlink cannot escape a disk", async () => {
  const f = await fixture();
  try {
    await symlink(f.roots.public, path.join(f.roots.private, "linked"), "junction");
    const entry = { ...f.snapshot.files[0], path: "linked/synth.pdf", disk: "private" as const };
    assert.equal((await verifyFiles([entry], f.roots))[0].code, "file-missing-or-unsafe");
    await assert.rejects(inventoryFiles(f.snapshot, f.roots), /storage-symlink/);
  } finally { await f.dispose(); }
});
test("snapshot tampering, unsafe bigint, unknown epoch/schema/timezone are explicit gaps", async () => {
  const f = await fixture();
  try {
    const changed = structuredClone(f.snapshot); changed.tables.pengguna.rows[0].id = 9007199254740992;
    assert.ok(validateSnapshot(reseal(changed)).issues.some((i) => i.code === "invalid-contract"));
    changed.tables.pengguna.rows[0].id = "9223372036854775808";
    assert.ok(validateSnapshot(reseal(changed)).issues.some((i) => i.code === "bigint-string-required"));
    const old = structuredClone(f.snapshot); old.source.migrations = old.source.migrations.slice(0, 55);
    assert.ok(validateSnapshot(reseal(old)).issues.some((i) => i.code.startsWith("unsupported-schema-epoch:")));
    old.source.migrations[0].sha256 = "f".repeat(64);
    assert.ok(validateSnapshot(reseal(old)).issues.some((i) => i.code === "schema-version-unverified"));
    const unknown = structuredClone(f.snapshot); unknown.source.timezone = null; unknown.source.schema.pengguna.columns.pop();
    const result = validateSnapshot(reseal(unknown)); assert.ok(result.issues.some((i) => i.code === "timezone-unverified")); assert.ok(result.issues.some((i) => i.code === "schema-columns-mismatch"));
    const raw = structuredClone(f.snapshot); raw.tables.pengguna.rows[0].nama = "tampered";
    assert.ok(validateSnapshot(raw).issues.some((i) => i.code === "snapshot-checksum"));
    assert.ok((await dryRun(f.snapshot)).issues.some((i) => i.code === "file-bytes-unverified"));
  } finally { await f.dispose(); }
});
test("mapping rejects decimals/numeric IDs and preserves SQL null versus JSON null", () => {
  const decimal = targetCatalog.tables.pendaftaran_sidang.columns.ipk;
  for (const value of [3.99, "3.999", "10.00", "1e0"]) assert.throws(() => mapCell(value, decimal, "UTC"));
  assert.equal(mapCell("3.99", decimal, "UTC"), "3.99");
  const json = targetCatalog.tables.dokumen_verifikasi.columns.snapshot_json;
  assert.equal(mapCell(null, json, "UTC"), null);
  assert.deepEqual(mapCell({ $json: "null" }, json, "UTC"), { $json: "null" });
  assert.notEqual(canonicalJson('{"id":9007199254740992}'), canonicalJson('{"id":9007199254740993}'));
  assert.equal(canonicalJson('{"x":1.00}'), canonicalJson('{"x":1e0}'));
  assert.notEqual(canonicalJson('{"x":1}'), canonicalJson('{"x":{"$number":"1e0"}}'));
  assert.throws(() => timestamp("2026-02-30", "date", "UTC"));
  assert.throws(() => timestamp("2026-11-08 24:00:00", "timestamp", "UTC"));
  assert.equal(timestamp("2026-11-08", "date", "Asia/Makassar"), "2026-11-08");
});

test("JSON parser diagnostics redact source text and source unique/primary metadata is mandatory", async () => {
  const f = await fixture();
  try {
    const malformed = structuredClone(f.snapshot);
    malformed.tables.dokumen_verifikasi.rows[0].snapshot_json = { $json: '{"private":"DO-NOT-LOG-THIS", broken}' };
    const report = validateSnapshot(reseal(malformed));
    assert.ok(report.issues.some((i) => i.code === "invalid-json"));
    assert.ok(!JSON.stringify(report.issues).includes("DO-NOT-LOG-THIS"));
    const drift = structuredClone(f.snapshot); drift.source.schema.nomor_surat_dasar.unique = [];
    assert.ok(validateSnapshot(reseal(drift)).issues.some((i) => i.code === "schema-keys-mismatch"));
  } finally { await f.dispose(); }
});

test("failure after a deferred FK write rolls back that restore and resumes both graph edges", async () => {
  const f = await fixture();
  try {
    const memory = syntheticImportStore(); memory.failRestore("dokumen_verifikasi", f.snapshot.tables.dokumen_verifikasi.rows[0]);
    await assert.rejects(importSnapshot(f.snapshot, f.roots, memory.store), /synthetic-partial-restore-failure/);
    assert.equal(memory.capture().tables.dokumen_verifikasi[0].digantikan_oleh_id, null);
    assert.equal(memory.checkpoints()["restore:dokumen_verifikasi:0"], undefined);
    assert.ok(memory.checkpoints()["restore:pendaftaran_sempro:0"]);
    await importSnapshot(f.snapshot, f.roots, memory.store);
    assert.ok((await reconcileImported(f.snapshot, memory.capture(), f.roots)).valid);
  } finally { await f.dispose(); }
});

test("controlled export binds reviewed PDF cache to one exact document version and preserves notification payload", async () => {
  const f = await fixture();
  try {
    const { storageInventoryComplete: _inventory, ...source } = f.snapshot.source; void _inventory;
    const rows = Object.fromEntries(Object.entries(f.snapshot.tables).map(([t, v]) => [t, v.rows]));
    const doc = rows.dokumen_verifikasi[1];
    const cache = { disk: "private" as const, path: "synth.pdf", documentId: String(doc.id), version: String(doc.versi), status: String(doc.status), evidence: "Synthetic fixture version attestation" };
    const exported = await assembleSnapshot({ id: "synthetic-assembled", source, rows, cacheBindings: [cache] }, f.roots);
    assert.ok((await dryRun(exported, f.roots)).valid);
    assert.equal(exported.tables.notifications.rows[0].data, f.snapshot.tables.notifications.rows[0].data);
    assert.ok(exported.files.some((f) => f.purpose === "pdf-cache" && f.version === "2" && f.urls.includes(`/verifikasi/${doc.token}`)));
    await assert.rejects(assembleSnapshot({ id: "bad-version", source, rows, cacheBindings: [{ ...cache, version: "1" }] }, f.roots), /cache-ownership-unverified/);
    await assert.rejects(assembleSnapshot({ id: "bad-owner", source, rows, cacheBindings: [cache, cache] }, f.roots), /cache-owner-ambiguous/);
    const unproven = structuredClone(exported); unproven.files.find((f) => f.purpose === "pdf-cache")!.ownershipEvidence = null;
    assert.ok(validateSnapshot(reseal(unproven)).issues.some((i) => i.code === "pdf-cache-version-unverified"));
  } finally { await f.dispose(); }
});

test("legacy URL aliases preserve bigint strings and expose unmapped notification/QR cutover gaps", async () => {
  const id = "9007199254740993";
  assert.deepEqual(legacyRequest(`/proposal/download/${id}`), { type: "redirect", destination: `/berkas/proposal/${id}/proposal` });
  for (const alias of ["a", "acc", "surat-acc", "b", "undangan", "surat-undangan", "c", "penilaian", "form-penilaian", "nilai", "d", "berita-acara", "ba", "BA"])
    assert.equal(legacyRequest(`/sempro/dokumen-terbit/download/${alias}/${id}`)?.type, "sempro-document");
  for (const url of [`/sidang/dokumen-terbit/${id}`, `/sidang/dokumen/form-penilaian/${id}/${id}`, `/sempro/kehadiran/foto/${id}`, `/sempro/download-document/berita-acara/${id}`, `/storage/a.pdf`]) assert.ok(legacyRequest(url));
  for (const bad of ["/storage/../secret", "/storage/%2e%2e/secret", "/proposal/download/1e16", "/proposal/download/0001", "/storage/a\\b"]) assert.equal(legacyRequest(bad), null);
  const f = await fixture();
  try {
    const snapshot = structuredClone(f.snapshot); snapshot.source.qrOrigins = [];
    snapshot.tables.notifications.rows[0].data = '{"url":"https://legacy.example.test/unknown-legacy-feature"}';
    const report = await dryRun(reseal(snapshot), f.roots);
    assert.ok(report.valid);
    assert.ok(report.releaseGaps.some((g) => g.code === "notification-url-unmapped"));
    assert.ok(report.releaseGaps.some((g) => g.code === "printed-qr-origins-unverified"));
    assert.ok(report.releaseGaps.some((g) => g.code === "printed-qr-hostname-cutover-approval-required"));
  } finally { await f.dispose(); }
});

test("target capture reads lossless sequence state without nextval or DB writes", async () => {
  const sqlCalls: string[] = [];
  const query: Query = async (sql) => {
    sqlCalls.push(sql);
    return { rowCount: 0, rows: sql.startsWith("SELECT n.nspname") ? [{ schema: "public", name: "synthetic_seq" }]
      : sql.startsWith("SELECT last_value") ? [{ value: "9007199254741999", called: false }] : [] };
  };
  const captured = await capturePostgres(query);
  assert.equal(captured.nextSequences.pengguna, "9007199254741999");
  assert.deepEqual(captured.tables.auth_sessions, []);
  assert.ok(sqlCalls.every((sql) => sql.startsWith("SELECT ") && !sql.includes("nextval")));
});
test("reconciliation catches token, lifecycle, numeric, JSON, archive, count and sequence drift", async () => {
  const f = await fixture();
  try {
    const memory = syntheticImportStore(); await importSnapshot(f.snapshot, f.roots, memory.store);
    const changed = memory.capture();
    changed.tables.dokumen_verifikasi[0].token = "different";
    changed.tables.dokumen_verifikasi[1].status = "dicabut";
    changed.tables.penilaian_sidang[0].nilai_akhir = "80.02";
    changed.tables.dokumen_verifikasi[0].snapshot_json = { $json: '{"file_acc_lama":"synth.pdf","id":9007199254740992}' };
    changed.archive[0].checksum = "0".repeat(64);
    changed.nextSequences.pengguna = "1";
    changed.tables.logbook_bimbingan.push({ ...changed.tables.logbook_bimbingan[0] });
    const result = await reconcileImported(f.snapshot, changed, f.roots);
    assert.ok(!result.valid);
    for (const code of ["target-value-mismatch", "archive-reconciliation-mismatch", "sequence-reconciliation-mismatch", "target-count-or-duplicate"]) assert.ok(result.issues.some((i) => i.code === code), code);
  } finally { await f.dispose(); }
});
test("PostgreSQL adapter uses parameters, exclusive import lock, quoted identifiers and transactional sequence restart", async () => {
  const f = await fixture();
  try {
    const calls: { sql: string; params?: unknown[] }[] = [];
    const query: Query = async (sql, params) => {
      calls.push({ sql, params });
      return { rowCount: 1, rows: sql.startsWith("SELECT n.nspname") ? [{ schema: "public", name: "pengguna_id_seq" }] : sql.startsWith("SELECT COALESCE") ? [{ max: "9007199254742999" }] : [] };
    };
    const store = postgresImportStore(async (work) => work(query));
    const plan = createPlan(f.snapshot, tableOrder());
    await store.transaction(async (tx) => { await tx.claim(plan); await tx.insert(plan.stages.find((s) => s.name === "insert:pengguna:0")!.operations[0]); await tx.resetSequences(["pengguna"]); });
    assert.equal(calls[0].sql, "SELECT pg_advisory_xact_lock(735027007)");
    assert.ok(calls.some((c) => c.sql === 'ALTER SEQUENCE "public"."pengguna_id_seq" RESTART WITH 9007199254743000'));
    assert.ok(!calls.some((c) => /setval\(/.test(c.sql)));
    assert.ok(!calls.some((c) => c.sql.includes(SYNTHETIC_PASSWORD)));
    assert.ok(calls.some((c) => c.params?.includes(SYNTHETIC_PASSWORD)));
    assert.throws(() => insertStatement('pengguna;DROP TABLE pengguna', {}));
    assert.ok(projection("pengguna", { id: "9007199254740993" }).includes('"id"::text'));
    const archive = plan.stages.find((s) => s.name === "insert:jobs:0")!.operations[0];
    assert.equal(primaryKey(archive.source, sourceCatalog.tables.jobs.primaryKey), archive.pk);
  } finally { await f.dispose(); }
});
