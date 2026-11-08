import { readFile, writeFile } from "node:fs/promises";
import { dryRun } from "../src/lib/migration/validate";

// No dotenv, DB client, bootstrap, writes to source/storage or import execution.
async function main() {
  const [snapshotPath, privateRoot, publicRoot, reportPath] = process.argv.slice(2);
  if (!snapshotPath || !privateRoot || !publicRoot || !reportPath) throw new Error("invalid-arguments");
  const result = await dryRun(JSON.parse(await readFile(snapshotPath, "utf8")), { private: privateRoot, public: publicRoot });
  const { snapshot, ...report } = result;
  // Deliberately omit source rows, file paths, identity values, JSON payloads, tokens and hashes.
  await writeFile(reportPath, JSON.stringify({ ...report, snapshotId: snapshot?.id, checksum: snapshot?.checksum, liveImportExecuted: false, cutoverVerified: false }, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ valid: result.valid, issueCount: result.issues.length, reportWritten: true }));
  if (!result.valid) process.exitCode = 1;
}
main().catch(() => {
  // Parser exceptions can include private source text. Never echo them.
  console.error("Dry-run failed; check the contract and private report destination."); process.exitCode = 1;
});
