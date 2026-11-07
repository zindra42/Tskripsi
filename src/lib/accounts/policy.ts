import { availableRoles, canAccessArea, type AccountPolicy } from "@/lib/auth/policy";
import type { Role } from "@/generated/prisma/enums";

export type AccountIdentity = AccountPolicy & { id: bigint };
export type AccountPermission = "manage" | "settings" | "superadmin";

export function hasAuthority(user: AccountPolicy, role: "kaprodi" | "sekpro") {
  return availableRoles(user).includes(role);
}

export function canManage(user: AccountPolicy, activeRole: Role, permission: AccountPermission = "manage") {
  if (user.role === "superadmin") return canAccessArea(user, activeRole, "superadmin");
  if (permission === "superadmin") return false;
  const roles: Role[] = permission === "settings" ? ["kaprodi"] : ["kaprodi", "sekpro"];
  return roles.some((role) => canAccessArea(user, activeRole, role));
}

export function canDecideAccount(actor: AccountIdentity, target: AccountIdentity) {
  return actor.id !== target.id && target.role !== "superadmin"
    && !(hasAuthority(actor, "sekpro") && actor.role !== "superadmin"
      && (hasAuthority(target, "kaprodi") || hasAuthority(target, "sekpro")));
}

export function canDecideReset(actor: AccountIdentity, target: AccountIdentity) {
  return actor.id !== target.id && target.role !== "superadmin"
    && (!hasAuthority(target, "kaprodi") || hasAuthority(actor, "sekpro") || actor.role === "superadmin");
}

// Preserve source values until an explicit restore. The audit stores the transformation.
export function restoredIdentity(active: string | null, archived: string | null, kind: "email" | "identifier") {
  const original = archived || active;
  if (!original) return null;
  return original.replace(kind === "email" ? /\.deleted\.\d+$/ : /_DEL_\d+$/, "");
}

export function academicPeriod(settings: Record<string, string>, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Makassar", year: "numeric", month: "numeric" }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  if (settings.periode_akademik_mode === "manual") {
    return { jenis: settings.periode_akademik_jenis ?? "ganjil", tahunMulai: Number(settings.periode_akademik_tahun_mulai ?? year) };
  }
  return { jenis: month >= 3 && month <= 8 ? "genap" : "ganjil", tahunMulai: month >= 9 ? year : year - 1 };
}

export function semesterFromNim(nim: string, settings: Record<string, string>, now = new Date()) {
  const year = nim.length >= 10 && /^(19|20)/.test(nim)
    ? Number(nim.slice(0, 4)) : Number(nim.slice(0, 2)) + (Number(nim.slice(0, 2)) >= 90 ? 1900 : 2000);
  const period = academicPeriod(settings, now);
  return Math.max(1, (period.tahunMulai - year) * 2 + (period.jenis === "ganjil" ? 1 : 2));
}
