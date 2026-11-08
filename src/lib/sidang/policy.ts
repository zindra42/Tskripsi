import { z } from "zod";

export const SIDANG_ITEMS = [
  "Naskah Skripsi Lengkap", "Transkrip Nilai dan IPK", "Persetujuan Dosen Pembimbing (Surat ACC Sidang)",
  "Sertifikat TOEFL", "SK Pembimbing MBKM", "Sertifikat Program Pembinaan Terpadu (Mentoring)",
  "Sertifikat Public Speaking", "Sertifikat Keahlian Profesi", "Surat Keterangan Bebas Administrasi Keuangan",
  "Surat Keterangan Bebas Plagiarisme UPT Perpustakaan", "Penggandaan Skripsi",
] as const;

export const COMPONENT_NAMES: Record<string, string> = {
  A_a: "Pokok permasalahan", A_b: "Kerangka Pemikiran", A_c: "Metode penelitian", A_d: "Hasil Penelitian",
  A_e: "Bahasa", A_f: "Teknik penulisan", B: "Manfaat akademis dan praktis", C_a: "Penguasaan Materi",
  C_b: "Penguasaan Metode", C_c: "Kemampuan Argumentasi",
};
export const SUPERVISOR_WEIGHTS = { A_a: 10, A_b: 20, A_c: 10, A_d: 20, A_e: 10, A_f: 10, B: 20 };
export const EXAMINER_WEIGHTS = { A_a: 5, A_b: 15, A_c: 10, A_d: 10, A_e: 5, A_f: 5, B: 15, C_a: 15, C_b: 10, C_c: 10 };
export const decisionSchema = z.enum(["lulus", "lulus_revisi", "tidak_lulus"]);
export const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const slotSchema = z.object({ tanggal: z.iso.date(), mulai: timeSchema, selesai: timeSchema,
  ruang: z.string().trim().min(2).max(255) });
export type Slot = z.infer<typeof slotSchema>;
export type Board = Record<string, string>;

// Validate decimal input without coercing exponential/NaN/infinite values.
export function hundredths(value: unknown, max = 100) {
  const s = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  const parsed = z.string().regex(/^\d{1,3}(?:\.\d{1,2})?$/).parse(s);
  const [whole, fraction = ""] = parsed.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (amount > max * 100) throw new Error(`Nilai harus antara 0 dan ${max}, maksimal dua desimal.`);
  return amount;
}
export function decimal(amount: number) { return (amount / 100).toFixed(2); }
// For these nonnegative, bounded scores reproduce PHP 8.4's two-decimal
// half-away boundary comparison, including the source's intermediate rounding.
// Imported final values are never recalculated with this function.
function sourceRound(value: number) {
  let whole = Math.floor(value * 100);
  if ((whole + 1) / 100 === value) whole++;
  return (whole + (value >= (whole + 0.5) / 100 ? 1 : 0)) / 100;
}
export function formScore(role: string, input: Record<string, unknown>) {
  const weights = role === "pembimbing" ? SUPERVISOR_WEIGHTS : EXAMINER_WEIGHTS;
  let sum = 0;
  const components: Record<string, string> = {};
  for (const [code, weight] of Object.entries(weights)) {
    const score = hundredths(input[code], 10);
    components[code] = decimal(score);
    sum += sourceRound(weight * Number(components[code]));
  }
  return { components, weights, total: sourceRound(sum / 10).toFixed(2) };
}
export function recap(p1: string, p2: string, supervisor: string, method = "proporsional_34_33_33") {
  for (const value of [p1, p2, supervisor]) hundredths(value);
  const a = Number(p1), b = Number(p2), c = Number(supervisor);
  // Match source: round each weighted contribution before adding, and round the examiner mean first.
  return sourceRound(method === "proporsional_34_33_33"
    ? sourceRound(0.34 * a) + sourceRound(0.33 * b) + sourceRound(0.33 * c)
    : (sourceRound(sourceRound(a + b) / 2) + c) / 2).toFixed(2);
}
export function grade(value: string) {
  const score = hundredths(value);
  return [[8500, "A"], [8000, "A-"], [7500, "B+"], [7000, "B"], [6500, "B-"],
    [6000, "C+"], [5000, "C"], [4000, "D"], [0, "E"]].find(([limit]) => score >= Number(limit))![1] as string;
}
export function officialResult(row: { hasil: string | null; statusPersetujuan: string | null; disetujuiKaprodiAt?: Date | null }) {
  return row.statusPersetujuan === "disetujui_kaprodi" || decisionSchema.safeParse(row.hasil).success
    || Boolean(row.hasil && row.disetujuiKaprodiAt);
}
export function revisionComplete(row: { hasil: string | null; statusRevisi: string | null; statusPersetujuan: string | null }) {
  return officialResult(row) && (row.hasil === "lulus" || row.hasil === "lulus_revisi" && row.statusRevisi === "revisi_selesai");
}
export function boardIds(board: Board) { return [...new Set(Object.values(board))]; }
export function revisionApprovers(scores: { penilaiId: bigint; peran: string; perluRevisi: boolean }[]) {
  const requested = scores.filter((p) => p.perluRevisi);
  const selected = requested.length ? requested : scores;
  if (!selected.length) throw new Error("Penilai historis kosong; tentukan approver melalui rekonsiliasi.");
  return Object.fromEntries(selected.map((p) => [p.peran, { dosen_id: String(p.penilaiId), peran: p.peran, status: "menunggu", catatan: null, at: null }]));
}
export function validateBoard(board: Board) {
  if (!board.pembimbing_1 || !board.penguji_1 || !board.penguji_2 || boardIds(board).length !== Object.keys(board).length)
    throw new Error("Dewan harus memiliki pembimbing utama dan dua penguji berbeda; pembimbing tidak boleh menjadi penguji.");
  if (Object.values(board).some((id) => !/^[1-9]\d*$/.test(id))) throw new Error("Identitas dewan tidak valid.");
  return board;
}
export function scoreRole(board: Board, actor: bigint) {
  const slot = Object.keys(board).find((key) => board[key] === String(actor));
  return slot === "pembimbing_1" ? "pembimbing" : slot?.startsWith("penguji_") ? slot : null;
}
export function witaToday(now = new Date()) { return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10); }
export function validateSlot(input: unknown, now = new Date()): Slot {
  const slot = slotSchema.parse(input);
  if (slot.tanggal < witaToday(now) || slot.mulai < "08:00" || slot.selesai > "17:00" || slot.mulai >= slot.selesai)
    throw new Error("Jadwal harus mulai 08:00-17:00 WITA dan tanggal tidak boleh lampau.");
  return slot;
}
export function overlap(a: { waktuMulai: string | null; waktuSelesai: string | null }, start: string, end: string) {
  return Boolean(a.waktuMulai && a.waktuSelesai && a.waktuMulai.slice(0, 5) < end && a.waktuSelesai.slice(0, 5) > start);
}
export { announcementVisible } from "@/lib/support/policy";
