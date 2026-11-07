"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasTrustedOrigin } from "@/lib/auth/origin";
import { requireSession } from "@/lib/auth/session";
import { AccountError, ensure } from "@/lib/accounts/store";
import { academicMutation } from "@/lib/academic/store";
import { validateUpload, type Upload } from "@/lib/academic/files";
import { initialize, updateChecklist, submit, verifyChecklist, verifyBatch, returnRegistration } from "@/lib/sidang/registration";
import { assignExaminers, schedule, confirm, cancelSchedule, requestChange, decideRequest, remind, emergencyAssignment } from "@/lib/sidang/scheduling";
import { score, latePermission, examinerDecision, approveResult, uploadRevision, reviewRevision } from "@/lib/sidang/scoring";
import { saveAnnouncement, archiveAnnouncement, readAnnouncement, processScheduled } from "@/lib/support/announcements";
import { correctSidang } from "@/lib/support/corrections";
import { processReminders } from "@/lib/sidang/reminders";
import { reviewSemproRevision } from "@/lib/support/sempro-revisions";
import { rollbackAudit } from "@/lib/support/audit-rollback";

export type SidangFormState = { error?: string; success?: string; id?: string };
export async function sidangAction(_state: SidangFormState, form: FormData): Promise<SidangFormState> {
  if (!await hasTrustedOrigin()) return { error: "Permintaan tidak dapat diverifikasi. Muat ulang halaman." };
  const session = await requireSession();
  try {
    const command = String(form.get("command"));
    const input: Record<string, unknown> = Object.fromEntries([...form].filter(([key, value]) => typeof value === "string"
      && !["key", "command"].includes(key) && !key.startsWith("$ACTION_")));
    input.targetPeran = form.getAll("targetPeran");
    input.itemIds = form.getAll("itemIds");
    if (command === "request-change" && input.jenis === "ubah_jadwal") input.slots = ["", "2", "3"]
      .filter((suffix) => !suffix || ["tanggal", "mulai", "selesai", "ruang"].some((key) => input[`${key}${suffix}`]))
      .map((suffix) => ({ tanggal: input[`tanggal${suffix}`], mulai: input[`mulai${suffix}`], selesai: input[`selesai${suffix}`], ruang: input[`ruang${suffix}`] }));
    let file: Upload | null;
    const raw = form.get("file");
    if ((command === "upload-revision" || command === "checklist" && input.nomorItem === "1") && raw instanceof File && raw.size) {
      ensure(raw.size <= 20 * 1024 * 1024, "Naskah maksimal 20 MB.");
      const bytes = Buffer.from(await raw.arrayBuffer());
      ensure(bytes.subarray(0, 5).toString() === "%PDF-", "Naskah wajib PDF.");
      file = { bytes, extension: "pdf" };
    } else file = await validateUpload(raw);
    const uploads = { file };
    const result = await academicMutation(session, String(form.get("key")), `sidang:${command}`, input, uploads, async (context) => {
      switch (command) {
        case "initialize": return initialize(context);
        case "checklist": return updateChecklist(context, input, uploads);
        case "submit": return submit(context, input);
        case "verify": return verifyChecklist(context, input);
        case "verify-batch": return verifyBatch(context, input);
        case "return-registration": return returnRegistration(context, input);
        case "examiners": return assignExaminers(context, input);
        case "schedule": return schedule(context, input);
        case "draft-schedule": return schedule(context, input, undefined, true);
        case "emergency-assignment": return emergencyAssignment(context, input);
        case "confirm": return confirm(context, input);
        case "cancel-schedule": return cancelSchedule(context, input);
        case "request-change": return requestChange(context, input);
        case "decide-request": return decideRequest(context, input);
        case "remind": return remind(context, input);
        case "process-reminders": return processReminders(context);
        case "score": return score(context, input);
        case "late-permission": return latePermission(context, input);
        case "examiner-decision": return examinerDecision(context, input);
        case "result": return approveResult(context, input);
        case "upload-revision": return uploadRevision(context, input, uploads);
        case "review-revision": return reviewRevision(context, input);
        case "sempro-review-revision": return reviewSemproRevision(context, input);
        case "announcement-save": return saveAnnouncement(context, input, uploads);
        case "announcement-archive": return archiveAnnouncement(context, input);
        case "announcement-read": return readAnnouncement(context, input);
        case "announcement-process": return processScheduled(context);
        case "correction": return correctSidang(context, input);
        case "audit-rollback": return rollbackAudit(context, input);
        default: throw new AccountError("Perintah tidak dikenal.");
      }
    });
    for (const path of ["/sidang", "/sempro", "/pengumuman", "/pengumuman-publik", "/notifikasi", "/dashboard", "/audit", "/koreksi-proses"]) revalidatePath(path, "layout");
    return { success: result && typeof result === "object" && "message" in result ? String(result.message) : "Perubahan tersimpan.", ...(result && typeof result === "object" && "id" in result ? { id: String(result.id) } : {}) };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: "Periksa data formulir dan lengkapi semua kolom wajib." };
    if (error instanceof AccountError) return { error: error.message };
    return { error: "Perubahan tidak dapat disimpan. Periksa isian dan muat ulang halaman sebelum mencoba kembali." };
  }
}
