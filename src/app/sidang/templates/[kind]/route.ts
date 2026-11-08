import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { createSecureFileResponse } from "@/lib/academic/files";

const templates: Record<string, string> = {
  acc: "Template_Lembar_ACC_Sidang.pdf", "lembar-acc": "Template_Lembar_ACC_Sidang.pdf",
  undangan: "Template_Undangan_Sidang.pdf", "form-nilai": "Template_Penilaian_Sidang.pdf", penilaian: "Template_Penilaian_Sidang.pdf",
  rekap: "Template_Rekap_Data_Penilaian_Sidang.pdf", "rekap-nilai": "Template_Rekap_Data_Penilaian_Sidang.pdf",
  "berita-acara": "Template_Berita_Acara_Sidang.pdf", ba: "Template_Berita_Acara_Sidang.pdf",
};
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  await requireSession();
  const { kind } = await params, file = Object.hasOwn(templates, kind) ? templates[kind] : null;
  if (!file) return new NextResponse("Template tidak ditemukan.", { status: 404 });
  try {
    const bytes = await readFile(path.join(process.cwd(), "assets", "sidang", file));
    return createSecureFileResponse(bytes, file, {
      disposition: new URL(request.url).searchParams.has("download") ? "attachment" : "inline",
      allowedExtensions: ["pdf"],
    });
  } catch { return new NextResponse("Template tidak tersedia.", { status: 404 }); }
}
