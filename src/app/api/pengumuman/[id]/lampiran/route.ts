import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { database } from "@/lib/db";
import { announcementVisible } from "@/lib/support/policy";
import { readStoredFile } from "@/lib/academic/files";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) return new NextResponse("Tidak ditemukan.", { status: 404 });
  const row = await database().pengumuman.findUnique({ where: { id: BigInt(id) } });
  const session = await getSession();
  const role = session?.user.statusAkun === "aktif" && !session.user.wajibGantiPassword ? session.user.role : undefined;
  if (!row?.lampiranPath || !announcementVisible(row, role)) return new NextResponse("Lampiran tidak tersedia.", { status: 404 });
  try {
    const file = await readStoredFile(row.lampiranPath);
    const pdf = file.subarray(0, 5).toString() === "%PDF-";
    return new NextResponse(new Uint8Array(file), { headers: { "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="lampiran_${id}.${pdf ? "pdf" : "bin"}"`, "Cache-Control": "private, no-store" } });
  } catch { return new NextResponse("Berkas tidak ditemukan.", { status: 404 }); }
}
