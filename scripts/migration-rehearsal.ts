// Synthetic rehearsal ONLY. No env, SQL connection, production files or credentials.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { syntheticSnapshot, reseal } from "../tests/fixtures/migration";
import { syntheticImportStore } from "../tests/helpers/migration-store";
import { inventoryFiles } from "../src/lib/migration/files";
import { dryRun } from "../src/lib/migration/validate";
import { importSnapshot } from "../src/lib/migration/importer";
import { reconcileImported } from "../src/lib/migration/reconcile";

async function main() {
  const folder = await mkdtemp(path.join(tmpdir(), "sias-synthetic-rehearsal-"));
  try {
    const roots = { private: path.join(folder, "private"), public: path.join(folder, "public") };
    for (const root of Object.values(roots)) { await mkdir(root); await writeFile(path.join(root, "synth.pdf"), "%PDF-1.4 synthetic fixture only"); }
    let snapshot = syntheticSnapshot(); snapshot.files = await inventoryFiles(snapshot, roots); snapshot = reseal(snapshot);
    const preflight = await dryRun(snapshot, roots); assert.deepEqual(preflight.issues, []);
    const memory = syntheticImportStore(); memory.failOn("pengguna", snapshot.tables.pengguna.rows[1]);
    await assert.rejects(importSnapshot(snapshot, roots, memory.store), /synthetic-partial-write-failure/);
    assert.equal(memory.capture().tables.pengguna.length, 0);
    const outcome = await importSnapshot(snapshot, roots, memory.store);
    await importSnapshot(snapshot, roots, memory.store);
    const result = await reconcileImported(snapshot, memory.capture(), roots); assert.deepEqual(result.issues, []);
    console.log(JSON.stringify({ syntheticOnly: true, sourceTables: Object.keys(snapshot.tables).length, sourceRows: outcome.sourceRows,
      stages: outcome.stages.length, fileEntries: snapshot.files.length, preflightValid: preflight.valid, reconciliationValid: result.valid,
      rollbackRestartReimport: true, releaseGaps: preflight.releaseGaps.map((g) => g.code), liveImportExecuted: false, cutoverVerified: false }, null, 2));
  } finally { await rm(folder, { recursive: true, force: true }); }
}
main().catch(() => { console.error("Synthetic rehearsal failed."); process.exitCode = 1; });
