import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { accountTransaction, checkedActor } from "@/lib/accounts/store";
import { canManage } from "@/lib/accounts/policy";
import { sidangRecord, canRead } from "@/lib/sidang/store";
import { revisionComplete } from "@/lib/sidang/policy";
import { renderSidangPdf } from "@/lib/sidang/documents";
import { importedDocumentFile, readImportedDocument } from "@/lib/migration/document-files";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await requireSession();
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return new NextResponse("Tidak ditemukan.", { status: 404 });
  const doc = await accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session);
    const live = await tx.authSession.findUniqueOrThrow({ where: { tokenHash: session.tokenHash } });
    const doc = await tx.dokumenVerifikasi.findUnique({ where: { token } });
    if (!doc || !["undangan_sidang", "berita_acara_sidang", "rekap_nilai_sidang", "form_nilai_sidang", "form_penilaian_sidang", "acc_sidang"].includes(doc.jenisDokumen)) return null;
    const context = { tx, actor, role: live.activeRole };
    const id = doc.idSidang ?? (doc.idJadwalSidang ? (await tx.jadwalSidang.findUnique({ where: { id: doc.idJadwalSidang } }))?.idSidang : undefined);
    if (id) {
      const row = await sidangRecord(context, id, false);
      const lecturer = actor.dosen && ["dosen", "kaprodi", "sekpro"].includes(actor.role);
      // The legacy invitation/minutes routes also allow other active lecturers.
      const wide = lecturer && ["undangan_sidang", "berita_acara_sidang"].includes(doc.jenisDokumen);
      if (!canRead(context, row) && !wide) return null;
      if (doc.jenisDokumen === "rekap_nilai_sidang" && !canManage(actor, live.activeRole)) return null;
      if (doc.jenisDokumen === "berita_acara_sidang") {
        const j = row.jadwalList.find((j) => j.id === doc.idJadwalSidang);
        const ba = j?.beritaAcaraList[0];
        if (!ba?.hasil || j?.statusPelaksanaan !== "selesai" || actor.role === "mahasiswa" && !revisionComplete(ba)) return null;
      }
    } else if (doc.jenisDokumen === "acc_sidang" && doc.idPengajuan) {
      const title = await tx.pengajuanJudul.findUnique({ where: { id: doc.idPengajuan }, include: { bimbingan: true } });
      if (!title || !(title.idMahasiswa === actor.id && actor.role === "mahasiswa" || canManage(actor, live.activeRole)
        || actor.dosen && ["dosen", "kaprodi", "sekpro"].includes(actor.role)
        && [title.bimbingan?.idDosenPembimbing, title.bimbingan?.idDosenPembimbing2].includes(actor.id))) return null;
    } else return null;
    return { ...doc, historical: await importedDocumentFile(tx, doc) };
  });
  if (!doc) return new NextResponse("Dokumen tidak tersedia untuk Anda.", { status: 404 });
  if (doc.status !== "sah") return new NextResponse("Dokumen telah dicabut atau digantikan. Periksa status pada halaman verifikasi.", { status: 410 });
  const historical = doc.historical.imported ? await readImportedDocument(doc.historical) : null;
  if (doc.historical.imported && !historical) return new NextResponse("Berkas dokumen historis belum direkonsiliasi.", { status: 409 });
  return new NextResponse(new Uint8Array(historical ?? renderSidangPdf(doc)), { headers: { "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${doc.jenisDokumen}_v${doc.versi}.pdf"`, "Cache-Control": "private, no-store" } });
}
