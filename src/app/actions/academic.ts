"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasTrustedOrigin } from "@/lib/auth/origin";
import { requireSession } from "@/lib/auth/session";
import { AccountError, ensure } from "@/lib/accounts/store";
import { idSchema } from "@/lib/accounts/validation";
import { validateUpload } from "@/lib/academic/files";
import { academicMutation, cancelSupervisor, requireManager } from "@/lib/academic/store";
import { assignSupervisors, checkSimilarity, decideAdministration, removeAdministrationFile, reviewTitle, saveTitle, submitAdministration } from "@/lib/academic/titles";
import { acc, addLog, saveSchedule, transitionSchedule, updateLog } from "@/lib/academic/guidance";
import { decideChange, submitChange } from "@/lib/academic/changes";
import { matrixFields, reason } from "@/lib/academic/validation";
import { importArchiveCsv } from "@/lib/academic/archive-csv";
import { database } from "@/lib/db";

export type SimilarityReport = Awaited<ReturnType<typeof checkSimilarity>>;
export type AcademicFormState = { error?: string; success?: string; result?: SimilarityReport };

function getAcademicTargetedPaths(command: string): { path: string; type?: "layout" | "page" }[] {
  switch (command) {
    case "draft":
    case "submit-title":
    case "approve-title":
    case "revise-title":
    case "cancel-title":
    case "archive-title":
    case "assign":
    case "cancel-supervisor":
      return [
        { path: "/judul", type: "layout" },
        { path: "/dashboard", type: "layout" },
      ];
    case "submit-administration":
    case "draft-administration":
    case "remove-administration-file":
    case "approve-administration":
    case "reject-administration":
      return [
        { path: "/administrasi", type: "page" },
        { path: "/dashboard", type: "layout" },
      ];
    case "add-log":
    case "cancel-log":
    case "note-log":
    case "issue-acc":
    case "revoke-acc":
    case "schedule":
    case "edit-schedule":
    case "confirm-schedule":
    case "reschedule":
    case "complete-schedule":
    case "cancel-schedule":
      return [
        { path: "/bimbingan", type: "layout" },
        { path: "/dashboard", type: "layout" },
      ];
    case "submit-change":
    case "approve-change-supervisor":
    case "reject-change-supervisor":
    case "approve-change-final":
    case "reject-change-final":
      return [
        { path: "/judul", type: "layout" },
        { path: "/bimbingan", type: "layout" },
        { path: "/dashboard", type: "layout" },
      ];
    case "read-notifications":
      return [
        { path: "/notifikasi", type: "page" },
        { path: "/dashboard", type: "layout" },
      ];
    case "similarity":
      return [];
    default:
      return [
        { path: "/judul", type: "layout" },
        { path: "/bimbingan", type: "layout" },
        { path: "/administrasi", type: "page" },
        { path: "/notifikasi", type: "page" },
        { path: "/dashboard", type: "layout" },
      ];
  }
}

export async function academicAction(_state: AcademicFormState, form: FormData): Promise<AcademicFormState> {
  if (!await hasTrustedOrigin()) return { error: "Permintaan tidak dapat diverifikasi. Muat ulang halaman." };
  const session = await requireSession();
  try {
    const command = String(form.get("command"));
    const input: Record<string, unknown> = {};
    for (const [key, value] of form) if (typeof value === "string" && !["key", "command"].includes(key) && !key.startsWith("$ACTION_")) input[key] = value;
    input.preferensi = form.getAll("preferensi").filter(Boolean);
    input.supervisors = form.getAll("supervisors").filter(Boolean);
    input.selesai = form.get("selesai") === "on";
    if (["draft", "submit-title", "submit-change"].includes(command)) {
      input.matriks = form.get("matriksJson") ? JSON.parse(String(form.get("matriksJson"))) : [{
        ...Object.fromEntries(matrixFields.map((key) => [key, form.get(key) ?? ""])),
        bidang_keahlian_id: form.get("bidang_keahlian_id"), bidang_keahlian_2_id: form.get("bidang_keahlian_2_id"),
      }];
    }
    const isTitleUpload = command === "draft" || command === "submit-title";
    const isAdministrationUpload = command === "submit-administration" || command === "draft-administration";
    const uploads = {
      proposal: isTitleUpload ? await validateUpload(form.get("proposal"), true) : null,
      kwitansi: isAdministrationUpload ? await validateUpload(form.get("kwitansi")) : null,
      transfer: isAdministrationUpload ? await validateUpload(form.get("transfer")) : null,
      krs: isAdministrationUpload ? await validateUpload(form.get("krs")) : null,
    };
    const result = await academicMutation(session, String(form.get("key")), command, input, uploads, async (context) => {
      switch (command) {
        case "draft": await saveTitle(context, input, uploads, true); break;
        case "submit-title": await saveTitle(context, input, uploads, false); break;
        case "approve-title": await reviewTitle(context, input, "approve"); break;
        case "revise-title": await reviewTitle(context, input, "revise"); break;
        case "cancel-title": await reviewTitle(context, input, "cancel"); break;
        case "archive-title": await reviewTitle(context, input, "archive"); break;
        case "assign": await assignSupervisors(context, input); break;
        case "cancel-supervisor":
          requireManager(context);
          await cancelSupervisor(context, idSchema.parse(input.id), z.union([z.literal("1"), z.literal("2")]).parse(input.slot) === "1" ? 1 : 2, reason.parse(input.reason));
          break;
        case "submit-administration": await submitAdministration(context, input, uploads); break;
        case "draft-administration": await submitAdministration(context, input, uploads, true); break;
        case "remove-administration-file": await removeAdministrationFile(context, input); break;
        case "approve-administration": await decideAdministration(context, input, true); break;
        case "reject-administration": await decideAdministration(context, input, false); break;
        case "add-log": await addLog(context, input); break;
        case "cancel-log": await updateLog(context, input, true); break;
        case "note-log": await updateLog(context, input, false); break;
        case "issue-acc": await acc(context, input, false); break;
        case "revoke-acc": await acc(context, input, true); break;
        case "schedule": await saveSchedule(context, input, false); break;
        case "edit-schedule": await saveSchedule(context, input, true); break;
        case "confirm-schedule": await transitionSchedule(context, input, "confirm"); break;
        case "reschedule": await transitionSchedule(context, input, "reschedule"); break;
        case "complete-schedule": await transitionSchedule(context, input, "complete"); break;
        case "cancel-schedule": await transitionSchedule(context, input, "cancel"); break;
        case "submit-change": await submitChange(context, input); break;
        case "approve-change-supervisor": await decideChange(context, input, true, false); break;
        case "reject-change-supervisor": await decideChange(context, input, false, false); break;
        case "approve-change-final": await decideChange(context, input, true, true); break;
        case "reject-change-final": await decideChange(context, input, false, true); break;
        case "similarity": return checkSimilarity(context, input.judul);
        case "read-notifications":
          await context.tx.notification.updateMany({ where: { notifiableId: context.actor.id, notifiableType: "App\\Models\\Pengguna", readAt: null }, data: { readAt: new Date() } });
          break;
        default: ensure(false, "Tindakan tidak dikenal.");
      }
    });
    for (const target of getAcademicTargetedPaths(command)) {
      if (target.type) revalidatePath(target.path, target.type);
      else revalidatePath(target.path);
    }
    return { success: command === "similarity" ? "Pengecekan kemiripan selesai." : "Perubahan berhasil disimpan.",
      result: command === "similarity" ? result as SimilarityReport : undefined };
  } catch (error) {
    if (error instanceof AccountError) return { error: error.message };
    if (error instanceof z.ZodError || error instanceof SyntaxError) return { error: "Periksa isian wajib, format, dan panjang data. Matriks harus berupa daftar JSON yang valid jika diisi." };
    return { error: "Layanan akademik belum tersedia. Muat ulang untuk memeriksa hasil permintaan atau hubungi pengelola." };
  }
}

export async function importArchiveTitlesAction(
  _prevState: unknown,
  formData: FormData,
): Promise<{ error?: string; success?: string; imported?: number; skipped?: number }> {
  try {
    if (!await hasTrustedOrigin()) throw new AccountError("Permintaan tidak sah.");
    const session = await requireSession();
    ensure(session.user.role === "superadmin", "Hanya Super Admin yang dapat mengimpor arsip judul.");
    const file = formData.get("file");
    ensure(file instanceof File && file.size > 0, "Pilih berkas CSV untuk diimpor.");
    ensure((file as File).size <= 10 * 1024 * 1024, "Ukuran berkas CSV maksimal 10 MB.");
    const mode = formData.get("mode") === "replace" ? "replace" : "append";
    const text = await (file as File).text();
    const result = await database().$transaction(async (tx) => {
      return importArchiveCsv(tx, text, mode);
    });
    revalidatePath("/arsip-judul");
    return {
      success: `Berhasil mengimpor ${result.imported} judul (${result.skipped} dilewati).`,
      imported: result.imported,
      skipped: result.skipped,
    };
  } catch (error) {
    if (error instanceof AccountError) return { error: error.message };
    return { error: "Gagal mengimpor file CSV. Pastikan format file sesuai (judul,nama_penulis,tahun,nim,prodi)." };
  }
}
