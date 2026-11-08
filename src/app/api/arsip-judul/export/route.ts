import { NextResponse } from "next/server";
import { database } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { exportArchiveCsv } from "@/lib/academic/archive-csv";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  // Superadmin, Kaprodi, and Sekpro can export the archive
  if (!["superadmin", "kaprodi", "sekpro"].includes(session.user.role)) {
    return new NextResponse("Unauthorized", { status: 403 });
  }

  const csv = await exportArchiveCsv(database());

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="arsip_judul_skripsi.csv"',
      "Cache-Control": "no-store",
    },
  });
}
