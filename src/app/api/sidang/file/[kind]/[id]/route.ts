import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { accountTransaction, checkedActor } from "@/lib/accounts/store";
import { createSecureFileResponse, readStoredFile } from "@/lib/academic/files";
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
    return createSecureFileResponse(bytes, `${kind}_${id}`, {
      disposition: "inline",
      unsupportedMessage: "Format berkas historis tidak didukung.",
    });
  } catch { return new NextResponse("Berkas tidak ditemukan.", { status: 404 }); }
}
