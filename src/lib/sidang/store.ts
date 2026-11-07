import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ensure } from "@/lib/accounts/store";
import { canManage } from "@/lib/accounts/policy";
import { currentTitle } from "@/lib/academic/policy";
import { event, type Context } from "@/lib/academic/store";
import { type Board, validateBoard } from "./policy";

export const sidangInclude = {
  pengajuan: { include: { mahasiswa: { include: { mahasiswa: true } }, bimbingan: true,
    sempro: { include: { jadwal: { include: { beritaAcara: true } } } } } },
  checklist: { orderBy: { nomorItem: "asc" } },
  penguji: { include: { dosen: true }, orderBy: { id: "desc" } },
  jadwalList: { orderBy: { id: "desc" }, include: { konfirmasiList: { include: { dosen: true } },
    beritaAcaraList: { include: { revisiList: { orderBy: { versi: "desc" } } } },
    penilaianList: true, riwayatList: true, permohonanList: true, documents: true } },
} satisfies Prisma.PendaftaranSidangInclude;
export type Sidang = Prisma.PendaftaranSidangGetPayload<{ include: typeof sidangInclude }>;
export type Schedule = Sidang["jadwalList"][number];

export async function sidangRecord(context: Context, id: bigint, writable = true) {
  const row = await context.tx.pendaftaranSidang.findUnique({ where: { id }, include: sidangInclude });
  ensure(row, "Pendaftaran sidang tidak ditemukan.");
  if (writable) {
    ensure(currentTitle(row.pengajuan) && row.pengajuan.status === "disetujui" && row.pengajuan.mahasiswa.role === "mahasiswa"
      && row.pengajuan.mahasiswa.statusAkun === "aktif" && !row.pengajuan.mahasiswa.deletedAt,
    "Pengajuan diarsipkan atau mahasiswa tidak aktif.");
    ensure(row.pengajuan.bimbingan?.siklusKe === row.siklusKe && row.pengajuan.siklusKe === row.siklusKe,
      "Sidang siklus sebelumnya hanya dapat dibaca.");
  }
  return row;
}
export function requireOwner(context: Context, row: Sidang) {
  ensure(context.actor.role === "mahasiswa" && row.pengajuan.idMahasiswa === context.actor.id, "Tindakan hanya untuk mahasiswa pemilik.");
}
export function currentBoard(row: Sidang): Board {
  const b = row.pengajuan.bimbingan;
  for (const slot of [1, 2]) ensure(row.penguji.filter((p) => p.jenis === "sidang" && p.nomorPenguji === slot && !p.isPengganti).length <= 1,
    "Penugasan penguji aktif ganda perlu direkonsiliasi.");
  const p1 = row.penguji.find((p) => p.jenis === "sidang" && p.nomorPenguji === 1 && !p.isPengganti);
  const p2 = row.penguji.find((p) => p.jenis === "sidang" && p.nomorPenguji === 2 && !p.isPengganti);
  return validateBoard({ ...(b?.idDosenPembimbing ? { pembimbing_1: String(row.idDosenPembimbingSidang ?? b.idDosenPembimbing) } : {}),
    ...(b?.idDosenPembimbing2 ? { pembimbing_2: String(b.idDosenPembimbing2) } : {}),
    ...(p1 ? { penguji_1: String(p1.idDosenPenguji) } : {}), ...(p2 ? { penguji_2: String(p2.idDosenPenguji) } : {}) });
}
export function snapshotBoard(schedule: Pick<Schedule, "dewanSnapshot">): Board {
  const raw = schedule.dewanSnapshot;
  ensure(raw && typeof raw === "object" && !Array.isArray(raw), "Snapshot dewan perlu direkonsiliasi sebelum tindakan.");
  ensure(Object.values(raw).every((value) => typeof value === "string"), "Snapshot dewan tidak valid.");
  // Callers may edit a proposed board; keep the loaded snapshot intact for audit history.
  return validateBoard({ ...raw } as Board);
}
export function canRead(context: Pick<Context, "actor" | "role">, row: Sidang) {
  return canManage(context.actor, context.role) || context.actor.role === "mahasiswa" && row.pengajuan.idMahasiswa === context.actor.id
    || Boolean(context.actor.dosen && ["dosen", "kaprodi", "sekpro"].includes(context.actor.role)
      && (row.pengajuan.bimbingan?.idDosenPembimbing === context.actor.id || row.pengajuan.bimbingan?.idDosenPembimbing2 === context.actor.id
        || row.penguji.some((p) => !p.isPengganti && p.idDosenPenguji === context.actor.id)
        || row.jadwalList.some((j) => j.konfirmasiList.some((c) => c.dosenId === context.actor.id))));
}
export async function scheduleRecord(context: Context, id: bigint, writable = true) {
  const schedule = await context.tx.jadwalSidang.findUnique({ where: { id }, select: { idSidang: true } });
  ensure(schedule, "Jadwal sidang tidak ditemukan.");
  const row = await sidangRecord(context, schedule.idSidang, writable);
  const jadwal = row.jadwalList.find((j) => j.id === id)!;
  ensure(jadwal.beritaAcaraList.length <= 1, "Berita acara historis ganda perlu direkonsiliasi.");
  if (writable) ensure(row.jadwalList[0]?.id === id, "Jadwal lama hanya dapat dibaca.");
  return { row, jadwal };
}
export function assertVersion(jadwal: Schedule, version: number) {
  ensure(jadwal.versi === version, "Jadwal sudah berubah. Muat ulang formulir.");
}
export function requireBoardActor(context: Context, jadwal: Schedule) {
  ensure(context.actor.dosen && ["dosen", "kaprodi", "sekpro"].includes(context.actor.role), "Peran dosen aktif diperlukan.");
  const board = snapshotBoard(jadwal);
  ensure(Object.values(board).includes(String(context.actor.id)), "Anda bukan dewan sidang pada versi ini.");
  return board;
}
export async function sidangEvent(context: Context, name: string, row: Sidang, before: unknown, after: unknown, extra: bigint[] = []) {
  await event(context, name, `sidang:${row.id}`, before, after,
    [row.pengajuan.idMahasiswa, row.pengajuan.bimbingan?.idDosenPembimbing ?? null,
      row.pengajuan.bimbingan?.idDosenPembimbing2 ?? null, ...extra],
    `Pembaruan sidang: ${name.replaceAll("_", " ")}.`, `/sidang/${row.id}`);
}
