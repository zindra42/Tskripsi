import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { database } from "@/lib/db";
import { announcementVisible } from "@/lib/support/policy";
import { createSecureFileResponse, readStoredFile } from "@/lib/academic/files";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) return new NextResponse("Tidak ditemukan.", { status: 404 });
  const row = await database().pengumuman.findUnique({ where: { id: BigInt(id) } });
  const session = await getSession();
  const role = session?.user.statusAkun === "aktif" && !session.user.wajibGantiPassword ? session.user.role : undefined;
  if (!row?.lampiranPath || !announcementVisible(row, role)) return new NextResponse("Lampiran tidak tersedia.", { status: 404 });
  try {
    const file = await readStoredFile(row.lampiranPath);
    return createSecureFileResponse(file, `lampiran_${id}`, {
      disposition: "attachment",
      allowedExtensions: ["pdf"],
      fallbackExtension: "bin",
      contentType: "application/octet-stream",
    });
  } catch { return new NextResponse("Berkas tidak ditemukan.", { status: 404 }); }
}
