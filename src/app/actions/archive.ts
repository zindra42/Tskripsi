"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasTrustedOrigin } from "@/lib/auth/origin";
import { requireSession } from "@/lib/auth/session";
import { AccountError } from "@/lib/accounts/store";
import { archiveFingerprint, editArchive } from "@/lib/academic/archive-edit";

export type ArchiveEditState = { error?: string; success?: string; values?: Record<string, string> };

export async function editArchiveAction(_state: ArchiveEditState, form: FormData): Promise<ArchiveEditState> {
  if (!await hasTrustedOrigin()) return { error: "Permintaan tidak dapat diverifikasi. Muat ulang halaman." };
  const session = await requireSession();
  const fields = ["id", "judul", "namaPenulis", "nim", "tahun", "prodi", "reason", "original"];
  const values = Object.fromEntries(fields.map((key) => [key, typeof form.get(key) === "string" ? String(form.get(key)) : ""]));
  try {
    await editArchive(session, values);
    revalidatePath("/arsip-judul");
    revalidatePath(`/arsip-judul/${values.id}/edit`);
    return { success: "Perubahan arsip berhasil disimpan.", values: { ...values, reason: "", original: archiveFingerprint({
      judul: values.judul.trim(), namaPenulis: values.namaPenulis.trim() || null,
      nim: values.nim.trim() || null, tahun: values.tahun.trim() || null, prodi: values.prodi.trim() || null,
    }) } };
  } catch (error) {
    if (error instanceof AccountError) return { error: error.message, values };
    if (error instanceof z.ZodError) return { error: "Periksa judul (3–10.000 karakter), penulis (255), NIM (50), tahun (10), prodi (100), dan alasan (10–1.000).", values };
    return { error: "Gagal menyimpan arsip. Muat ulang untuk memeriksa hasil sebelum mencoba kembali.", values };
  }
}
