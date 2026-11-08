import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { database } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { accountSelect, type Account } from "@/lib/accounts/store";
import { canManage } from "@/lib/accounts/policy";
import { canAuthenticate } from "@/lib/auth/policy";
import type { Prisma } from "@/generated/prisma/client";
import { recommendationScore } from "./similarity";
import { supervisorLoad } from "./store";
import { isLecturer } from "./policy";
import { getCachedMasterFields } from "@/lib/support/master-data";

export async function academicViewer() {
  const session = await requireSession();
  const actor = await database().pengguna.findUniqueOrThrow({ where: { id: session.user.id }, select: accountSelect });
  if (!canAuthenticate(actor) || actor.statusAkun !== "aktif" || actor.wajibGantiPassword || actor.authVersion !== session.authVersion) redirect("/login?session=expired");
  return { session, actor, manager: canManage(actor, session.activeRole), kaprodi: canManage(actor, session.activeRole, "settings"),
    finance: actor.role === "admin_keuangan" || actor.role === "superadmin" };
}

export function scopedTitles(actor: Account, manager: boolean): Prisma.PengajuanJudulWhereInput {
  if (manager) {
    if (actor.role !== "superadmin" && actor.dosen?.prodi) {
      return { mahasiswa: { mahasiswa: { prodi: actor.dosen.prodi } } };
    }
    return {};
  }
  const owner = { idMahasiswa: actor.id };
  return isLecturer(actor) ? { OR: [owner, { bimbingan: { OR: [{ idDosenPembimbing: actor.id }, { idDosenPembimbing2: actor.id }] } }] } : owner;
}

export const titleOptions = cache(async () => {
  const [fields, lecturers] = await Promise.all([
    getCachedMasterFields(),
    database().dosen.findMany({ where: { pengguna: { deletedAt: null, statusAkun: "aktif", role: { in: ["dosen", "kaprodi", "sekpro"] } },
      OR: [{ nidn: null }, { NOT: { nidn: { contains: "_DEL_" } } }],
    }, include: { pengguna: { select: { nama: true } }, keahlian: { include: { bidang: true } } }, orderBy: { penggunaId: "asc" } }),
  ]);
  return { fields: fields.map((field) => ({ id: field.id.toString(), namaBidang: field.namaBidang })),
    lecturers: lecturers.map((lecturer) => ({ id: lecturer.penggunaId.toString(), nama: lecturer.pengguna.nama })), rawLecturers: lecturers };
});

export async function recommendations(title: { judul: string; bidangKeahlianId: bigint | null; bidangKeahlian2Id: bigint | null; matriksPenelitian: unknown }, except?: bigint) {
  const options = await titleOptions();
  const fields = [title.bidangKeahlianId, title.bidangKeahlian2Id].filter((id): id is bigint => id !== null);
  if (Array.isArray(title.matriksPenelitian)) for (const row of title.matriksPenelitian) {
    for (const key of ["bidang_keahlian_id", "bidang_keahlian_2_id"]) {
      const value = row?.[key];
      if (value && /^\d+$/.test(String(value))) fields.push(BigInt(value));
    }
  }
  const rows = await Promise.all(options.rawLecturers.map(async (lecturer) => ({
    id: lecturer.penggunaId.toString(), nama: lecturer.pengguna.nama,
    score: recommendationScore(title.judul, [...new Set(fields)], lecturer.keahlian),
    remaining: Math.max(0, lecturer.kuotaBimbingan - await supervisorLoad(database(), lecturer.penggunaId, except)),
    expertise: lecturer.keahlian.map((item) => item.bidang.namaBidang).join(", "),
  })));
  return rows.sort((a, b) => b.score - a.score || b.remaining - a.remaining);
}

export function routeId(value: string) {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) notFound();
  return BigInt(value);
}

export function timestamp(value: Date | null) {
  return value ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", dateStyle: "medium", timeStyle: "short" }).format(value) : "—";
}

export function initialMatrix(value: unknown) {
  const first = Array.isArray(value) ? value[0] : {};
  return Object.fromEntries(Object.entries(first ?? {}).map(([key, item]) => [key, item == null ? "" : String(item)]));
}

export function storedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && /^\d+$/.test(item)
    || typeof item === "number" && Number.isSafeInteger(item) && item > 0).map(String);
}
