import source from "./source-schema.json";
import target from "./target-schema.json";
import { canonical, parseJson, type Cell, type Row } from "./contract";

export type SourceColumn = { type: string; nullable: boolean; definition?: string; evidence: string };
export type ForeignKey = { column: string; table: string; target: string };
export type TargetColumn = { type: string; nullable: boolean; generated: boolean; default: string | null; native: (string | undefined)[]; enum: string[] | null };
export const sourceCatalog = source as { migrations: { name: string; sha256: string }[]; tables: Record<string, { columns: Record<string, SourceColumn>; primaryKey: string[]; unique: string[][]; foreignKeys: ForeignKey[] }> };
export const targetCatalog = target as { schemaSha256: string; tables: Record<string, { columns: Record<string, TargetColumn>; primaryKey: string[]; unique: string[][]; foreignKeys: ForeignKey[] }> };
export const archiveOnly = new Set(["sessions", "cache", "cache_locks", "jobs", "job_batches", "failed_jobs"]);
export const deferred: Record<string, string[]> = { pendaftaran_sempro: ["dispensasi_id"], dokumen_verifikasi: ["digantikan_oleh_id"] };
export function sourceColumnType(column: SourceColumn): string {
  const type = column.type, definition = column.definition ?? "";
  if (["id", "foreignId", "unsignedBigInteger"].includes(type)) return "bigint unsigned";
  if (type === "bigInteger") return "bigint";
  if (type === "enum") return `enum(${[...definition.matchAll(/'([^']*)'/g)].slice(1).map((m) => `'${m[1]}'`).join(",")})`;
  if (type === "decimal") return `decimal(${/decimal\('[^']+',\s*(\d+),\s*(\d+)\)/.exec(definition)?.slice(1).join(",")})`;
  if (["timestamp", "dateTime", "date", "time", "json", "year", "text", "longText", "mediumText"].includes(type)) return type.toLowerCase();
  if (type === "boolean") return "tinyint(1)";
  if (type === "uuid") return "char(36)";
  if (type.toLowerCase().includes("integer")) return `${/tiny/i.test(type) ? "tinyint" : /small/i.test(type) ? "smallint" : "int"}${type.startsWith("unsigned") ? " unsigned" : ""}`;
  return `varchar(${/\('[^']+',\s*(\d+)\)/.exec(definition)?.[1] ?? (type === "rememberToken" ? "100" : "255")})`;
}
// Source actor FKs omitted by the application datamodel remain validation dependencies.
export function foreignKeys(table: string): ForeignKey[] {
  const keys = [...(sourceCatalog.tables[table]?.foreignKeys ?? []), ...(targetCatalog.tables[table]?.foreignKeys ?? [])];
  if (["penugasan_penguji", "checklist_dokumen"].includes(table)) keys.push({ column: "id_sidang_daftar", table: "pendaftaran_sidang", target: "id" });
  if (table === "notifications") keys.push({ column: "notifiable_id", table: "pengguna", target: "id" });
  return [...new Map(keys.map((k) => [canonical([k.column, k.table, k.target]), k])).values()];
}
export function tableOrder(): string[] {
  const preferred = ["bidang_keahlian", "pengaturan_sistem", "rubrik_penilaian", "arsip_judul_skripsi", "pengguna", "mahasiswa", "dosen", "admin_keuangan", "dosen_keahlian", "password_reset_requests", "keahlian_change_requests", "biodata_change_requests", "verifikasi_pembayaran", "pengajuan_judul", "bimbingan", "logbook_bimbingan", "jadwal_bimbingan", "pengajuan_perubahan_judul", "pendaftaran_sempro", "dispensasi_kehadiran_sempro", "pendaftaran_sidang", "pembayaran_sidang", "penugasan_penguji", "jadwal_sempro", "jadwal_sidang", "konfirmasi_jadwal_sempro", "konfirmasi_jadwal_sidang", "riwayat_jadwal_sempro", "riwayat_jadwal_sidang", "permohonan_sempro", "permohonan_sidang", "kehadiran_seminar", "berita_acara", "penilaian_sidang", "revisi_dokumen", "checklist_dokumen", "nomor_surat_dasar", "nomor_surat_kategori", "dokumen_verifikasi", "pengumuman", "pengumuman_dibaca", "notifikasi", "notifications", "log_aktivitas", "log_super_admin"];
  const pending = Object.keys(sourceCatalog.tables).filter((t) => !archiveOnly.has(t)).sort((a, b) => preferred.indexOf(a) - preferred.indexOf(b));
  const done: string[] = [];
  while (pending.length) {
    const index = pending.findIndex((t) => foreignKeys(t).filter((k) => !deferred[t]?.includes(k.column)).every((k) => done.includes(k.table)));
    if (index < 0) throw new Error(`Additional dependency cycle: ${pending.join(",")}`);
    done.push(pending.splice(index, 1)[0]);
  }
  return [...done, ...archiveOnly];
}
export function assertBigint(value: Cell, signed = false) {
  if (typeof value !== "string" || !(signed ? /^-?(0|[1-9]\d*)$/ : /^(0|[1-9]\d*)$/).test(value)
    || BigInt(value) > 9223372036854775807n || BigInt(value) < (signed ? -9223372036854775808n : 0n)) throw new Error("bigint-string-required");
}
export function timestamp(value: string, kind: "date" | "timestamp", timezone: string): string {
  if (kind === "date") {
    if (!/^\d{4}-\d\d-\d\d$/.test(value) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error("invalid-date");
    return value;
  }
  // Laravel's historical columns are timestamp(0). Reject fractional seconds and zero dates.
  if (!/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d$/.test(value)) throw new Error("invalid-timestamp");
  const normalized = value.replace(" ", "T");
  if (new Date(`${normalized}Z`).toISOString().slice(0, 19) !== normalized) throw new Error("invalid-timestamp");
  if (!["Asia/Makassar", "UTC"].includes(timezone)) throw new Error("timezone-unverified");
  return new Date(`${normalized}${timezone === "UTC" ? "Z" : "+08:00"}`).toISOString();
}
export function mapCell(value: Cell, column: TargetColumn, timezone: string): Cell {
  if (value === null) { if (!column.nullable) throw new Error("nullability"); return null; }
  if (column.type === "BigInt") { assertBigint(value); return value; }
  if (column.type === "Json") {
    if (!value || typeof value !== "object") throw new Error("json-tag-required");
    parseJson(value.$json); return value;
  }
  if (column.type === "Boolean") {
    if (value === true || value === 1 || value === "1") return true;
    if (value === false || value === 0 || value === "0") return false;
    throw new Error("invalid-boolean");
  }
  if (column.type === "Int") {
    if (!((typeof value === "number" && Number.isSafeInteger(value)) || typeof value === "string" && /^-?(0|[1-9]\d*)$/.test(value))) throw new Error("invalid-integer");
    const n = BigInt(value as string | number), max = column.native[0] === "SmallInt" ? 32767n : 2147483647n;
    if (n < -max - 1n || n > max) throw new Error("integer-range");
    return Number(n);
  }
  if (column.type === "Decimal") {
    const [precision, scale] = (column.native[1] ?? "").split(",").map(Number);
    if (typeof value !== "string" || !new RegExp(`^-?(0|[1-9]\\d{0,${precision - scale - 1}})\\.\\d{${scale}}$`).test(value)) throw new Error("decimal-string-required");
    return value;
  }
  if (column.type === "DateTime") {
    if (typeof value !== "string") throw new Error("invalid-date");
    return timestamp(value, column.native[0] === "Date" ? "date" : "timestamp", timezone);
  }
  if (typeof value !== "string" || value.includes("\0")) throw new Error("invalid-string");
  if (column.enum && !column.enum.includes(value)) throw new Error("unknown-enum");
  if (["VarChar", "Char"].includes(column.native[0] ?? "") && [...value].length > Number(column.native[1])) throw new Error("string-length");
  return value;
}
export function mapRow(table: string, row: Row, timezone: string): Row {
  if (archiveOnly.has(table)) return {};
  const columns = targetCatalog.tables[table].columns;
  return Object.fromEntries(Object.entries(row).map(([name, value]) => {
    if (!columns[name]) throw new Error("unmapped-source-column");
    return [name, mapCell(value, columns[name], timezone)];
  }));
}
