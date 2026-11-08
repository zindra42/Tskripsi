import { createReadStream } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { jsonValue, primaryKey, type ManifestEntry, type Row, type Snapshot, type Issue } from "./contract";
import { sourceCatalog } from "./catalog";

export function safeRelative(value: string) {
  if (!value || /[\\:%?#\x00-\x1f]/.test(value) || value.startsWith("/") || value.split("/").some((v) => !v || v === "." || v === ".." || /[. ]$/.test(v))) throw new Error("unsafe-storage-path");
  return value;
}
export type FileReference = { table: string; pk: string; pointer: string; path: string };
export function referenceUrls(ref: FileReference, row?: Row): string[] {
  const id = row?.id;
  if (typeof id !== "string") return [];
  if (ref.table === "dokumen_verifikasi" && typeof row?.token === "string") return [`/verifikasi/${row.token}`];
  if (ref.table === "pengajuan_judul") return [`/proposal/download/${id}`];
  if (ref.table === "checklist_dokumen") return [`/${row?.id_sidang_daftar ? "sidang" : "sempro"}/checklist/file/${id}`];
  if (ref.table === "revisi_dokumen") return [`/${row?.tipe}/revisi-draft/${id}`];
  if (ref.table === "kehadiran_seminar") return [`/sempro/kehadiran/foto/${id}`];
  if (ref.table === "pengumuman") return [`/api/pengumuman/${id}/lampiran`];
  return [];
}
const fileColumns = new Set(["file_proposal", "file_kwitansi", "file_krs_ska", "file_bukti_transfer", "file_pindaian", "file_scan", "bukti_kehadiran", "berita_acara", "file_transkrip", "file_naskah", "file_draft", "path_foto", "lampiran_path", "foto_profil", "file_acc_lama"]);
const escapePointer = (s: string) => s.replace(/~/g, "~0").replace(/\//g, "~1");
export function fileReferences(snapshot: Pick<Snapshot, "tables">): FileReference[] {
  const refs: FileReference[] = [];
  for (const [table, data] of Object.entries(snapshot.tables)) for (const row of data.rows) {
    const pk = primaryKey(row, sourceCatalog.tables[table]?.primaryKey ?? []);
    function visit(value: unknown, pointer: string, key: string, inFileArray = false) {
      if (typeof value === "string" && value && (fileColumns.has(key) || inFileArray && /(?:file|path|kwitansi|transfer|krs)/i.test(key))) refs.push({ table, pk, pointer, path: value });
      if (Array.isArray(value)) value.forEach((v, i) => visit(v, `${pointer}/${i}`, key, inFileArray));
      else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) visit(v, `${pointer}/${escapePointer(k)}`, k, inFileArray);
    }
    for (const [key, value] of Object.entries(row)) visit(jsonValue(value), `/${escapePointer(key)}`, key, key === "berkas_semester_sebelumnya");
  }
  return refs;
}
export function validateManifest(snapshot: Snapshot): Issue[] {
  const issues: Issue[] = [], keys = new Set<string>();
  for (const file of snapshot.files) {
    const key = JSON.stringify([file.disk, file.path, file.table, file.pk, file.pointer]);
    if (keys.has(key)) issues.push({ code: "duplicate-file-entry", table: file.table, pk: file.pk });
    keys.add(key);
    try { safeRelative(file.path); } catch { issues.push({ code: "unsafe-storage-path", table: file.table, pk: file.pk }); }
    if (file.purpose !== "unreferenced") {
      const row = snapshot.tables[file.table]?.rows.find((r) => primaryKey(r, sourceCatalog.tables[file.table]?.primaryKey ?? []) === file.pk);
      if (!row) issues.push({ code: "file-owner-missing", table: file.table, pk: file.pk });
      if (file.purpose === "pdf-cache" && (file.table !== "dokumen_verifikasi" || file.pointer !== "/cached_pdf" || !file.ownershipEvidence || file.mime !== "application/pdf"
        || !row || file.version !== String(row.versi) || file.status !== row.status)) issues.push({ code: "pdf-cache-version-unverified", table: file.table, pk: file.pk });
      if (row && file.purpose === "reference") {
        const actual = resolvePointer(row, file.pointer);
        if (actual !== file.path) issues.push({ code: "file-owner-pointer-mismatch", table: file.table, pk: file.pk });
      }
    }
  }
  for (const ref of fileReferences(snapshot)) {
    try { safeRelative(ref.path); } catch { issues.push({ code: "unsafe-reference-path", table: ref.table, pk: ref.pk }); }
    if (!snapshot.files.some((f) => f.purpose === "reference" && f.table === ref.table && f.pk === ref.pk && f.pointer === ref.pointer && f.path === ref.path)) issues.push({ code: "file-manifest-reference-missing", table: ref.table, pk: ref.pk, column: ref.pointer });
  }
  return issues;
}
function resolvePointer(row: Row, pointer: string): unknown {
  let value: unknown = row;
  for (const key of pointer.slice(1).split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (value && typeof value === "object" && "$json" in value) value = JSON.parse((value as { $json: string }).$json);
    value = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
  }
  return value;
}
async function inspectFile(root: string, relative: string) {
  safeRelative(relative);
  const base = await realpath(root), parts = relative.split("/");
  let current = base;
  for (const part of parts) {
    current = path.join(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new Error("storage-symlink");
  }
  const resolved = await realpath(current), inside = path.relative(base, resolved);
  if (inside.startsWith("..") || path.isAbsolute(inside)) throw new Error("unsafe-storage-path");
  const before = await lstat(resolved, { bigint: true });
  if (!before.isFile()) throw new Error("storage-not-file");
  const hash = createHash("sha256"); let prefix = Buffer.alloc(0), size = 0n;
  for await (const chunk of createReadStream(resolved)) {
    const bytes = Buffer.from(chunk); hash.update(bytes); size += BigInt(bytes.length);
    if (prefix.length < 8) prefix = Buffer.concat([prefix, bytes]).subarray(0, 8);
  }
  const after = await lstat(resolved, { bigint: true });
  if (before.mtimeNs !== after.mtimeNs || before.ino !== after.ino || before.size !== size || after.size !== size) throw new Error("storage-changed-during-read");
  const mime = prefix.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : prefix[0] === 255 && prefix[1] === 216 ? "image/jpeg" : prefix.equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : "application/octet-stream";
  return { bytes: size.toString(), fileSha256: hash.digest("hex"), mime };
}
// Read-only, streamed byte verification. No file paths, contents or credentials enter logs.
export async function verifyFiles(files: ManifestEntry[], roots: Record<"private" | "public", string>): Promise<Issue[]> {
  const issues: Issue[] = [];
  for (const file of files) {
    try {
      const actual = await inspectFile(roots[file.disk], file.path);
      if (actual.bytes !== file.bytes || actual.fileSha256 !== file.fileSha256 || actual.mime !== file.mime) issues.push({ code: "file-integrity-mismatch", table: file.table, pk: file.pk });
    } catch { issues.push({ code: "file-missing-or-unsafe", table: file.table, pk: file.pk }); }
  }
  return issues;
}
// Build a complete inventory of both disks. Unreferenced files are retained for review,
// including computed PDF caches and profile images with no surviving database reference.
export async function inventoryFiles(snapshot: Pick<Snapshot, "tables">, roots: Record<"private" | "public", string>): Promise<ManifestEntry[]> {
  const refs = fileReferences(snapshot), result: ManifestEntry[] = [];
  for (const disk of ["private", "public"] as const) {
    async function walk(folder: string) {
      for (const item of await readdir(path.join(roots[disk], folder), { withFileTypes: true })) {
        const relative = folder ? `${folder}/${item.name}` : item.name;
        safeRelative(relative);
        if (item.isSymbolicLink()) throw new Error("storage-symlink");
        if (item.isDirectory()) { await walk(relative); continue; }
        const actual = await inspectFile(roots[disk], relative), owners = refs.filter((r) => r.path === relative);
        for (const owner of owners.length ? owners : [{ table: "storage_inventory", pk: `${disk}:${relative}`, pointer: "/path", path: relative }]) {
          const row = snapshot.tables[owner.table]?.rows.find((r) => primaryKey(r, sourceCatalog.tables[owner.table].primaryKey) === owner.pk);
          result.push({ ...owner, ...actual, disk, version: row?.versi?.toString() ?? null, status: row?.status?.toString() ?? null,
            urls: [...referenceUrls(owner, row), ...(disk === "public" ? [`/storage/${relative}`] : [])],
            ownershipEvidence: owners.length ? "source-column-or-json-pointer" : null, purpose: owners.length ? "reference" : "unreferenced" });
        }
      }
    }
    await walk("");
  }
  return result;
}
