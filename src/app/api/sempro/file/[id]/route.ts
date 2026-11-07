import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { readStoredFile } from "@/lib/academic/files";
import { canManage } from "@/lib/accounts/policy";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  const { id } = await params;
  const itemId = BigInt(id);

  const item = await prisma.checklistDokumen.findUnique({
    where: { id: itemId },
    include: {
      sempro: {
        include: {
          pengajuan: true,
          penguji: true,
        },
      },
    },
  });

  if (!item || !item.filePindaian || !item.sempro) {
    return new NextResponse("Berkas tidak ditemukan.", { status: 404 });
  }

  const sempro = item.sempro;
  const isOwner = sempro.pengajuan.idMahasiswa === session.user.id;
  const isSupervisor = sempro.idDosenPembimbingSempro === session.user.id;
  const isExaminer = sempro.penguji.some((p: { idDosenPenguji: bigint }) => p.idDosenPenguji === session.user.id);
  const isManager = canManage(session.user, session.activeRole);

  if (!isOwner && !isSupervisor && !isExaminer && !isManager) {
    return new NextResponse("Akses ditolak.", { status: 403 });
  }

  try {
    const bytes = await readStoredFile(item.filePindaian, ["private", "public"]);
    const isPdf = item.filePindaian.endsWith(".pdf");
    const contentType = isPdf ? "application/pdf" : "image/jpeg";

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${item.namaDokumen.replace(/[^a-zA-Z0-9_-]/g, "_")}.${isPdf ? "pdf" : "jpg"}"`,
      },
    });
  } catch {
    return new NextResponse("Berkas fisik tidak ditemukan di penyimpanan server.", { status: 404 });
  }
}
