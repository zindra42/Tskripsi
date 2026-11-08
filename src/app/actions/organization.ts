"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasTrustedOrigin } from "@/lib/auth/origin";
import { requireSession } from "@/lib/auth/session";
import { AccountError } from "@/lib/accounts/store";
import { idSchema } from "@/lib/accounts/validation";
import { saveFaculty, saveProgram, assignDean, linkProfile, appointLeadership } from "@/lib/organization/store";
import type { AccountFormState } from "./accounts";

export async function organizationAction(_state: AccountFormState, form: FormData): Promise<AccountFormState> {
  if (!await hasTrustedOrigin()) return { error: "Permintaan tidak dapat diverifikasi." };
  const session = await requireSession();
  try {
    const command = String(form.get("command"));
    const reason = String(form.get("reason") ?? "");
    const id = form.get("id") ? idSchema.parse(form.get("id")) : undefined;
    const input = { ...Object.fromEntries(form), aktif: form.get("aktif") === "on" };
    if (command === "faculty") await saveFaculty(session, id, input, reason);
    else if (command === "program") await saveProgram(session, id, input, reason);
    else if (command === "dean") await assignDean(session, idSchema.parse(form.get("fakultasId")), form.get("targetId") ? idSchema.parse(form.get("targetId")) : null, reason);
    else if (command === "link") await linkProfile(session, idSchema.parse(form.get("targetId")), z.enum(["mahasiswa", "dosen"]).parse(form.get("kind")), idSchema.parse(form.get("programStudiId")), reason);
    else if (command === "leadership") await appointLeadership(session, idSchema.parse(form.get("programStudiId")), z.enum(["kaprodi", "sekpro"]).parse(form.get("office")), form.get("targetId") ? idSchema.parse(form.get("targetId")) : null, reason);
    else return { error: "Tindakan tidak dikenal." };
    revalidatePath("/organisasi", "layout"); revalidatePath("/akun", "layout"); revalidatePath("/profil"); revalidatePath("/dashboard", "layout");
    return { error: "", success: "Perubahan tata kelola disimpan. Pengguna yang terdampak perlu masuk kembali." };
  } catch (error) {
    if (error instanceof AccountError) return { error: error.message };
    if (error instanceof z.ZodError) return { error: "Periksa kode, nama, jenjang, pilihan ID dan alasan (10–1000 karakter)." };
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return { error: "Kode, nama atau jabatan sudah digunakan. Muat ulang data." };
    return { error: "Tata kelola belum tersedia. Coba kembali atau hubungi superadmin." };
  }
}
