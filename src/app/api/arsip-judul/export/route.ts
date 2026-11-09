import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { AccountError } from "@/lib/accounts/store";
import { titleFilters } from "@/lib/academic/title-list-params";
import { exportTitleList } from "@/lib/academic/title-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const session = await getSession();
    if (!session) return new NextResponse("Silakan masuk kembali.", { status: 401, headers });
    const params = new URL(request.url).searchParams;
    const filters = titleFilters(Object.fromEntries(params));
    const submissions = params.get("list") === "judul";
    const csv = await exportTitleList(session, filters, submissions);
    const source = submissions || filters.mode === "pengajuan" ? "pengajuan" : "arsip";
    return new NextResponse(csv, { headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${source}_judul_skripsi.csv"`,
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof AccountError) return new NextResponse(error.message, { status: 403, headers });
    return new NextResponse("Unduhan gagal. Silakan muat ulang dan coba kembali.", { status: 503, headers });
  }
}
