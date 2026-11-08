import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { accountTransaction, checkedActor } from "@/lib/accounts/store";
import { canManage } from "@/lib/accounts/policy";
import { readStoredFile } from "@/lib/academic/files";
import { legacyRequest } from "@/lib/migration/urls";
import { manifestEntry } from "@/lib/migration/contract";

export async function GET(request: Request, { params }: { params: Promise<{ legacy: string[] }> }) {
  const { legacy } = await params, route = legacyRequest(`/${legacy.join("/")}`);
  if (!route) return new NextResponse(null, { status: 404 });
  const session = await getSession();
  if (!session || session.user.statusAkun !== "aktif" || session.user.wajibGantiPassword) return new NextResponse(null, { status: 401 });
  const redirect = (destination: string) => {
    const url = new URL(destination, request.url);
    // Keep source download flags; destinations always come from internal fixed routes.
    if (new URL(request.url).searchParams.has("download")) url.searchParams.set("download", new URL(request.url).searchParams.get("download")!);
    return NextResponse.redirect(url, 307);
  };
  if (route.type === "redirect") return redirect(route.destination);
  try {
    const resolved = await accountTransaction(async (tx): Promise<{ destination?: string; file?: string; disks?: string[] }> => {
      const actor = await checkedActor(tx, session), live = await tx.authSession.findUniqueOrThrow({ where: { tokenHash: session.tokenHash } });
      const manager = canManage(actor, live.activeRole), lecturer = Boolean(actor.dosen && ["dosen", "kaprodi", "sekpro"].includes(actor.role));
      if (route.type === "storage") {
        const files = await tx.legacyImportFile.findMany({ where: { path: route.path } });
        for (const file of files) {
          const parsed = manifestEntry.safeParse(file.descriptor);
          if (!parsed.success || parsed.data.purpose === "unreferenced") continue;
          const entry = parsed.data, keys = JSON.parse(entry.pk);
          const id = Array.isArray(keys) && keys.length === 1 && typeof keys[0] === "string" && /^[1-9]\d{0,18}$/.test(keys[0]) ? keys[0] : null;
          if (!id || BigInt(id) > 9223372036854775807n) continue;
          if (entry.table === "dokumen_verifikasi" && entry.purpose === "pdf-cache") {
            const doc = await tx.dokumenVerifikasi.findUnique({ where: { id: BigInt(id) } });
            if (doc) return { destination: `/api/${doc.jenisDokumen.includes("sidang") ? "sidang" : "sempro"}/dokumen/${encodeURIComponent(doc.token)}` };
          }
          if (entry.table === "pengajuan_judul" && entry.pointer === "/file_proposal") return { destination: `/berkas/proposal/${id}/proposal` };
          if (entry.table === "checklist_dokumen" && entry.pointer === "/file_pindaian") {
            const item = await tx.checklistDokumen.findUnique({ where: { id: BigInt(id) } });
            if (item) return { destination: item.idSidangDaftar ? `/api/sidang/file/checklist/${id}` : `/api/sempro/file/${id}` };
          }
          if (entry.table === "revisi_dokumen" && entry.pointer === "/file_draft") {
            const revision = await tx.revisiDokumen.findUnique({ where: { id: BigInt(id) } });
            if (revision) return { destination: revision.tipe === "sidang" ? `/api/sidang/file/revisi/${id}` : `/sempro/revisi-draft/${id}` };
          }
          const field = ({ "/file_kwitansi": "kwitansi", "/file_krs_ska": "krs", "/file_bukti_transfer": "transfer" } as Record<string, string>)[entry.pointer];
          if (field && entry.table === "verifikasi_pembayaran") return { destination: `/berkas/administrasi/${id}/${field}` };
          if (field && entry.table === "pembayaran_sidang") return { destination: `/api/sidang/file/pembayaran/${id}?file=${field}` };
          if (entry.table === "pengumuman" && entry.pointer === "/lampiran_path") return { destination: `/api/pengumuman/${id}/lampiran` };
          if (entry.table === "kehadiran_seminar" && entry.pointer === "/path_foto") return { destination: `/sempro/kehadiran/foto/${id}` };
          if (entry.table === "dokumen_verifikasi" && entry.pointer === "/snapshot_json/file_acc_lama") {
            const doc = await tx.dokumenVerifikasi.findUnique({ where: { id: BigInt(id) } });
            if (doc) return { destination: `/api/sempro/dokumen/${encodeURIComponent(doc.token)}` };
          }
          if (entry.table === "berita_acara" && ["/bukti_kehadiran", "/berita_acara"].includes(entry.pointer)) return { destination: `/sempro/download-document/${entry.pointer === "/bukti_kehadiran" ? "bukti-kehadiran" : "berita-acara"}/${id}` };
        }
        return {};
      }
      if (BigInt(route.id) > 9223372036854775807n) return {};
      const id = BigInt(route.id);
      if (route.type === "photo") {
        const photo = await tx.kehadiranSeminar.findUnique({ where: { id }, include: { jadwal: { include: { sempro: { include: { pengajuan: true } } } } } });
        if (photo?.pathFoto && (manager || actor.role === "mahasiswa" && (photo.idMahasiswa === actor.id || photo.jadwal.sempro?.pengajuan.idMahasiswa === actor.id))) return { file: photo.pathFoto, disks: ["private"] };
        return {};
      }
      if (route.type === "sempro-upload") {
        const ba = await tx.beritaAcara.findUnique({ where: { id }, include: { jadwal: { include: { sempro: { include: { penguji: true } } } } } });
        const sempro = ba?.jadwal?.sempro;
        const evaluator = lecturer && sempro && (sempro.idDosenPembimbingSempro === actor.id || sempro.penguji.some((p) => !p.isPengganti && p.idDosenPenguji === actor.id));
        if (!manager && !evaluator) return {};
        return { file: (route.kind === "bukti-kehadiran" ? ba?.buktiKehadiran : ba?.beritaAcara) ?? undefined, disks: ["private"] };
      }
      if (route.type === "sidang-document") {
        let titleId: bigint | undefined;
        if (route.kind === "acc_sidang") {
          // Source prioritizes pengajuan PK, then falls back to pendaftaran PK.
          const title = await tx.pengajuanJudul.findUnique({ where: { id } });
          titleId = title?.id ?? (await tx.pendaftaranSidang.findUnique({ where: { id } }))?.idPengajuan;
          if (!titleId) return {};
        }
        const doc = await tx.dokumenVerifikasi.findFirst({ where: { jenisDokumen: route.kind === "form_nilai_sidang" ? { in: ["form_nilai_sidang", "form_penilaian_sidang"] } : route.kind,
          ...(titleId ? { idPengajuan: titleId } : { idJadwalSidang: id }),
          ...(route.scorer ? { penandatanganUserId: BigInt(route.scorer) } : {}) }, orderBy: [{ versi: "desc" }, { id: "desc" }] });
        return doc ? { destination: `/api/sidang/dokumen/${encodeURIComponent(doc.token)}` } : {};
      }
      const kind = ({ a: "acc", b: "undangan", c: "form_nilai", d: "berita_acara" } as Record<string, string>)[route.category];
      let titleId: bigint | undefined, scheduleId: bigint | undefined;
      if (route.category === "a") titleId = (await tx.pengajuanJudul.findUnique({ where: { id } }))?.id ?? (await tx.pendaftaranSempro.findUnique({ where: { id } }))?.idPengajuan;
      else scheduleId = (await tx.jadwalSempro.findUnique({ where: { id } }))?.id ?? (await tx.jadwalSempro.findFirst({ where: { OR: [{ idSempro: id }, { sempro: { idPengajuan: id } }] }, orderBy: { id: "desc" } }))?.id;
      if (!titleId && !scheduleId) return {};
      const doc = await tx.dokumenVerifikasi.findFirst({ where: { jenisDokumen: kind, ...(titleId ? { idPengajuan: titleId } : { idJadwal: scheduleId }) }, orderBy: [{ versi: "desc" }, { id: "desc" }] });
      return doc ? { destination: `/api/sempro/dokumen/${encodeURIComponent(doc.token)}` } : {};
    });
    if (resolved.destination) return redirect(resolved.destination);
    if (!resolved.file) return new NextResponse(null, { status: 404 });
    const bytes = await readStoredFile(resolved.file, resolved.disks);
    const pdf = bytes.subarray(0, 5).toString() === "%PDF-", png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), jpg = bytes[0] === 255 && bytes[1] === 216;
    if (!pdf && !png && !jpg) return new NextResponse(null, { status: 415 });
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": pdf ? "application/pdf" : png ? "image/png" : "image/jpeg", "Content-Disposition": `attachment; filename="dokumen.${pdf ? "pdf" : png ? "png" : "jpg"}"`, "Cache-Control": "private, no-store" } });
  } catch { return new NextResponse(null, { status: 404 }); }
}
