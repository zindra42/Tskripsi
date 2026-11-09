"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasTrustedOrigin } from "@/lib/auth/origin";
import { allowLogin } from "@/lib/auth/rate-limit";
import { requireSession } from "@/lib/auth/session";
import { AccountError } from "@/lib/accounts/store";
import { idSchema } from "@/lib/accounts/validation";
import { registerAccount } from "@/lib/accounts/registration";
import { completePasswordReset, decidePasswordReset, requestPasswordReset } from "@/lib/accounts/reset";
import { assignRole, changeAccountStatus, decideAccounts } from "@/lib/accounts/management";
import { decideProfileRequest, editAccountProfile, submitProfileRequest, updateOwnName } from "@/lib/accounts/profile";
import { addExpertise, linkLegacyExpertise, saveSettings } from "@/lib/accounts/settings";

export type AccountFormState = { error: string; success?: string; secret?: string; secretLabel?: string };
const untrusted = { error: "Permintaan tidak dapat diverifikasi. Muat ulang halaman." };

function errorState(error: unknown): AccountFormState {
  if (error instanceof AccountError) return { error: error.message };
  if (error instanceof z.ZodError) return { error: "Periksa data wajib, format, panjang, serta konfirmasi isian Anda." };
  if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
    return { error: "Identitas atau data unik sudah digunakan. Muat ulang dan periksa akun terkait." };
  }
  return { error: "Layanan akun belum tersedia. Silakan coba kembali atau hubungi pengelola SIAS." };
}

function registrationInput(form: FormData) {
  const input = Object.fromEntries(form);
  return {
    ...input, nim: input.nim || undefined, nidn: input.nidn || undefined,
    semester: input.semester || undefined, noHp: input.noHp || undefined,
    bidangLainnya: input.bidangLainnya || undefined,
    bidang: form.getAll("bidang"), isSekpro: form.get("isSekpro") === "on",
  };
}

function profileInput(form: FormData) {
  const selected = form.getAll("changes").map(String);
  const fields = ["nama", "email", "nim", "nidn", "semester", "noHp", "programStudiId"];
  return {
    ...Object.fromEntries(fields.filter((key) => selected.includes(key)).map((key) => [key, form.get(key)])),
    ...(selected.includes("bidang") ? { bidang: form.getAll("bidang") } : {}),
  };
}

export async function register(_state: AccountFormState, form: FormData): Promise<AccountFormState> {
  if (!await hasTrustedOrigin()) return untrusted;
  try {
    if (!await allowLogin(`register:${String(form.get("email") ?? "").toLowerCase()}`)) return { error: "Terlalu banyak percobaan. Tunggu satu menit." };
    await registerAccount(registrationInput(form));
    return { error: "", success: "Pendaftaran berhasil. Masuk menggunakan email dan password Anda untuk memantau persetujuan." };
  } catch (error) { return errorState(error); }
}

export async function requestReset(_state: AccountFormState, form: FormData): Promise<AccountFormState> {
  if (!await hasTrustedOrigin()) return untrusted;
  try {
    const identity = String(form.get("identitas") ?? "").trim();
    if (!await allowLogin(`request-reset:${identity.toLowerCase()}`)) return { error: "Terlalu banyak percobaan. Tunggu satu menit." };
    await requestPasswordReset(identity);
    return { error: "", success: "Jika identitas sesuai akun aktif, permohonan akan diproses. Hubungi Kaprodi atau Sekpro untuk memperoleh token setelah disetujui." };
  } catch { return { error: "Layanan pemulihan belum tersedia. Silakan coba kembali." }; }
}

export async function finishReset(_state: AccountFormState, form: FormData): Promise<AccountFormState> {
  if (!await hasTrustedOrigin()) return untrusted;
  try {
    if (!await allowLogin(`finish-reset:${String(form.get("token") ?? "")}`)) return { error: "Terlalu banyak percobaan. Tunggu satu menit." };
    await completePasswordReset(Object.fromEntries(form));
    return { error: "", success: "Password berhasil diperbarui. Silakan masuk kembali." };
  } catch (error) { return errorState(error); }
}

export async function accountAction(_state: AccountFormState, form: FormData): Promise<AccountFormState> {
  if (!await hasTrustedOrigin()) return untrusted;
  const session = await requireSession();
  const command = String(form.get("command") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  const confirmation = String(form.get("confirmation") ?? "");
  let secret: string | undefined;
  let secretLabel: string | undefined;
  try {
    switch (command) {
      case "create": {
        const temporary = randomBytes(18).toString("base64url");
        if (form.get("role") === "kaprodi" && confirmation !== "KONFIRMASI") throw new AccountError("Ketik KONFIRMASI untuk membuat akun Kaprodi.");
        await registerAccount(registrationInput(form), session, temporary);
        secret = temporary;
        secretLabel = "Password sementara. Sampaikan kepada pemilik akun. Wajib diganti setelah masuk.";
        break;
      }
      case "approve":
      case "reject":
        await decideAccounts(session, form.getAll("ids").map((id) => idSchema.parse(id)), command === "approve", reason);
        break;
      case "delete":
      case "restore":
      case "activate":
      case "deactivate":
        await changeAccountStatus(session, idSchema.parse(form.get("id")), command, reason, confirmation);
        break;
      case "role":
        await assignRole(session, idSchema.parse(form.get("id")), { role: form.get("role"), identifier: form.get("identifier") || undefined, programStudiId: form.get("programStudiId") || undefined }, reason, confirmation);
        break;
      case "approve-reset":
      case "reject-reset":
        secret = await decidePasswordReset(session, idSchema.parse(form.get("id")), command === "approve-reset", reason) ?? undefined;
        secretLabel = "Token reset berlaku 24 jam. Sampaikan langsung kepada pemilik akun melalui saluran tepercaya.";
        break;
      case "approve-profile":
      case "reject-profile":
        await decideProfileRequest(session, z.enum(["biodata", "keahlian"]).parse(form.get("kind")), idSchema.parse(form.get("id")), command === "approve-profile", reason);
        break;
      case "request-profile":
        await submitProfileRequest(session, profileInput(form), reason);
        break;
      case "edit-profile":
        await editAccountProfile(session, idSchema.parse(form.get("id")), profileInput(form), reason);
        break;
      case "name":
        await updateOwnName(session, String(form.get("nama") ?? ""));
        break;
      case "settings":
        await saveSettings(session, Object.fromEntries(form), reason);
        break;
      case "add-expertise":
        await addExpertise(session, String(form.get("namaBidang") ?? ""), idSchema.parse(form.get("programStudiId")), reason);
        break;
      case "link-expertise":
        await linkLegacyExpertise(session, idSchema.parse(form.get("id")), idSchema.parse(form.get("programStudiId")), reason);
        break;
      default: return { error: "Tindakan tidak dikenal." };
    }
    // The pending-request row owns the one-time token display. Keep it mounted until
    // the approver has copied the token. A subsequent page load refreshes the queue.
    if (command !== "approve-reset") {
      revalidatePath("/akun", "layout");
      revalidatePath("/profil");
      revalidatePath("/pengaturan");
    }
    return { error: "", success: "Perubahan berhasil disimpan.", secret, secretLabel };
  } catch (error) { return errorState(error); }
}
