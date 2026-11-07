import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensure } from "@/lib/accounts/store";

export type Upload = { bytes: Buffer; extension: string };
export async function validateUpload(file: FormDataEntryValue | null, proposal = false): Promise<Upload | null> {
  if (!(file instanceof File) || !file.size) return null;
  ensure(file.size <= (proposal ? 10 : 2) * 1024 * 1024, proposal ? "Proposal maksimal 10 MB." : "Berkas administrasi maksimal 2 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  let extension = "";
  if (bytes.subarray(0, 5).toString() === "%PDF-") extension = "pdf";
  else if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) extension = "png";
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) extension = "jpg";
  ensure(extension && (!proposal || extension === "pdf"), "Format berkas harus PDF, JPG atau PNG. Proposal wajib PDF.");
  return { bytes, extension };
}

function root() {
  const resolved = path.resolve(/* turbopackIgnore: true */ process.env.SIAS_STORAGE_ROOT || ".sias-storage");
  for (const folder of ["public", ".next/static"]) {
    const publicRoot = path.resolve(/* turbopackIgnore: true */ folder);
    const relative = path.relative(publicRoot, resolved);
    ensure(relative && (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)), "Storage harus berada di luar direktori statis aplikasi.");
  }
  return resolved;
}
function safePath(base: string, relative: string) {
  ensure(relative && !relative.includes("\\") && !relative.includes(":") && !relative.split("/").includes("..") && !path.isAbsolute(relative), "Path berkas tidak valid.");
  const resolved = path.resolve(base, relative);
  ensure(resolved.startsWith(`${base}${path.sep}`), "Path berkas tidak valid.");
  return resolved;
}

export async function storeUpload(upload: Upload, folder: string) {
  // Retain the source disk and relative path. Neither disk is exposed as static content.
  const relative = `${folder}/${randomUUID()}.${upload.extension}`;
  const target = safePath(path.join(root(), "public"), relative);
  await mkdir(path.dirname(target), { recursive: true });
  const [base, directory] = await Promise.all([realpath(path.join(root(), "public")), realpath(path.dirname(target))]);
  ensure(directory.startsWith(`${base}${path.sep}`), "Path berkas tidak valid.");
  await writeFile(target, upload.bytes, { flag: "wx", mode: 0o600 });
  return relative;
}

export async function readStoredFile(relative: string, disks = ["private", "public"]) {
  for (const disk of disks) {
    const base = path.join(/* turbopackIgnore: true */ root(), disk);
    const target = safePath(base, relative);
    try {
      const [actualBase, actualTarget] = await Promise.all([realpath(/* turbopackIgnore: true */ base), realpath(/* turbopackIgnore: true */ target)]);
      ensure(actualTarget.startsWith(`${actualBase}${path.sep}`), "Path berkas tidak valid.");
      return await readFile(/* turbopackIgnore: true */ actualTarget);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
  }
  throw new Error("Berkas tidak ditemukan.");
}
