import "server-only";
import { z } from "zod";
import { ensure } from "@/lib/accounts/store";
import { idSchema } from "@/lib/accounts/validation";
import { reason } from "@/lib/academic/validation";
import { type Context, type Input } from "@/lib/academic/store";
import { putuskanRevisiSempro } from "@/lib/sempro/scoring";

export async function reviewSemproRevision(context: Context, input: Input) {
  const row = await context.tx.revisiDokumen.findUnique({ where: { id: idSchema.parse(input.revisiId) },
    include: { beritaAcara: { include: { revisiList: { orderBy: { versi: "desc" }, take: 1 }, jadwal: { include: { sempro: { include: { penguji: true } } } } } } } });
  ensure(row?.tipe === "sempro" && row.status === "menunggu_persetujuan"
    && row.beritaAcara.revisiList[0]?.id === row.id && row.beritaAcara.hasil === "lulus_revisi"
    && row.beritaAcara.statusRevisi !== "revisi_selesai", "Revisi sempro sudah diputuskan atau bukan versi aktif.");
  const status = z.enum(["disetujui", "ditolak"]).parse(input.status);
  const note = status === "ditolak" ? reason.parse(input.reason) : undefined;
  const sempro = row.beritaAcara.jadwal?.sempro;
  ensure(context.actor.dosen && ["dosen", "kaprodi", "sekpro"].includes(context.actor.role) && sempro
    && (sempro.idDosenPembimbingSempro === context.actor.id || sempro.penguji.some((p) => !p.isPengganti && p.nomorPenguji === 1 && p.idDosenPenguji === context.actor.id)),
  "Hanya pembimbing seminar atau Penguji 1 aktif dapat mereview revisi sempro.");
  return putuskanRevisiSempro(context, row.id, status, note);
}
