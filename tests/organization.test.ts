import assert from "node:assert/strict";
import test, { mock } from "node:test";
import type { PrismaClient } from "../src/generated/prisma/client";
import { availableRoles, canAccessArea, landingPath } from "../src/lib/auth/policy";
import { canManage, canDecideAccount, inAccountScope } from "../src/lib/accounts/policy";
import { canGovern, activeProgramId } from "../src/lib/organization/policy";
import { affiliation } from "./helpers/organization";
import { fixture, session, syntheticDatabase } from "./helpers/accounts-db";

const reason = "Penataan organisasi berdasarkan keputusan fakultas";

test("otorisasi master memakai ID, menolak null dan tidak mewariskan dosen historis", () => {
  const dean = { ...fixture(10n, "dosen", { isKaprodi: true, isSekpro: true }), role: "dekan" as const, fakultasId: 1n, fakultas: { id: 1n, nama: "Fakultas A", aktif: true } };
  assert.deepEqual(availableRoles(dean), ["dekan"]);
  assert.equal(landingPath(dean, "dekan"), "/dashboard/dekan");
  assert.equal(canAccessArea(dean, "dekan", "dosen"), false);
  for (const permission of ["manage", "settings", "superadmin"] as const) assert.equal(canManage(dean, "dekan", permission), false);
  assert.equal(canGovern(dean, "dekan", 1n), true);
  assert.equal(canGovern(dean, "dekan", 2n), false);
  assert.equal(canGovern(dean, "dosen", 1n), false);
  assert.equal(canGovern({ ...dean, fakultasId: null }, "dekan"), false);
  assert.equal(canGovern({ ...dean, fakultas: { aktif: false } }, "dekan"), false);
  assert.equal(canGovern(fixture(1n, "admin_keuangan"), "admin_keuangan", 1n), false);
  const a = fixture(2n, "dosen", { isKaprodi: true, isSekpro: false });
  const b = fixture(3n);
  b.mahasiswa = { ...b.mahasiswa!, ...affiliation(2n, 2n) };
  assert.equal(inAccountScope(a, b), false); // identical legacy names, different faculties
  assert.equal(canDecideAccount(a, b), false);
  b.mahasiswa!.programStudiId = null;
  assert.equal(inAccountScope(a, b), false);
  assert.equal(activeProgramId(b.mahasiswa), null);
});

test("master, penetapan Dekan dan pemetaan legacy dengan database sintetis", async (t) => {
  const navigation = mock.module("next/navigation", { exports: { redirect: () => { throw Error("redirect"); }, notFound: () => { throw Error("notFound"); } } });
  t.after(() => navigation.restore());
  const service = await import("../src/lib/organization/store");
  const globalDb = globalThis as unknown as { siasDatabase?: PrismaClient };
  const previous = globalDb.siasDatabase;
  t.after(() => { globalDb.siasDatabase = previous; });
  const setup = () => {
    const admin = fixture(1n, "superadmin"), lecturer = fixture(2n, "dosen"), student = fixture(3n);
    const sessions = [session(admin), session(lecturer), session(student)];
    const memory = syntheticDatabase([admin, lecturer, student], sessions);
    globalDb.siasDatabase = memory.db;
    return { admin, lecturer, student, sessions, ...memory };
  };
  await t.test("superadmin menyiapkan fakultas/prodi dan Dekan dengan audit serta pencabutan sesi", async () => {
    const { sessions, tables } = setup();
    await service.saveFaculty(sessions[0], undefined, { kode: "FA", nama: "Fakultas Baru", aktif: true }, reason);
    await service.saveProgram(sessions[0], undefined, { kode: "SI", nama: "Sistem Informasi", jenjang: "S1", fakultasId: "1", aktif: true }, reason);
    await service.assignDean(sessions[0], 1n, 2n, reason);
    assert.equal(tables.pengguna.find((u) => u.id === 2n)!.role, "dekan");
    assert.equal(tables.pengguna.find((u) => u.id === 2n)!.fakultasId, 1n);
    assert.ok(!tables.authSession.some((s) => s.penggunaId === 2n));
    assert.ok(tables.logAktivitas.some((a) => a.aksi === "penetapan_dekan"));
    await assert.rejects(service.saveProgram(sessions[1], undefined, { kode: "PI", nama: "Prodi Impostor", jenjang: "S1", fakultasId: "1", aktif: true }, reason), /Sesi telah berubah/);
  });
  await t.test("pemetaan tidak menebak nama dan mencabut flag pimpinan legacy", async () => {
    const { sessions, tables } = setup();
    const profile = tables.dosen.find((u) => u.penggunaId === 2n)!;
    profile.programStudiId = null; profile.isKaprodi = true;
    await service.linkProfile(sessions[0], 2n, "dosen", 2n, reason);
    assert.equal(profile.programStudiId, 2n);
    assert.equal(profile.isKaprodi, false);
    assert.ok(!tables.authSession.some((s) => s.penggunaId === 2n));
    await assert.rejects(service.linkProfile(sessions[0], 3n, "dosen", 1n, reason), /Profil historis/);
    await assert.rejects(service.linkProfile(sessions[0], 3n, "mahasiswa", 999n, reason), /tidak aktif\/tidak ditemukan/);
  });
  await t.test("Dekan A hanya mengubah prodi A, fakultas dan penetapan Dekan khusus superadmin", async () => {
    const { lecturer, sessions, tables } = setup();
    lecturer.role = "dekan"; lecturer.fakultasId = 1n; lecturer.fakultas = { id: 1n, nama: "Fakultas A", aktif: true };
    Object.assign(tables.pengguna.find((u) => u.id === 2n)!, lecturer);
    const live = session(lecturer); tables.authSession = [tables.authSession[0], live as unknown as Record<string, unknown>, tables.authSession[2]];
    const data = { kode: "PA", nama: "Prodi Fakultas A", jenjang: "S1", fakultasId: "1", aktif: true };
    await service.saveProgram(live, undefined, data, reason);
    await assert.rejects(service.saveProgram(live, 2n, { ...data, fakultasId: "2" }, reason), /tidak berwenang/);
    await assert.rejects(service.saveProgram(live, 1n, { ...data, fakultasId: "2" }, reason), /tidak dapat dipindahkan/);
    await assert.rejects(service.saveFaculty(live, undefined, data, reason), /kewenangan/);
    await assert.rejects(service.assignDean(live, 1n, 3n, reason), /kewenangan/);
    await assert.rejects(service.linkProfile(live, 3n, "mahasiswa", 1n, reason), /kewenangan/);
    await assert.rejects(service.saveProgram(sessions[2], undefined, data, reason), /tidak berwenang/);
  });
});
