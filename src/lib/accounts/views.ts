import "server-only";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { canManage, type AccountPermission } from "./policy";
import type { Account } from "./store";
import { getCachedMasterFields } from "@/lib/support/master-data";

export async function requireAccountPermission(permission: AccountPermission = "manage") {
  const session = await requireSession();
  if (!canManage(session.user, session.activeRole, permission)) notFound();
  return session;
}

export async function expertiseOptions() {
  const fields = await getCachedMasterFields();
  return fields.map((field) => ({ id: field.id.toString(), namaBidang: field.namaBidang }));
}

export function profileValues(user: Account) {
  const student = user.role === "mahasiswa" ? user.mahasiswa : null;
  const lecturer = ["dosen", "kaprodi", "sekpro"].includes(user.role) ? user.dosen : null;
  return {
    nama: user.nama, email: user.email,
    ...(student ? { programStudiId: student.programStudiId?.toString() ?? null, nim: student.nim, semester: student.semester, noHp: student.noHp } : {}),
    ...(lecturer ? { programStudiId: lecturer.programStudiId?.toString() ?? null, nidn: lecturer.nidn, noHp: lecturer.noHp, bidang: lecturer.keahlian.map((item) => item.bidangId.toString()) } : {}),
  };
}

export function pageNumber(value?: string) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, 100000) : 1;
}
