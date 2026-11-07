import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { AccountError, accountTransaction, checkedActor } from "@/lib/accounts/store";
import { canReadTitle } from "@/lib/academic/policy";
import { readStoredFile } from "@/lib/academic/files";
import { idSchema } from "@/lib/accounts/validation";

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string; file: string }> }) {
  const session = await getSession();
  if (!session || session.user.statusAkun !== "aktif" || session.user.wajibGantiPassword) return new NextResponse(null, { status: 401 });
  const { kind, id: rawId, file } = await params;
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) return new NextResponse(null, { status: 404 });
  // Use the same locks as account/assignment mutations, including the current role mode.
  let relative: string | null | undefined;
  try {
    relative = await accountTransaction(async (tx) => {
      const actor = await checkedActor(tx, session);
      const live = await tx.authSession.findUniqueOrThrow({ where: { tokenHash: session.tokenHash } });
      if (kind === "proposal" && file === "proposal") {
        const row = await tx.pengajuanJudul.findUnique({ where: { id: parsed.data }, include: { bimbingan: true } });
        return row && !row.deletedAt && canReadTitle(actor, live.activeRole, row, row.bimbingan) ? row.fileProposal : null;
      }
      if (kind === "administrasi") {
        const row = await tx.verifikasiPembayaran.findUnique({ where: { id: parsed.data } });
        if (!row || (row.idMahasiswa !== actor.id && !["admin_keuangan", "superadmin"].includes(actor.role))) return null;
        return ({ kwitansi: row.fileKwitansi, transfer: row.fileBuktiTransfer, krs: row.fileKrsSka } as Record<string, string | null>)[file];
      }
      return null;
    });
  } catch (error) {
    return new NextResponse(null, { status: error instanceof AccountError ? 401 : 503 });
  }
  if (!relative) return new NextResponse(null, { status: 404 });
  try {
    const bytes = await readStoredFile(relative, kind === "proposal" ? ["private", "public"] : ["public"]);
    const extension = relative.split(".").pop()?.toLowerCase();
    const mime = ({ pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" } as Record<string, string>)[extension ?? ""] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(bytes), { headers: {
      "Content-Type": mime, "Content-Disposition": `attachment; filename="${kind}-${rawId}-${file}.${["pdf", "jpg", "jpeg", "png"].includes(extension ?? "") ? extension : "bin"}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch { return new NextResponse(null, { status: 404 }); }
}
