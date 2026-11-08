import type { AccountPolicy } from "@/lib/auth/policy";
import type { Role } from "@/generated/prisma/enums";

export type Affiliation = {
  programStudiId?: bigint | null;
  programStudi?: { id: bigint; fakultasId: bigint; aktif: boolean; fakultas: { aktif: boolean } } | null;
};

export function activeProgramId(profile?: Affiliation | null): bigint | null {
  const p = profile?.programStudi;
  return p && p.id === profile?.programStudiId && p.aktif && p.fakultas.aktif ? p.id : null;
}

export function accountProgramId(user: AccountPolicy) {
  return user.role === "mahasiswa" ? activeProgramId(user.mahasiswa)
    : ["dosen", "kaprodi", "sekpro"].includes(user.role) ? activeProgramId(user.dosen) : null;
}

export function canGovern(user: AccountPolicy, role: Role, fakultasId?: bigint) {
  if (user.statusAkun !== "aktif" || user.deletedAt || user.wajibGantiPassword) return false;
  if (user.role === "superadmin") return true;
  return user.role === "dekan" && role === "dekan" && !!user.fakultasId && !!user.fakultas?.aktif
    && (fakultasId === undefined || user.fakultasId === fakultasId);
}
