import type { Role } from "@/generated/prisma/enums";

export const roleLabels: Record<Role, string> = {
  mahasiswa: "Mahasiswa",
  dosen: "Dosen",
  kaprodi: "Kepala Program Studi",
  sekpro: "Sekretaris Program Studi",
  admin_keuangan: "Admin Keuangan",
  superadmin: "Super Admin",
};

export type AccountPolicy = {
  role: Role;
  statusAkun: string;
  deletedAt: Date | null;
  wajibGantiPassword: boolean;
  dosen: { isKaprodi: boolean; isSekpro: boolean } | null;
};

export function availableRoles(user: AccountPolicy): Role[] {
  const roles: Role[] = [user.role];
  if (user.role === "dosen" && user.dosen?.isKaprodi) roles.unshift("kaprodi");
  if (user.role === "dosen" && user.dosen?.isSekpro) {
    roles.splice(user.dosen.isKaprodi ? 1 : 0, 0, "sekpro");
  }
  if ((user.role === "kaprodi" || user.role === "sekpro") && user.dosen) roles.push("dosen");
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
