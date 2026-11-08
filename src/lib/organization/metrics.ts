import { officialResult, revisionComplete, witaToday } from "@/lib/sidang/policy";

export type ResultMetric = { hasil: string | null; statusRevisi: string | null; statusPersetujuan: string; tenggatRevisi: Date | null };
export type TitleMetric = {
  status: string; siklusKe: number;
  bimbingan: { siklusKe: number; idDosenPembimbing: bigint | null; idDosenPembimbing2: bigint | null } | null;
  sempro: { siklusKe: number; statusDraft: string; jadwal: { beritaAcara: ResultMetric | null } | null } | null;
  sidangList: { siklusKe: number; statusDraft: string; jadwalList: { beritaAcaraList: ResultMetric[] }[] }[];
};
export const stageLabels = { belum: "Belum mengajukan", judul: "Judul", bimbingan: "Bimbingan", sempro: "Sempro", sidang: "Sidang", selesai: "Selesai" };
export type Stage = keyof typeof stageLabels;

export function academicStage(title: TitleMetric | undefined, now = new Date()): { stage: Stage; late: number } {
  if (!title) return { stage: "belum", late: 0 };
  const sempro = title.sempro?.siklusKe === title.siklusKe && title.sempro.statusDraft === "diajukan" ? title.sempro : null;
  const defense = title.sidangList.find((s) => s.siklusKe === title.siklusKe && s.statusDraft === "diajukan");
  const result = defense?.jadwalList[0]?.beritaAcaraList[0];
  const seminarResult = sempro?.jadwal?.beritaAcara;
  const late = [seminarResult, result].filter((r) => r && officialResult(r) && r.hasil === "lulus_revisi"
    && r.statusRevisi !== "revisi_selesai" && r.tenggatRevisi && r.tenggatRevisi.toISOString().slice(0, 10) < witaToday(now)).length;
  if (result && revisionComplete(result)) return { stage: "selesai", late };
  if (defense) return { stage: "sidang", late };
  // After seminar and revisions, the student is back in thesis guidance until defense submission.
  if (seminarResult && revisionComplete(seminarResult)) return { stage: "bimbingan", late };
  if (sempro) return { stage: "sempro", late };
  if (title.status === "disetujui" && title.bimbingan?.siklusKe === title.siklusKe && title.bimbingan.idDosenPembimbing) return { stage: "bimbingan", late };
  return { stage: "judul", late };
}
