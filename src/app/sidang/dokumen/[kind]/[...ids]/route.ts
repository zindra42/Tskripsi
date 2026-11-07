import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { database } from "@/lib/db";
import { GET as download } from "@/app/api/sidang/dokumen/[token]/route";

// Preserve legacy links; authorization is shared with the canonical download endpoint.
export async function GET(request: Request, { params }: { params: Promise<{ kind: string; ids: string[] }> }) {
  await requireSession();
  const { kind, ids } = await params;
  const kinds: Record<string, string> = { undangan: "undangan_sidang", "form-penilaian": "form_nilai_sidang",
    "berita-acara": "berita_acara_sidang", rekap: "rekap_nilai_sidang" };
  if (!kinds[kind] || ids.length !== (kind === "form-penilaian" ? 2 : 1)
    || ids.some((id) => !/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n)) return new NextResponse("Tidak ditemukan.", { status: 404 });
  const doc = await database().dokumenVerifikasi.findFirst({ where: { idJadwalSidang: BigInt(ids[0]),
    jenisDokumen: kind === "form-penilaian" ? { in: ["form_nilai_sidang", "form_penilaian_sidang"] } : kinds[kind],
    status: "sah", ...(ids[1] ? { penandatanganUserId: BigInt(ids[1]) } : {}) }, orderBy: [{ versi: "desc" }, { id: "desc" }] });
  if (!doc) return new NextResponse("Dokumen belum tersedia.", { status: 404 });
  return download(request, { params: Promise.resolve({ token: doc.token }) });
}
