import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { accountTransaction, checkedActor } from "@/lib/accounts/store";
import { readStoredFile } from "@/lib/academic/files";
import { sidangRecord, canRead } from "@/lib/sidang/store";
import { canManage } from "@/lib/accounts/policy";

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const session = await requireSession();
  const { kind, id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n || !["checklist", "revisi", "pembayaran"].includes(kind)) return new NextResponse("Tidak ditemukan.", { status: 404 });
  const path = await accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session);
    const live = await tx.authSession.findUniqueOrThrow({ where: { tokenHash: session.tokenHash } });
    const context = { tx, actor, role: live.activeRole };
    if (kind === "pembayaran") {
      const payment = await tx.pembayaranSidang.findUnique({ where: { id: BigInt(id) } });
      if (!payment || !(payment.idMahasiswa === actor.id && actor.role === "mahasiswa" || actor.role === "admin_keuangan" || actor.role === "superadmin")) return null;
      const field = new URL(_request.url).searchParams.get("file");
      return field === "kwitansi" ? payment.fileKwitansi : field === "krs" ? payment.fileKrsSka : field === "transfer" ? payment.fileBuktiTransfer : null;
    }
    if (kind === "checklist") {
      const item = await tx.checklistDokumen.findUnique({ where: { id: BigInt(id) } });
      if (!item?.idSidangDaftar) return null;
      const row = await sidangRecord(context, item.idSidangDaftar, false);
      return canRead(context, row) ? item.filePindaian : null;
    }
    const revision = await tx.revisiDokumen.findUnique({ where: { id: BigInt(id) }, include: { beritaAcara: { include: { jadwalSidang: true } } } });
    if (revision?.tipe !== "sidang" || !revision.beritaAcara.jadwalSidang) return null;
    const row = await sidangRecord(context, revision.beritaAcara.jadwalSidang.idSidang, false);
    // Managers, owner and assigned board may read; approval rights remain restricted to the stored approvers.
    return canRead(context, row) || canManage(actor, live.activeRole) ? revision.fileDraft : null;
  });
  if (!path) return new NextResponse("Berkas tidak tersedia untuk Anda.", { status: 404 });
  try {
    const bytes = await readStoredFile(path);
    const pdf = bytes.subarray(0, 5).toString() === "%PDF-";
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!pdf && !png && !jpeg) return new NextResponse("Format berkas historis tidak didukung.", { status: 415 });
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": pdf ? "application/pdf" : png ? "image/png" : "image/jpeg",
      "Content-Disposition": `inline; filename="${kind}_${id}.${pdf ? "pdf" : png ? "png" : "jpg"}"`, "Cache-Control": "private, no-store" } });
  } catch { return new NextResponse("Berkas tidak ditemukan.", { status: 404 }); }
}
