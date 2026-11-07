// Read-only source oracle; neither process loads Laravel or connects to a database.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { EXAMINER_WEIGHTS, formScore, recap, grade } from "../src/lib/sidang/policy";

const legacy = process.argv[2];
if (!legacy) throw new Error("Usage: npx tsx scripts/verify-legacy-sidang.ts <Laravel-root>");
const requests: object[] = [], expected: (string | string[])[] = [];
for (const role of ["pembimbing", "penguji_1", "penguji_2"]) {
  for (const base of [0, 1, 4.99, 5, 6.51, 8.25, 9.99, 10]) {
    const values = Object.fromEntries(Object.keys(EXAMINER_WEIGHTS).map((key, index) => [key, Math.max(0, base - index * 0.01).toFixed(2)]));
    requests.push({ kind: "form", role, values }); expected.push(formScore(role, values).total);
  }
}
for (const method of ["rekap_rata_rata", "proporsional_34_33_33"]) {
  for (const values of [[90, 80, 70], [83.17, 83.17, 83.17], [50.99, 51, 51.01], [0, 100, 65.55], [79.99, 80.01, 85]]) {
    const result = recap(...values.map(String) as [string, string, string], method);
    requests.push({ kind: "recap", values: [...values, method] }); expected.push([result, grade(result)]);
  }
}
const actual: unknown = JSON.parse(execFileSync("php", [path.join(import.meta.dirname, "legacy-sidang-oracle.php"), legacy],
  { input: JSON.stringify(requests), encoding: "utf8", timeout: 10000 }));
assert.deepEqual(actual, expected);
console.log(`${expected.length} kasus form/rekap sidang identik dengan source PHP, tanpa bootstrap Laravel atau database.`);
