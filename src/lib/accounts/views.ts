import "server-only";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { canManage, type AccountPermission } from "./policy";
import type { Account } from "./store";
import { getCachedMasterFields } from "@/lib/support/master-data";
import { database } from "@/lib/db";
import { activeProgramId } from "@/lib/organization/policy";

export async function requireAccountPermission(permission: AccountPermission = "manage") {
  const session = await requireSession();
  if (!canManage(session.user, session.activeRole, permission)) notFound();
  return session;
}

export async function expertiseOptions(programId?: bigint | null) {
  // Forms that can change affiliation receive only public master metadata.
  const fields = programId === undefined ? await database().bidangKeahlian.findMany({
    where: { programStudiId: { not: null }, programStudi: { aktif: true, fakultas: { aktif: true } } },
    select: { id: true, namaBidang: true, programStudiId: true }, orderBy: { namaBidang: "asc" },
  }) : await getCachedMasterFields(programId);
  return fields.map((field) => ({ id: field.id.toString(), namaBidang: field.namaBidang, programStudiId: field.programStudiId!.toString() }));
}

export function profileValues(user: Account) {
  const student = user.role === "mahasiswa" ? user.mahasiswa : null;
  const lecturer = ["dosen", "kaprodi", "sekpro"].includes(user.role) ? user.dosen : null;
  return {
    nama: user.nama, email: user.email,
    ...(student ? { programStudiId: student.programStudiId?.toString() ?? null, nim: student.nim, semester: student.semester, noHp: student.noHp } : {}),
    ...(lecturer ? { programStudiId: lecturer.programStudiId?.toString() ?? null, nidn: lecturer.nidn, noHp: lecturer.noHp,
      bidang: lecturer.keahlian.filter((item) => activeProgramId(lecturer) !== null && item.bidang.programStudiId === activeProgramId(lecturer)).map((item) => item.bidangId.toString()) } : {}),
  };
}

export function pageNumber(value?: string) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, 100000) : 1;
}
