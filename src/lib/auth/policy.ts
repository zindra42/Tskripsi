import type { Role } from "@/generated/prisma/enums";
import { activeProgramId, type Affiliation } from "@/lib/organization/policy";

export const roleLabels: Record<Role, string> = {
  mahasiswa: "Mahasiswa",
  dosen: "Dosen",
  kaprodi: "Kepala Program Studi",
  sekpro: "Sekretaris Program Studi",
  admin_keuangan: "Admin Keuangan",
  superadmin: "Super Admin",
  dekan: "Dekan",
};

export type AccountPolicy = {
  role: Role;
  statusAkun: string;
  deletedAt: Date | null;
  wajibGantiPassword: boolean;
  fakultasId?: bigint | null;
  fakultas?: { aktif: boolean } | null;
  dosen: (Affiliation & { isKaprodi: boolean; isSekpro: boolean; prodi?: string | null }) | null;
  mahasiswa?: (Affiliation & { prodi?: string | null }) | null;
};

export function availableRoles(user: AccountPolicy): Role[] {
  if (!["dosen", "kaprodi", "sekpro"].includes(user.role)) return [user.role];
  const roles: Role[] = ["dosen"];
  if (!activeProgramId(user.dosen)) return roles;
  if (user.role === "kaprodi" || user.role === "sekpro") return [user.role, "dosen"];
  if (user.dosen?.isKaprodi) roles.unshift("kaprodi");
  if (user.dosen?.isSekpro) roles.splice(roles.includes("kaprodi") ? 1 : 0, 0, "sekpro");
  return roles;
}

export function canAuthenticate(user: AccountPolicy): boolean {
  return user.deletedAt === null && ["aktif", "menunggu_persetujuan", "ditolak"].includes(user.statusAkun);
}

export function canAccessArea(user: AccountPolicy, activeRole: Role, area: Role): boolean {
  if (!canAuthenticate(user) || user.statusAkun !== "aktif" || user.wajibGantiPassword) return false;
  if (user.role === "superadmin") return true;
  return availableRoles(user).includes(activeRole) && activeRole === area;
}

export function landingPath(user: AccountPolicy, activeRole: Role): string {
  if (!canAuthenticate(user)) return "/login";
  if (user.statusAkun !== "aktif") return "/menunggu-persetujuan";
  if (user.wajibGantiPassword) return "/ganti-password";
  const roles = availableRoles(user);
  return `/dashboard/${roles.includes(activeRole) ? activeRole : roles[0]}`;
}

export function isRole(value: string): value is Role {
  return Object.hasOwn(roleLabels, value);
}
