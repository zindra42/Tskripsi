import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { database } from "@/lib/db";
import { GET as download } from "@/app/api/sidang/dokumen/[token]/route";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) return new NextResponse("Tidak ditemukan.", { status: 404 });
  const db = database();
  // Source treats the ID as pengajuan first, with a pendaftaran fallback.
  const title = await db.pengajuanJudul.findUnique({ where: { id: BigInt(id) }, select: { id: true } });
  const registration = title ? null : await db.pendaftaranSidang.findUnique({ where: { id: BigInt(id) }, select: { idPengajuan: true } });
  const titleId = title?.id ?? registration?.idPengajuan;
  if (!titleId) return new NextResponse("Tidak ditemukan.", { status: 404 });
  const doc = await db.dokumenVerifikasi.findFirst({ where: { idPengajuan: titleId, jenisDokumen: "acc_sidang", status: "sah" },
    orderBy: [{ versi: "desc" }, { id: "desc" }] });
  return doc ? download(request, { params: Promise.resolve({ token: doc.token }) }) : new NextResponse("ACC Sidang belum tersedia.", { status: 404 });
}
