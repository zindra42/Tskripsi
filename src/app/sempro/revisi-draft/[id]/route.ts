import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { accountTransaction, checkedActor } from "@/lib/accounts/store";
import { canManage } from "@/lib/accounts/policy";
import { readStoredFile } from "@/lib/academic/files";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(), { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) return new NextResponse("Tidak ditemukan.", { status: 404 });
  const file = await accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session), live = await tx.authSession.findUniqueOrThrow({ where: { tokenHash: session.tokenHash } });
    const row = await tx.revisiDokumen.findUnique({ where: { id: BigInt(id) }, include: { beritaAcara: { include: { jadwal: { include: {
      sempro: { include: { penguji: true, pengajuan: { include: { bimbingan: true } } } },
    } } } } } });
    const sempro = row?.beritaAcara.jadwal?.sempro;
    if (row?.tipe !== "sempro" || !sempro) return null;
    const lecturer = actor.dosen && ["dosen", "kaprodi", "sekpro"].includes(actor.role)
      && ([sempro.idDosenPembimbingSempro, sempro.pengajuan.bimbingan?.idDosenPembimbing, sempro.pengajuan.bimbingan?.idDosenPembimbing2].includes(actor.id)
        || sempro.penguji.some((p) => !p.isPengganti && p.idDosenPenguji === actor.id));
    return row.mahasiswaId === actor.id && actor.role === "mahasiswa" || lecturer || canManage(actor, live.activeRole) ? row.fileDraft : null;
  });
  if (!file) return new NextResponse("Naskah tidak tersedia untuk Anda.", { status: 404 });
  try {
    const bytes = await readStoredFile(file);
    if (bytes.subarray(0, 5).toString() !== "%PDF-") return new NextResponse("Format naskah tidak didukung.", { status: 415 });
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="revisi_sempro_${id}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch { return new NextResponse("Berkas tidak ditemukan.", { status: 404 }); }
}
