import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthenticatedSession } from "@/lib/auth/session";
import { accountTransaction, checkedActor, ensure } from "@/lib/accounts/store";
import { idSchema } from "@/lib/accounts/validation";
import { activeGuidanceWhere } from "@/lib/academic/store";
import { canGovern } from "./policy";
import { academicStage, type Stage } from "./metrics";

const resultSelect = { hasil: true, statusRevisi: true, statusPersetujuan: true, tenggatRevisi: true } satisfies Prisma.BeritaAcaraSelect;
// No names, text, file paths, snapshots, hashes, tokens or scores in the student query.
export const monitoringStudentSelect = {
  mahasiswa: { select: { programStudiId: true } },
  submissions: { where: { deletedAt: null, isDiarsipkan: false, statusDraft: "diajukan", status: { not: "dibatalkan" } }, orderBy: { id: "desc" }, take: 1,
    select: { status: true, siklusKe: true,
      bimbingan: { select: { siklusKe: true, idDosenPembimbing: true, idDosenPembimbing2: true } },
      sempro: { select: { siklusKe: true, statusDraft: true, jadwal: { select: { beritaAcara: { select: resultSelect } } } } },
      sidangList: { where: { statusDraft: "diajukan" }, orderBy: { id: "desc" }, select: { siklusKe: true, statusDraft: true,
        jadwalList: { orderBy: { id: "desc" }, take: 1, select: { beritaAcaraList: { orderBy: { id: "desc" }, take: 1, select: resultSelect } } } } },
    } },
} satisfies Prisma.PenggunaSelect;

export async function facultyMonitoring(session: AuthenticatedSession, input: unknown = {}, now = new Date()) {
  const filters = z.object({ fakultasId: idSchema.optional(), programStudiId: idSchema.optional() }).parse(input);
  return accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session);
    const live = await tx.authSession.findUniqueOrThrow({ where: { tokenHash: session.tokenHash } });
    ensure(["superadmin", "dekan"].includes(actor.role), "Monitoring hanya untuk Dekan dan superadmin.");
    const admin = actor.role === "superadmin";
    const empty = { faculties: [] as { id: bigint; nama: string }[], programs: [] as { id: bigint; nama: string; jenjang: string; aktif: boolean }[], facultyId: null as bigint | null, programId: filters.programStudiId ?? null, rows: [] as { id: bigint; nama: string; jenjang: string; aktif: boolean; students: number; stages: Record<Stage, number>; late: number; lecturers: { id: bigint; nama: string; assignments: number; quota: number }[] }[], unassigned: false };
    if (!canGovern(actor, live.activeRole)) return { ...empty, unassigned: true };
    const facultyId = admin ? filters.fakultasId : actor.fakultasId!;
    ensure(admin || !filters.fakultasId || filters.fakultasId === facultyId, "Filter fakultas di luar kewenangan Anda.");
    const facultyRows = await tx.fakultas.findMany({ where: admin ? {} : { id: facultyId }, select: { id: true, nama: true }, orderBy: { nama: "asc" } });
    const faculties = facultyRows.map((f) => ({ id: f.id, nama: f.nama }));
    if (!facultyId) { ensure(!filters.programStudiId, "Pilih fakultas terlebih dahulu."); return { ...empty, faculties }; }
    ensure(faculties.some((f) => f.id === facultyId), "Fakultas tidak ditemukan.");
    const programRows = await tx.programStudi.findMany({ where: { fakultasId: facultyId }, select: { id: true, nama: true, jenjang: true, aktif: true }, orderBy: { nama: "asc" } });
    const programs = programRows.map((p) => ({ id: p.id, nama: p.nama, jenjang: p.jenjang, aktif: p.aktif }));
    ensure(!filters.programStudiId || programs.some((p) => p.id === filters.programStudiId), "Filter prodi di luar fakultas yang dipilih.");
    const selected = programs.filter((p) => !filters.programStudiId || p.id === filters.programStudiId), ids = selected.map((p) => p.id);
    if (!ids.length) return { ...empty, faculties, facultyId, programs };
    const [students, lecturers, assignments] = await Promise.all([
      tx.pengguna.findMany({ where: { role: "mahasiswa", statusAkun: "aktif", deletedAt: null, mahasiswa: { programStudiId: { in: ids } } }, select: monitoringStudentSelect }),
      tx.dosen.findMany({ where: { programStudiId: { in: ids }, pengguna: { role: { in: ["dosen", "kaprodi", "sekpro"] }, statusAkun: "aktif", deletedAt: null } }, select: { penggunaId: true, programStudiId: true, kuotaBimbingan: true, pengguna: { select: { nama: true } } }, orderBy: { penggunaId: "asc" } }),
      tx.bimbingan.findMany({ where: { AND: [activeGuidanceWhere, { pengajuan: { mahasiswa: { mahasiswa: { programStudiId: { in: ids } } } } }] }, select: { idDosenPembimbing: true, idDosenPembimbing2: true } }),
    ]);
    const loads = new Map<bigint, number>();
    for (const b of assignments) for (const id of new Set([b.idDosenPembimbing, b.idDosenPembimbing2])) if (id) loads.set(id, (loads.get(id) ?? 0) + 1);
    const rows = selected.map((p) => {
      const group = students.filter((u) => u.mahasiswa?.programStudiId === p.id);
      const stages: Record<Stage, number> = { belum: 0, judul: 0, bimbingan: 0, sempro: 0, sidang: 0, selesai: 0 };
      let late = 0;
      for (const student of group) { const metric = academicStage(student.submissions[0], now); stages[metric.stage]++; late += metric.late; }
      return { id: p.id, nama: p.nama, jenjang: p.jenjang, aktif: p.aktif, students: group.length, stages, late,
        lecturers: lecturers.filter((d) => d.programStudiId === p.id).map((d) => ({ id: d.penggunaId, nama: d.pengguna.nama, quota: d.kuotaBimbingan, assignments: loads.get(d.penggunaId) ?? 0 })) };
    });
    return { ...empty, faculties, facultyId, programs, rows };
  });
}
