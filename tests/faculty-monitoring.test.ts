import assert from "node:assert/strict";
import test, { mock } from "node:test";
import type { PrismaClient } from "../src/generated/prisma/client";
import { academicStage, type TitleMetric, type ResultMetric } from "../src/lib/organization/metrics";
import { fixture, session, syntheticDatabase } from "./helpers/accounts-db";
import { affiliation } from "./helpers/organization";

const now = new Date("2026-11-08T16:10:00Z"); // November 9 in WITA
const result = (patch: Partial<ResultMetric> = {}): ResultMetric => ({ hasil: "lulus_revisi", statusRevisi: "menunggu_revisi", statusPersetujuan: "disetujui_kaprodi", tenggatRevisi: new Date("2026-11-08"), ...patch });
const title = (patch: Partial<TitleMetric> = {}): TitleMetric => ({ status: "disetujui", siklusKe: 2, bimbingan: { siklusKe: 2, idDosenPembimbing: 6n, idDosenPembimbing2: null }, sempro: null, sidangList: [], ...patch });

test("tahapan eksklusif, siklus, hasil resmi dan tenggat WITA monitoring", () => {
  assert.deepEqual(academicStage(undefined, now), { stage: "belum", late: 0 });
  assert.equal(academicStage(title({ bimbingan: null })).stage, "judul");
  assert.equal(academicStage(title()).stage, "bimbingan");
  const sempro = { siklusKe: 2, statusDraft: "diajukan", jadwal: { beritaAcara: result() } };
  assert.deepEqual(academicStage(title({ sempro }), now), { stage: "sempro", late: 1 });
  assert.deepEqual(academicStage(title({ sempro: { ...sempro, siklusKe: 1 } }), now), { stage: "bimbingan", late: 0 });
  assert.equal(academicStage(title({ sempro: { ...sempro, statusDraft: "draft" } }), now).late, 0);
  assert.equal(academicStage(title({ sempro: { ...sempro, jadwal: { beritaAcara: result({ statusRevisi: "revisi_selesai" }) } } }), now).stage, "bimbingan");
  const sidang = (r: ResultMetric, siklusKe = 2) => ({ siklusKe, statusDraft: "diajukan", jadwalList: [{ beritaAcaraList: [r] }] });
  assert.deepEqual(academicStage(title({ sidangList: [sidang(result())] }), now), { stage: "sidang", late: 1 });
  assert.deepEqual(academicStage(title({ sidangList: [sidang(result({ statusRevisi: "revisi_selesai" }))] }), now), { stage: "selesai", late: 0 });
  assert.equal(academicStage(title({ sidangList: [sidang(result({ hasil: "lulus" }))] }), now).stage, "selesai");
  assert.equal(academicStage(title({ sidangList: [sidang(result({ hasil: "tidak_lulus" }))] }), now).stage, "sidang");
  assert.equal(academicStage(title({ sidangList: [sidang(result(), 1)] }), now).stage, "bimbingan");
  assert.equal(academicStage(title({ sidangList: [sidang(result({ tenggatRevisi: new Date("2026-11-09") }))] }), now).late, 0);
  assert.deepEqual(academicStage(title({ sempro, sidangList: [sidang(result())] }), now), { stage: "sidang", late: 2 });
});

test("monitoring membaca ulang sesi dan membatasi query serta hasil pada fakultas/prodi", async (t) => {
  const navigation = mock.module("next/navigation", { exports: { redirect: () => { throw Error("redirect"); }, notFound: () => { throw Error("notFound"); } } });
  t.after(() => navigation.restore());
  const { facultyMonitoring } = await import("../src/lib/organization/monitoring");
  const globalDb = globalThis as unknown as { siasDatabase?: PrismaClient }, previous = globalDb.siasDatabase;
  t.after(() => { globalDb.siasDatabase = previous; });
  function setup() {
    const admin = fixture(1n, "superadmin"), dean = fixture(2n, "dosen"), a = fixture(3n), b = fixture(4n), unmapped = fixture(5n), lecturer = fixture(6n, "dosen");
    dean.role = "dekan"; dean.fakultasId = 1n; dean.fakultas = { id: 1n, nama: "Fakultas A", aktif: true };
    b.mahasiswa = { ...b.mahasiswa!, ...affiliation(2n, 2n) }; unmapped.mahasiswa!.programStudiId = null;
    const sessions = [admin, dean, a].map((u) => session(u));
    const memory = syntheticDatabase([admin, dean, a, b, unmapped, lecturer], sessions); globalDb.siasDatabase = memory.db;
    memory.tables.pengguna.find((u) => u.id === 3n)!.submissions = [title()];
    memory.tables.pengguna.find((u) => u.id === 4n)!.submissions = [title({ sidangList: [{ siklusKe: 2, statusDraft: "diajukan", jadwalList: [{ beritaAcaraList: [result({ hasil: "lulus" })] }] }] })];
    memory.tables.pengguna.find((u) => u.id === 5n)!.submissions = [];
    memory.tables.bimbingan.push({ idDosenPembimbing: 6n, idDosenPembimbing2: null, pengajuan: { deletedAt: null, isDiarsipkan: false, status: "disetujui", mahasiswa: { statusAkun: "aktif", deletedAt: null, role: "mahasiswa", mahasiswa: { programStudiId: 1n } } } });
    return { ...memory, sessions };
  }
  await t.test("Dekan A melihat mahasiswa A, nama sama pada B dan profil null tidak dihitung", async () => {
    const { sessions } = setup();
    const data = await facultyMonitoring(sessions[1], {}, now);
    assert.deepEqual(data.rows.map((p) => p.id), [1n, 3n]);
    assert.equal(data.rows.reduce((n, p) => n + p.students, 0), 1);
    assert.equal(data.rows[0].stages.bimbingan, 1);
    assert.equal(data.rows[0].stages.selesai, 0);
    assert.deepEqual(data.rows[0].lecturers.map((d) => [d.id, d.assignments]), [[6n, 1]]);
    const serialized = JSON.stringify(data, (_k, v) => typeof v === "bigint" ? String(v) : v);
    for (const secret of ["email", "password", "fileProposal", "tokenHash", "Pengguna 4", "Pengguna 5"]) assert.ok(!serialized.includes(secret));
    assert.ok(!data.faculties.some((f) => f.id === 2n));
  });
  await t.test("filter fakultas/prodi palsu ditolak server, ID bigint tidak dibulatkan", async () => {
    const { sessions } = setup();
    await assert.rejects(facultyMonitoring(sessions[1], { fakultasId: "2" }), /di luar kewenangan/);
    await assert.rejects(facultyMonitoring(sessions[1], { programStudiId: "2" }), /di luar fakultas/);
    await assert.rejects(facultyMonitoring(sessions[1], { programStudiId: "9223372036854775807" }), /di luar fakultas/);
    await assert.rejects(facultyMonitoring(sessions[1], { programStudiId: "9223372036854775808" }));
    const data = await facultyMonitoring(sessions[1], { programStudiId: "3" });
    assert.equal(data.rows.length, 1); assert.equal(data.rows[0].students, 0);
  });
  await t.test("superadmin memilih fakultas, role lain dan sesi usang ditolak", async () => {
    const { sessions, tables } = setup();
    assert.equal((await facultyMonitoring(sessions[0])).rows.length, 0);
    const b = await facultyMonitoring(sessions[0], { fakultasId: "2" });
    assert.equal(b.rows.length, 1); assert.equal(b.rows[0].stages.selesai, 1);
    await assert.rejects(facultyMonitoring(sessions[2]), /hanya untuk/);
    tables.pengguna.find((u) => u.id === 2n)!.authVersion = 1;
    await assert.rejects(facultyMonitoring(sessions[1]), /Sesi telah berubah/);
  });
  await t.test("penempatan kosong dan fakultas nonaktif tidak menghasilkan hitungan", async () => {
    const { sessions, tables } = setup();
    tables.fakultas[0].aktif = false;
    assert.equal((await facultyMonitoring(sessions[1])).unassigned, true);
    tables.fakultas[0].aktif = true; tables.pengguna.find((u) => u.id === 2n)!.fakultasId = null;
    assert.equal((await facultyMonitoring(sessions[1])).rows.length, 0);
  });
});
