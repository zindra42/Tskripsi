"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasTrustedOrigin } from "@/lib/auth/origin";
import { requireSession } from "@/lib/auth/session";
import { AccountError } from "@/lib/accounts/store";
import { createIdempotentMutation } from "@/lib/db/mutation";
import { correctSidang } from "@/lib/support/corrections";
import { reviewSemproRevision } from "@/lib/support/sempro-revisions";
import { rollbackAudit } from "@/lib/support/audit-rollback";

export type SupportFormState = { error?: string; success?: string; id?: string };

export async function supportAction(
  _state: SupportFormState,
  form: FormData,
): Promise<SupportFormState> {
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
    const uploads = {};

    const result = await createIdempotentMutation(
      session,
      String(form.get("key")),
      `support:${command}`,
      input,
      uploads,
      async (context) => {
        switch (command) {
          case "correction":
            return correctSidang(context, input);
          case "audit-rollback":
            return rollbackAudit(context, input);
          case "sempro-review-revision":
            return reviewSemproRevision(context, input);
          default:
            throw new AccountError("Perintah koreksi/audit tidak dikenal.");
        }
      },
    );

    const paths =
      command === "sempro-review-revision"
        ? ["/sempro", "/dashboard"]
        : ["/audit", "/koreksi-proses", "/dashboard"];
    for (const path of paths) {
      revalidatePath(path, "layout");
    }

    return {
      success:
        result && typeof result === "object" && "message" in result
          ? String(result.message)
          : "Perubahan tersimpan.",
      ...(result && typeof result === "object" && "id" in result
        ? { id: String(result.id) }
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
