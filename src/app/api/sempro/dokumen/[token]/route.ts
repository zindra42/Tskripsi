import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import {
  renderSuratUndanganPdf,
  renderBeritaAcaraPdf,
} from "@/lib/sempro/documents";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  await requireSession();
  const { token } = await params;
  const doc = await prisma.dokumenVerifikasi.findUnique({
    where: { token },
  });

  if (!doc || !["undangan", "berita_acara"].includes(doc.jenisDokumen)) {
    return new NextResponse("Dokumen tidak ditemukan.", { status: 404 });
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
