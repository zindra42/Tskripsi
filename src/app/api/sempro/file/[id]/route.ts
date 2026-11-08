import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { readStoredFile } from "@/lib/academic/files";
import { canManage } from "@/lib/accounts/policy";
import { accountTransaction, checkedActor } from "@/lib/accounts/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) return new NextResponse(null, { status: 404 });
  const item = await accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session), live = await tx.authSession.findUniqueOrThrow({ where: { tokenHash: session.tokenHash } });
    const item = await tx.checklistDokumen.findUnique({
    where: { id: BigInt(id) },
    include: {
      sempro: {
        include: {
          pengajuan: true,
          penguji: true,
        },
      },
    },
    });
    if (!item?.filePindaian || !item.sempro) return null;
    const sempro = item.sempro, lecturer = actor.dosen && ["dosen", "kaprodi", "sekpro"].includes(actor.role);
    const isOwner = actor.role === "mahasiswa" && sempro.pengajuan.idMahasiswa === actor.id;
    const evaluator = lecturer && (sempro.idDosenPembimbingSempro === actor.id || sempro.penguji.some((p) => !p.isPengganti && p.idDosenPenguji === actor.id));
    return isOwner || evaluator || canManage(actor, live.activeRole) ? item : null;
  });
  if (!item?.filePindaian) return new NextResponse("Berkas tidak ditemukan.", { status: 404 });

  try {
    const bytes = await readStoredFile(item.filePindaian, ["private", "public"]);
    const isPdf = bytes.subarray(0, 5).toString() === "%PDF-";
    const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!isPdf && !isPng && !isJpg) return new NextResponse(null, { status: 415 });
    const contentType = isPdf ? "application/pdf" : isPng ? "image/png" : "image/jpeg";

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${item.namaDokumen.replace(/[^a-zA-Z0-9_-]/g, "_")}.${isPdf ? "pdf" : isPng ? "png" : "jpg"}"`,
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Berkas fisik tidak ditemukan di penyimpanan server.", { status: 404 });
  }
}
