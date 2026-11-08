import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import {
  renderSuratUndanganPdf,
  renderBeritaAcaraPdf,
} from "@/lib/sempro/documents";
import { accountTransaction, checkedActor } from "@/lib/accounts/store";
import { canManage } from "@/lib/accounts/policy";
import { importedDocumentFile, readImportedDocument } from "@/lib/migration/document-files";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await requireSession();
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return new NextResponse(null, { status: 404 });
  const doc = await accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session), live = await tx.authSession.findUniqueOrThrow({ where: { tokenHash: session.tokenHash } });
    const doc = await tx.dokumenVerifikasi.findUnique({ where: { token }, include: { jadwalSempro: { include: { sempro: { include: { penguji: true } } } } } });
    if (!doc || !["acc", "undangan", "form_nilai", "berita_acara"].includes(doc.jenisDokumen)) return null;
    const titleId = doc.idPengajuan ?? doc.jadwalSempro?.sempro?.idPengajuan;
    if (!titleId) return null;
    const title = await tx.pengajuanJudul.findUnique({ where: { id: titleId }, include: { bimbingan: true } });
    if (!title) return null;
    const owner = actor.role === "mahasiswa" && title.idMahasiswa === actor.id;
    const lecturer = actor.dosen && ["dosen", "kaprodi", "sekpro"].includes(actor.role);
    const evaluator = lecturer && ([title.bimbingan?.idDosenPembimbing, title.bimbingan?.idDosenPembimbing2].includes(actor.id)
      || doc.jadwalSempro?.sempro?.penguji.some((p) => !p.isPengganti && p.idDosenPenguji === actor.id));
    if (!owner && !evaluator && !canManage(actor, live.activeRole)) return null;
    return { ...doc, historical: await importedDocumentFile(tx, doc) };
  });

  if (!doc) {
    return new NextResponse("Dokumen tidak ditemukan.", { status: 404 });
  }
  if (doc.status !== "sah") return new NextResponse("Dokumen telah dicabut atau digantikan.", { status: 410 });

  if (doc.historical.imported) {
    const bytes = await readImportedDocument(doc.historical);
    if (!bytes) return new NextResponse("Berkas dokumen historis belum direkonsiliasi.", { status: 409 });
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store", "Content-Disposition": "attachment; filename=\"dokumen-historis.pdf\"" } });
  }

  let pdfBytes: Buffer;
  if (doc.jenisDokumen === "undangan") {
    pdfBytes = renderSuratUndanganPdf(doc);
  } else if (doc.jenisDokumen === "berita_acara") {
    pdfBytes = renderBeritaAcaraPdf(doc);
  } else {
    return new NextResponse("Dokumen tidak ditemukan.", { status: 404 });
  }

  const filename = `${doc.jenisDokumen}_${token.slice(0, 8)}.pdf`;

  return new NextResponse(new Uint8Array(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
