"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasTrustedOrigin } from "@/lib/auth/origin";
import { requireSession } from "@/lib/auth/session";
import { AccountError, ensure } from "@/lib/accounts/store";
import { createIdempotentMutation } from "@/lib/db/mutation";
import { validateUpload, type Upload } from "@/lib/academic/files";
import {
  saveAnnouncement,
  archiveAnnouncement,
  readAnnouncement,
  processScheduled,
} from "@/lib/support/announcements";

export type AnnouncementFormState = { error?: string; success?: string; id?: string };

export async function announcementAction(
  _state: AnnouncementFormState,
  form: FormData,
): Promise<AnnouncementFormState> {
  if (!(await hasTrustedOrigin())) {
    return { error: "Permintaan tidak dapat diverifikasi. Muat ulang halaman." };
  }
  const session = await requireSession();
  try {
    const command = String(form.get("command"));
    const input: Record<string, unknown> = Object.fromEntries(
      [...form].filter(
        ([key, value]) =>
          typeof value === "string" &&
          !["key", "command"].includes(key) &&
          !key.startsWith("$ACTION_"),
      ),
    );
    input.targetPeran = form.getAll("targetPeran");

    const raw = form.get("file");
    let file: Upload | null = null;
    if (raw instanceof File && raw.size) {
      ensure(raw.size <= 2 * 1024 * 1024, "Lampiran maksimal 2 MB.");
      file = await validateUpload(raw);
    }
    const uploads = { file };

    const result = await createIdempotentMutation(
      session,
      String(form.get("key")),
      `announcement:${command}`,
      input,
      uploads,
      async (context) => {
        switch (command) {
          case "announcement-save":
            return saveAnnouncement(context, input, uploads);
          case "announcement-archive":
            return archiveAnnouncement(context, input);
          case "announcement-read":
            return readAnnouncement(context, input);
          case "announcement-process":
            return processScheduled(context);
          default:
            throw new AccountError("Perintah pengumuman tidak dikenal.");
        }
      },
    );

    for (const path of ["/pengumuman", "/pengumuman-publik", "/dashboard"]) {
      revalidatePath(path, "layout");
    }

    const res = result as unknown;
    return {
      success:
        res && typeof res === "object" && "message" in res
          ? String((res as { message: unknown }).message)
          : "Perubahan tersimpan.",
      ...(res && typeof res === "object" && "id" in res
        ? { id: String((res as { id: unknown }).id) }
        : {}),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: "Periksa data formulir dan lengkapi semua kolom wajib." };
    }
    if (error instanceof AccountError) return { error: error.message };
    return {
      error:
        "Perubahan tidak dapat disimpan. Periksa isian dan muat ulang halaman sebelum mencoba kembali.",
    };
  }
}
