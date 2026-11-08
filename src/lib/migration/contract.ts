import { createHash } from "node:crypto";
import { z } from "zod";

export const MAPPING_VERSION = "sias-terminal-20261105-v1";
export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export function canonical(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}
export const digest = (value: unknown) => sha256(canonical(value));
export function canonicalJson(text: string): string {
  // Node's reviver context exposes the original number lexeme, including integers beyond
  // MAX_SAFE_INTEGER. Never compare JSON by first rounding those numbers through Number.
  class NumericLexeme { constructor(readonly value: string) {} }
  const parsed: unknown = parseJson(text, (_key, value, context?: { source?: string }) => {
    if (typeof value !== "number") return value;
    if (!context?.source) throw new Error("lossless-json-parser-required");
    const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(context.source)!;
    let digits = (match[2] + (match[3] ?? "")).replace(/^0+/, "");
    let exponent = BigInt(match[4] ?? "0") - BigInt((match[3] ?? "").length);
    while (digits.endsWith("0")) { digits = digits.slice(0, -1); exponent++; }
    return new NumericLexeme(digits ? `${match[1]}${digits}e${exponent}` : "0");
  });
  // Tag every node: a user object such as {$number:"1e0"} cannot impersonate a number.
  function tagged(value: unknown): unknown {
    if (value instanceof NumericLexeme) return ["number", value.value];
    if (Array.isArray(value)) return ["array", value.map(tagged)];
    if (value && typeof value === "object") return ["object", Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([k, v]) => [k, tagged(v)])];
    return [value === null ? "null" : typeof value, value];
  }
  return canonical(tagged(parsed));
}
export function parseJson(text: string, reviver?: Parameters<typeof JSON.parse>[1]): unknown {
  try { return JSON.parse(text, reviver); } catch { throw new Error("invalid-json"); }
}
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().regex(/^[a-z][a-z0-9_]*$/);
export const cellSchema = z.union([z.string(), z.number().int().safe(), z.boolean(), z.null(), z.object({ $json: z.string() }).strict()]);
export type Cell = z.infer<typeof cellSchema>;
export type Row = Record<string, Cell>;
export const manifestEntry = z.object({
  table: identifier, pk: z.string().min(1), pointer: z.string().startsWith("/"),
  disk: z.enum(["private", "public"]), path: z.string().min(1).max(1000), bytes: z.string().regex(/^(0|[1-9]\d*)$/).refine((v) => BigInt(v) <= 9223372036854775807n),
  mime: z.string().min(1), fileSha256: hash, version: z.string().nullable(), status: z.string().nullable(),
  urls: z.array(z.string()), purpose: z.enum(["reference", "pdf-cache", "unreferenced"]),
  ownershipEvidence: z.string().min(1).nullable(),
}).strict();
export type ManifestEntry = z.infer<typeof manifestEntry>;
export const snapshotSchema = z.object({
  format: z.literal("sias-controlled-export-v1"), id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  mappingVersion: z.literal(MAPPING_VERSION), checksum: hash,
  source: z.object({ driver: z.enum(["mysql", "mariadb"]), exportedAt: z.string().datetime({ offset: true }),
    sourceRevision: z.string().min(1), timezone: z.string().nullable(), timezoneEvidence: z.string().nullable(),
    migrations: z.array(z.object({ name: z.string(), sha256: hash, batch: z.number().int().positive() }).strict()),
    schema: z.record(identifier, z.object({ columns: z.array(identifier), primaryKey: z.array(identifier), unique: z.array(z.array(identifier)), columnTypes: z.record(identifier, z.object({ type: z.string(), nullable: z.boolean() }).strict()), foreignKeys: z.array(z.object({ column: identifier, table: identifier, target: identifier }).strict()) }).strict()),
    storageInventoryComplete: z.object({ private: z.boolean(), public: z.boolean() }).strict(),
    qrOrigins: z.array(z.string().url()),
  }).strict(),
  tables: z.record(identifier, z.object({ count: z.string().regex(/^(0|[1-9]\d*)$/), checksum: hash,
    rows: z.array(z.record(identifier, cellSchema)) }).strict()),
  files: z.array(manifestEntry),
}).strict();
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Issue = { code: string; table?: string; pk?: string; column?: string; stage?: string };
export function jsonValue(value: Cell): unknown {
  return value && typeof value === "object" ? parseJson(value.$json) : value;
}
export function primaryKey(row: Row, columns: string[]): string {
  return canonical(columns.map((c) => row[c]));
}
export function sealSnapshot(input: Omit<Snapshot, "checksum">): Snapshot {
  return { ...input, checksum: digest(input) };
}
export function snapshotBinding(snapshot: Snapshot) {
  return digest({ id: snapshot.id, checksum: snapshot.checksum, mappingVersion: snapshot.mappingVersion });
}
