import type { Bimbingan, PengajuanJudul, VerifikasiPembayaran } from "@/generated/prisma/client";
import type { Account } from "@/lib/accounts/store";
import { canManage } from "@/lib/accounts/policy";
import type { Role } from "@/generated/prisma/enums";
import { activeProgramId } from "@/lib/organization/policy";

export function witaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function academicRange(settings: Record<string, string>) {
  return { start: settings.periode_akademik_mulai || "2026-08-01", end: settings.periode_akademik_selesai || "2027-01-31" };
}

export function periodCode(settings: Record<string, string>) {
  const range = academicRange(settings);
  return `${range.start} s/d ${range.end}`;
}

export function administrationValid(row: VerifikasiPembayaran | null, settings: Record<string, string>, now = new Date()) {
  if (!row || row.statusVerifikasi !== "terverifikasi" || row.perluVerifikasiUlang) return false;
  const today = witaDate(now);
  const range = academicRange(settings);
  if (today > range.end) return false;
  if (row.periode) return row.periode === periodCode(settings);
  return Boolean(row.createdAt && witaDate(row.createdAt) >= range.start && witaDate(row.createdAt) <= range.end);
}

export function isAssigned(userId: bigint, b: Pick<Bimbingan, "idDosenPembimbing" | "idDosenPembimbing2">) {
  return userId === b.idDosenPembimbing || userId === b.idDosenPembimbing2;
}

export function isLecturer(user: Account) {
  return Boolean(user.dosen && ["dosen", "kaprodi", "sekpro"].includes(user.role));
}

export type TitleScope = Pick<PengajuanJudul, "idMahasiswa"> & { mahasiswa?: { mahasiswa?: { programStudiId: bigint | null } | null } | null };
export function managesTitle(user: Account, role: Role, title: TitleScope) {
  return canManage(user, role) && (user.role === "superadmin" || !!activeProgramId(user.dosen)
    && activeProgramId(user.dosen) === title.mahasiswa?.mahasiswa?.programStudiId);
}
export function canReadTitle(user: Account, role: Role, title: TitleScope, b: Bimbingan | null) {
  return user.role === "mahasiswa" && user.id === title.idMahasiswa || managesTitle(user, role, title)
    || Boolean(isLecturer(user) && b && isAssigned(user.id, b));
}

export function currentTitle(title: Pick<PengajuanJudul, "deletedAt" | "isDiarsipkan" | "status">) {
  return !title.deletedAt && !title.isDiarsipkan && title.status !== "dibatalkan";
}
