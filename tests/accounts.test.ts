import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createRequire } from "node:module";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { Account } from "../src/lib/accounts/store";
import { academicPeriod, canDecideAccount, canDecideReset, canManage, restoredIdentity, semesterFromNim } from "../src/lib/accounts/policy";
import { idSchema, newPasswordSchema, settingDefinitions, validateSettings } from "../src/lib/accounts/validation";
import { tokenHash } from "../src/lib/auth/tokens";

import { fixture, session, syntheticDatabase } from "./helpers/accounts-db";
const serialized = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);

test("aturan akun dan identitas mengikuti source terbaru", () => {
  const kaprodi = fixture(1n, "dosen", { isKaprodi: true, isSekpro: false });
  const sekpro = fixture(2n, "dosen", { isKaprodi: false, isSekpro: true });
  const admin = fixture(3n, "superadmin");
  assert.ok(canManage(kaprodi, "kaprodi"));
  assert.ok(!canManage(kaprodi, "dosen"));
  assert.ok(!canManage(sekpro, "sekpro", "settings"));
  assert.ok(canManage(admin, "superadmin", "superadmin"));
  assert.ok(!canDecideAccount(sekpro, kaprodi));
  assert.ok(!canDecideAccount(sekpro, fixture(4n, "sekpro")));
  assert.ok(!canDecideReset(kaprodi, kaprodi));
  assert.ok(canDecideReset(sekpro, kaprodi));
  assert.equal(restoredIdentity("a@b.id.deleted.123456", null, "email"), "a@b.id");
  assert.equal(restoredIdentity("22001_DEL_123456", null, "identifier"), "22001");
  assert.equal(restoredIdentity("legacy", "22002", "identifier"), "22002");
  assert.equal(restoredIdentity("22001_DEL_text", null, "identifier"), "22001_DEL_text");
  assert.ok(!idSchema.safeParse("9223372036854775808").success);
  assert.ok(!newPasswordSchema.safeParse("😀".repeat(19)).success);
});

test("periode Asia/Makassar, NIM panjang/pendek dan batas semester", () => {
  assert.deepEqual(academicPeriod({}, new Date("2026-08-31T16:00:00Z")), { jenis: "ganjil", tahunMulai: 2026 });
  assert.deepEqual(academicPeriod({}, new Date("2026-02-28T16:00:00Z")), { jenis: "genap", tahunMulai: 2025 });
  const settings = { periode_akademik_mode: "manual", periode_akademik_jenis: "ganjil", periode_akademik_tahun_mulai: "2026" };
  assert.equal(semesterFromNim("2200111", settings), 9);
  assert.equal(semesterFromNim("2022001111", settings), 9);
  assert.equal(semesterFromNim("2600111", settings), 1);
  const defaults = Object.fromEntries(Object.entries(settingDefinitions).map(([key, value]) => [key, value.default]));
  assert.equal(validateSettings(defaults).kuota_bimbingan_default, "10");
  assert.throws(() => validateSettings({ ...defaults, kuota_bimbingan_default: "51" }));
  assert.throws(() => validateSettings({ ...defaults, periode_akademik_selesai: "2026-01-01" }));
});

test("restore mempertahankan arsip persis dan hanya memangkas suffix terminal pada nilai aktif legacy", () => {
  for (const kind of ["email", "identifier"] as const) {
    const suffix = kind === "email" ? ".deleted.1770000000" : "_DEL_1770000000";
    const original = kind === "email" ? "person@example.invalid" : "991123";
    assert.equal(restoredIdentity(null, original + suffix, kind), original + suffix);
    assert.equal(restoredIdentity(original + suffix, original, kind), original);
    assert.equal(restoredIdentity(original + suffix, null, kind), original);
    assert.equal(restoredIdentity(original + suffix + "text", null, kind), original + suffix + "text");
    assert.equal(restoredIdentity(original + suffix + ".other", null, kind), original + suffix + ".other");
    assert.equal(restoredIdentity(null, null, kind), null);
  }
  assert.equal(restoredIdentity("person.deleted.123@example.invalid", null, "email"), "person.deleted.123@example.invalid");
});

test("layanan akun memakai transaksi, database dan sesi sintetis", async (t) => {
  const navigation = mock.module("next/navigation", { exports: { redirect: () => { throw Error("Unexpected redirect"); }, notFound: () => { throw Error("Unexpected notFound"); } } });
  t.after(() => navigation.restore());
  const { decideAccounts, changeAccountStatus, assignRole } = await import("../src/lib/accounts/management");
  const { decidePasswordReset, completePasswordReset, requestPasswordReset } = await import("../src/lib/accounts/reset");
  const { submitProfileRequest, decideProfileRequest, editAccountProfile } = await import("../src/lib/accounts/profile");
  const { registerAccount } = await import("../src/lib/accounts/registration");
  const { saveSettings } = await import("../src/lib/accounts/settings");
  const { accountTransaction } = await import("../src/lib/accounts/store");
  const globalDb = globalThis as unknown as { siasDatabase?: PrismaClient };
  const previous = globalDb.siasDatabase;
  t.after(() => { globalDb.siasDatabase = previous; });
  const admin = fixture(1n, "superadmin");
  const kaprodi = fixture(2n, "dosen", { isKaprodi: true, isSekpro: false });
  const sekpro = fixture(3n, "dosen", { isKaprodi: false, isSekpro: true });
  const student = fixture(4n);
  const lecturer = fixture(5n, "dosen");
  const reason = "Identitas telah diverifikasi";
  let harness: ReturnType<typeof syntheticDatabase>;
  function setup(extra: Account[] = []) {
    harness = syntheticDatabase([admin, kaprodi, sekpro, student, lecturer, ...extra], [admin, kaprodi, sekpro, student, lecturer].map((user) => session(user)));
    globalDb.siasDatabase = harness.db;
    return harness;
  }

  await t.test("mahasiswa, mode dosen, sesi dicabut dan wajib password ditolak di server", async () => {
    setup();
    await assert.rejects(decideAccounts(session(student), [5n], true, ""), /kewenangan/);
    harness.tables.authSession.find((row) => row.penggunaId === 2n)!.activeRole = "dosen";
    await assert.rejects(decideAccounts(session(kaprodi, "dosen"), [5n], true, ""), /kewenangan/);
    harness.tables.authSession = harness.tables.authSession.filter((row) => row.penggunaId !== 1n);
    await assert.rejects(decideAccounts(session(admin), [5n], true, ""), /Sesi/);
    setup();
    harness.tables.pengguna[0].wajibGantiPassword = true;
    await assert.rejects(decideAccounts(session(admin), [5n], true, ""), /Sesi/);
  });

  await t.test("approval bersamaan hanya satu sukses, satu audit dan sesi target dicabut", async () => {
    setup();
    harness.tables.pengguna.find((row) => row.id === 4n)!.statusAkun = "menunggu_persetujuan";
    const results = await Promise.allSettled([decideAccounts(session(admin), [4n], true, ""), decideAccounts(session(kaprodi, "kaprodi"), [4n], true, "")]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(harness.tables.logAktivitas.filter((row) => row.aksi === "approve_akun").length, 1);
    assert.equal(harness.tables.pengguna.find((row) => row.id === 4n)?.authVersion, 1);
    assert.ok(!harness.tables.authSession.some((row) => row.penggunaId === 4n));
    assert.ok(harness.queries.some((query) => query.includes("pg_advisory_xact_lock")));
    assert.ok(harness.queries.some((query) => query.includes("FOR UPDATE")));
  });

  await t.test("approval massal rollback ketika satu target terlarang", async () => {
    setup();
    harness.tables.pengguna.find((row) => row.id === 4n)!.statusAkun = "menunggu_persetujuan";
    harness.tables.pengguna.find((row) => row.id === 2n)!.statusAkun = "menunggu_persetujuan";
    await assert.rejects(decideAccounts(session(sekpro, "sekpro"), [4n, 2n], true, ""));
    assert.equal(harness.tables.pengguna.find((row) => row.id === 4n)?.statusAkun, "menunggu_persetujuan");
    assert.equal(harness.tables.logAktivitas.length, 0);
  });

  await t.test("soft delete mengarsipkan identitas dan mempertahankan status serta nullable HP", async () => {
    setup();
    await changeAccountStatus(session(admin), 4n, "delete", reason, "KONFIRMASI");
    const row = harness.tables.pengguna.find((value) => value.id === 4n)!;
    assert.equal(row.email, null);
    assert.equal(row.emailArsip, student.email);
    assert.equal(row.statusAkun, "aktif");
    assert.ok(row.deletedAt instanceof Date);
    assert.equal(harness.tables.mahasiswa[0].nim, null);
    assert.equal(harness.tables.mahasiswa[0].noHp, null);
    assert.ok(!harness.tables.authSession.some((value) => value.penggunaId === 4n));
  });

  await t.test("restore arsip dan suffix historis mencatat provenance", async () => {
    const archived = fixture(6n);
    archived.deletedAt = new Date(); archived.emailArsip = archived.email; archived.email = null;
    archived.mahasiswa!.nimArsip = archived.mahasiswa!.nim; archived.mahasiswa!.nim = null;
    const suffix = fixture(7n, "dosen");
    suffix.deletedAt = new Date(); suffix.email += ".deleted.1770000000"; suffix.dosen!.nidn += "_DEL_1770000000";
    setup([archived, suffix]);
    await changeAccountStatus(session(admin), 6n, "restore", reason, "KONFIRMASI");
    await changeAccountStatus(session(admin), 7n, "restore", reason, "KONFIRMASI");
    assert.equal(harness.tables.pengguna.find((row) => row.id === 6n)?.email, "user6@example.invalid");
    assert.equal(harness.tables.pengguna.find((row) => row.id === 7n)?.email, "user7@example.invalid");
    assert.equal(harness.tables.dosen.find((row) => row.penggunaId === 7n)?.nidn, "99117");
    assert.match(JSON.stringify(harness.tables.logAktivitas[1].detail), /deleted\.1770000000/);
    assert.match(JSON.stringify(harness.tables.logAktivitas[1].detail), /archive-verbatim-or-terminal-active-suffix-v2/);
  });

  await t.test("identitas dipakai ulang memblokir restore tanpa perubahan parsial", async () => {
    const archived = fixture(6n);
    archived.deletedAt = new Date(); archived.emailArsip = student.email; archived.email = null;
    setup([archived]);
    await assert.rejects(changeAccountStatus(session(admin), 6n, "restore", reason, "KONFIRMASI"), /Email sudah/);
    assert.ok(harness.tables.pengguna.find((row) => row.id === 6n)?.deletedAt);
    assert.equal(harness.tables.logAktivitas.length, 0);
    archived.emailArsip = "user6@example.invalid"; archived.mahasiswa!.nimArsip = student.mahasiswa!.nim; archived.mahasiswa!.nim = null;
    setup([archived]);
    await assert.rejects(changeAccountStatus(session(admin), 6n, "restore", reason, "KONFIRMASI"), /NIM sudah/);
    assert.equal(harness.tables.pengguna.find((row) => row.id === 6n)?.email, null);
  });

  await t.test("dua restore bersamaan dengan arsip identik hanya mengaktifkan satu", async () => {
    const first = fixture(6n); first.deletedAt = new Date(); first.emailArsip = "same@example.invalid"; first.email = null;
    const second = fixture(7n); second.deletedAt = new Date(); second.emailArsip = first.emailArsip; second.email = null;
    setup([first, second]);
    const results = await Promise.allSettled([changeAccountStatus(session(admin), 6n, "restore", reason, "KONFIRMASI"), changeAccountStatus(session(admin), 7n, "restore", reason, "KONFIRMASI")]);
    assert.equal(results.filter((value) => value.status === "fulfilled").length, 1);
    assert.equal(harness.tables.pengguna.filter((row) => row.email === "same@example.invalid").length, 1);
  });

  await t.test("cleanup keuangan tanpa arsip dapat dipulihkan oleh superadmin, role assignment keuangan ditolak", async () => {
    const finance = fixture(6n, "admin_keuangan"); finance.statusAkun = "nonaktif"; finance.deletedAt = new Date();
    setup([finance]);
    await changeAccountStatus(session(admin), 6n, "restore", reason, "KONFIRMASI");
    const restored = harness.tables.pengguna.find((row) => row.id === 6n)!;
    assert.equal(restored.statusAkun, "aktif"); assert.equal(restored.role, "admin_keuangan"); assert.equal(restored.email, finance.email);
    await assert.rejects(assignRole(session(admin), 4n, { role: "admin_keuangan" }, reason, "UBAH PERAN"));
  });

  await t.test("penetapan Kaprodi menurunkan pejabat lama dan mencabut seluruh sesi terdampak", async () => {
    setup();
    await assignRole(session(admin), 5n, { role: "kaprodi" }, reason, "UBAH PERAN");
    assert.equal(harness.tables.dosen.find((row) => row.penggunaId === 2n)?.isKaprodi, false);
    assert.equal(harness.tables.dosen.find((row) => row.penggunaId === 5n)?.isKaprodi, true);
    assert.ok(!harness.tables.authSession.some((row) => row.penggunaId === 2n || row.penggunaId === 5n));
    assert.equal(harness.tables.logSuperAdmin.length, 2);
  });

  await t.test("permohonan reset memakai identitas aktif dan menghindari duplikasi", async () => {
    setup();
    await Promise.all([requestPasswordReset(student.email!), requestPasswordReset(student.mahasiswa!.nim!)]);
    assert.equal(harness.tables.passwordResetRequest.length, 1);
    await requestPasswordReset(admin.email!);
    await requestPasswordReset("missing@example.invalid");
    assert.equal(harness.tables.passwordResetRequest.length, 1);
    assert.equal(harness.tables.passwordResetRequest[0].tokenHash, null);
  });

  await t.test("identitas dan token reset tidak cocok ditolak tanpa advisory lock atau perubahan data", async () => {
    setup();
    harness.tables.pengguna.find((row) => row.id === 5n)!.statusAkun = "nonaktif";
    for (const identity of ["missing@example.invalid", admin.email!, lecturer.email!]) {
      await requestPasswordReset(identity);
    }
    const input = { token: "b".repeat(64), password: "passwordBaru123", confirmation: "passwordBaru123" };
    await assert.rejects(completePasswordReset(input), /Token tidak valid/);
    harness.tables.passwordResetRequest.push({ id: 91n, penggunaId: 4n, tokenHash: tokenHash(input.token), status: "disetujui", expiresAt: new Date(0) });
    await assert.rejects(completePasswordReset(input), /kedaluwarsa/);
    assert.equal(harness.queries.length, 0);
    assert.equal(harness.tables.logAktivitas.length, 0);
    assert.equal(harness.tables.passwordResetRequest.length, 1);
  });

  await t.test("reset memeriksa ulang pemilik identitas setelah menunggu mutasi akun", async () => {
    setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const mutation = accountTransaction(async () => {
      started();
      await gate;
      // Simulate an identity transfer committing while the reset waits for the account lock.
      harness.tables.pengguna.find((row) => row.id === 4n)!.email = "changed@example.invalid";
      harness.tables.pengguna.find((row) => row.id === 5n)!.email = student.email;
    });
    await ready;
    const reset = requestPasswordReset(student.email!);
    try {
      // Allow the preflight read to finish before the held mutation commits.
      await new Promise<void>((resolve) => setImmediate(resolve));
    } finally { release(); }
    await Promise.all([mutation, reset]);
    assert.equal(harness.tables.passwordResetRequest.length, 0);
    assert.equal(harness.tables.logAktivitas.length, 0);
  });

  await t.test("reset legacy plaintext dan versi autentikasi lama dapat mengajukan persetujuan baru", async () => {
    setup();
    harness.tables.passwordResetRequest.push({ id: 91n, penggunaId: 4n, status: "disetujui", token: "legacy-plaintext", tokenHash: null, authVersion: null, expiresAt: null });
    await requestPasswordReset(student.email!);
    assert.equal(harness.tables.passwordResetRequest[0].status, "kedaluwarsa");
    assert.equal(harness.tables.passwordResetRequest[0].token, null);
    assert.equal(harness.tables.passwordResetRequest[1].status, "menunggu");
    setup();
    harness.tables.passwordResetRequest.push({ id: 92n, penggunaId: 4n, status: "disetujui", tokenHash: "stale", authVersion: 0, expiresAt: new Date(Date.now() + 60000) });
    harness.tables.pengguna.find((row) => row.id === 4n)!.authVersion = 1;
    await requestPasswordReset(student.email!);
    assert.equal(harness.tables.passwordResetRequest[0].status, "kedaluwarsa");
    assert.equal(harness.tables.passwordResetRequest[1].status, "menunggu");
  });

  await t.test("token reset hanya dari approver, disimpan hash dan dipakai sekali", async () => {
    setup();
    await requestPasswordReset(student.email!);
    const id = harness.tables.passwordResetRequest[0].id as bigint;
    const token = await decidePasswordReset(session(admin), id, true, "");
    assert.ok(token);
    assert.equal(harness.tables.passwordResetRequest[0].token, null);
    assert.equal(harness.tables.passwordResetRequest[0].tokenHash, tokenHash(token));
    assert.ok(!serialized(harness.tables.logAktivitas).includes(token));
    const data = { token, password: "passwordBaru123", confirmation: "passwordBaru123" };
    const results = await Promise.allSettled([completePasswordReset(data), completePasswordReset(data)]);
    assert.equal(results.filter((value) => value.status === "fulfilled").length, 1);
    assert.equal(harness.tables.passwordResetRequest[0].status, "selesai");
    assert.equal(harness.tables.passwordResetRequest[0].tokenHash, null);
    assert.ok(!harness.tables.authSession.some((row) => row.penggunaId === 4n));
  });

  await t.test("reset Kaprodi memerlukan Sekpro, token expired dan authVersion lama ditolak", async () => {
    setup();
    await requestPasswordReset(kaprodi.email!);
    const id = harness.tables.passwordResetRequest[0].id as bigint;
    await assert.rejects(decidePasswordReset(session(kaprodi, "kaprodi"), id, true, ""));
    const token = await decidePasswordReset(session(sekpro, "sekpro"), id, true, "");
    assert.ok(token);
    harness.tables.passwordResetRequest[0].expiresAt = new Date(0);
    await assert.rejects(completePasswordReset({ token, password: "passwordBaru123", confirmation: "passwordBaru123" }), /kedaluwarsa/);
    harness.tables.passwordResetRequest[0].expiresAt = new Date(Date.now() + 10000);
    harness.tables.pengguna.find((row) => row.id === 2n)!.authVersion = 1;
    await assert.rejects(completePasswordReset({ token, password: "passwordBaru123", confirmation: "passwordBaru123" }), /kedaluwarsa/);
  });

  await t.test("permohonan biodata menyimpan snapshot, pending tunggal, approval email mencabut sesi", async () => {
    setup();
    const results = await Promise.allSettled([submitProfileRequest(session(student), { email: "new@example.invalid" }, reason), submitProfileRequest(session(student), { nama: "Nama mahasiswa baru" }, reason)]);
    assert.equal(results.filter((value) => value.status === "fulfilled").length, 1);
    const request = harness.tables.biodataChangeRequest[0];
    assert.equal(request.emailLama, student.email);
    await decideProfileRequest(session(kaprodi, "kaprodi"), "biodata", request.id as bigint, true, "");
    assert.equal(harness.tables.pengguna.find((row) => row.id === 4n)?.email, "new@example.invalid");
    assert.ok(!harness.tables.authSession.some((row) => row.penggunaId === 4n));
    await assert.rejects(decideProfileRequest(session(admin), "biodata", request.id as bigint, true, ""), /sudah diproses/);
  });

  await t.test("konflik identitas saat approval dan snapshot stale membatalkan seluruh transaksi", async () => {
    setup();
    await submitProfileRequest(session(student), { email: "reserved@example.invalid" }, reason);
    harness.tables.pengguna.find((row) => row.id === 5n)!.email = "reserved@example.invalid";
    const id = harness.tables.biodataChangeRequest[0].id as bigint;
    await assert.rejects(decideProfileRequest(session(admin), "biodata", id, true, ""), /Email sudah/);
    assert.equal(harness.tables.biodataChangeRequest[0].status, "pending");
    assert.equal(harness.tables.pengguna.find((row) => row.id === 4n)?.email, student.email);
    harness.tables.pengguna.find((row) => row.id === 4n)!.email = "changed@example.invalid";
    await assert.rejects(decideProfileRequest(session(admin), "biodata", id, true, ""), /sejak pengajuan/);
  });

  await t.test("keahlian legacy tanpa flag tetap diterapkan dan ID bigint dipertahankan", async () => {
    setup();
    harness.tables.keahlianChangeRequest.push({ id: 91n, dosenId: 5n, status: "pending", nidnLama: lecturer.dosen!.nidn, nidnBaru: "991199", ubahNidn: false,
      keahlianLama: [], keahlianDiajukan: [1, "2"], ubahKeahlian: false });
    await decideProfileRequest(session(admin), "keahlian", 91n, true, "");
    assert.equal(harness.tables.dosen.find((row) => row.penggunaId === 5n)?.nidn, "991199");
    assert.deepEqual(harness.tables.dosenKeahlian.map((row) => row.bidangId), [1n, 2n]);
  });

  await t.test("edit langsung superadmin memeriksa role dan konflik identitas", async () => {
    setup();
    await assert.rejects(editAccountProfile(session(kaprodi, "kaprodi"), 4n, { nama: "Nama Baru" }, reason), /kewenangan/);
    await assert.rejects(editAccountProfile(session(admin), 4n, { nidn: "99221" }, reason), /profil mahasiswa/);
    await editAccountProfile(session(admin), 4n, { nama: "Nama Baru", noHp: "081234567890" }, reason);
    assert.equal(harness.tables.pengguna.find((row) => row.id === 4n)?.nama, "Nama Baru");
  });

  await t.test("registrasi dosen/keuangan dan pembuatan superadmin mematuhi flag dan password", async () => {
    setup();
    await registerAccount({ programStudiId: "1", role: "dosen", nama: "Dosen Baru", email: "newdosen@example.invalid", password: "password123", confirmation: "password123", nidn: "991188", noHp: "081234567890", bidang: ["1", "2"] });
    const user = harness.tables.pengguna.find((row) => row.email === "newdosen@example.invalid")!;
    assert.equal(user.statusAkun, "menunggu_persetujuan"); assert.equal(user.role, "dosen");
    assert.equal(harness.tables.dosen.find((row) => row.penggunaId === user.id)?.isSekpro, false);
    await registerAccount({ role: "admin_keuangan", nama: "Keuangan Baru", email: "finance@example.invalid", password: "password123", confirmation: "password123" });
    assert.equal(harness.tables.adminKeuangan.length, 1);
    await registerAccount({ programStudiId: "1", role: "dosen", nama: "Dosen Admin", email: "created@example.invalid", nidn: "991189", noHp: "081234567890", bidang: ["1", "2"] }, session(admin), "temporaryPassword123");
    const created = harness.tables.pengguna.find((row) => row.email === "created@example.invalid")!;
    assert.equal(created.statusAkun, "aktif"); assert.equal(created.wajibGantiPassword, true);
    assert.ok(!serialized(harness.tables.logAktivitas).includes("temporaryPassword123"));
    await assert.rejects(registerAccount({ role: "kaprodi", nama: "Forbidden", email: "forbidden@example.invalid", password: "password123", confirmation: "password123" }), /Peran/);
  });

  await t.test("registrasi mahasiswa memeriksa semester server, duplikasi dan penggunaan kembali arsip", async () => {
    const archived = fixture(6n);
    archived.deletedAt = new Date(); archived.emailArsip = "reused@example.invalid"; archived.email = null;
    archived.mahasiswa!.nimArsip = "22001222"; archived.mahasiswa!.nim = null;
    setup([archived]);
    harness.tables.pengaturanSistem.push(
      { kunci: "periode_akademik_mode", nilai: "manual" },
      { kunci: "periode_akademik_jenis", nilai: "ganjil" },
      { kunci: "periode_akademik_tahun_mulai", nilai: "2026" },
    );
    const input = { programStudiId: "1", role: "mahasiswa", nama: "Mahasiswa Baru", email: "reused@example.invalid", password: "password123", confirmation: "password123", nim: "22001222", semester: 9, noHp: "081234567890" };
    await assert.rejects(registerAccount({ ...input, semester: 7 }), /Semester dari NIM/);
    await assert.rejects(registerAccount({ ...input, nim: "26001222", semester: 7 }), /Semester dari NIM/);
    await registerAccount(input);
    await assert.rejects(registerAccount(input), /Email sudah/);
    assert.equal(harness.tables.pengguna.find((row) => row.id === 6n)?.emailArsip, input.email);
    assert.equal(harness.tables.pengguna.find((row) => row.email === input.email)?.statusAkun, "menunggu_persetujuan");
  });

  await t.test("registrasi membuktikan batas semester 7 dan 14 serta menolak 6, 15, periode dan pilihan salah", async () => {
    const input = { programStudiId: "1", role: "mahasiswa", nama: "Mahasiswa Batas", email: "boundary@example.invalid", password: "password123", confirmation: "password123", noHp: "081234567890" };
    for (const item of [
      { jenis: "ganjil", nim: "23001222", semester: 7, valid: true },
      { jenis: "genap", nim: "20001222", semester: 14, valid: true },
      { jenis: "genap", nim: "24001222", semester: 6, valid: false },
      { jenis: "ganjil", nim: "19001222", semester: 15, valid: false },
      { jenis: "ganjil", nim: "23001222", semester: 8, valid: false },
      { jenis: "ganjil", nim: "23001222", semester: 9, valid: false },
    ]) {
      setup();
      harness.tables.pengaturanSistem.push(
        { kunci: "periode_akademik_mode", nilai: "manual" },
        { kunci: "periode_akademik_jenis", nilai: item.jenis },
        { kunci: "periode_akademik_tahun_mulai", nilai: "2026" },
      );
      const result = registerAccount({ ...input, nim: item.nim, semester: item.semester });
      if (item.valid) {
        await result;
        assert.equal(harness.tables.mahasiswa.find((row) => row.nim === item.nim)?.semester, item.semester);
      } else {
        await assert.rejects(result);
        assert.ok(!harness.tables.pengguna.some((row) => row.email === input.email));
        assert.equal(harness.tables.logAktivitas.length, 0);
      }
    }
  });

  await t.test("restore arsip NIDN literal, NIM legacy, dan profil historis nullable tidak mengubah identitas lain", async () => {
    const archived = fixture(6n, "dosen");
    archived.deletedAt = new Date(); archived.emailArsip = "archived@example.invalid";
    archived.dosen!.nidnArsip = "literal_DEL_1770000000"; archived.dosen!.nidn = null;
    const legacy = fixture(7n); legacy.deletedAt = new Date(); legacy.mahasiswa!.nim += "_DEL_1770000000";
    const historical = fixture(8n); historical.deletedAt = new Date(); historical.mahasiswa!.nim = null;
    historical.dosen = { ...lecturer.dosen!, penggunaId: 8n, nidn: null, nidnArsip: null };
    setup([archived, legacy, historical]);
    for (const id of [6n, 7n, 8n]) await changeAccountStatus(session(admin), id, "restore", reason, "KONFIRMASI");
    assert.equal(harness.tables.pengguna.find((row) => row.id === 6n)?.email, archived.emailArsip);
    assert.equal(harness.tables.dosen.find((row) => row.penggunaId === 6n)?.nidn, archived.dosen!.nidnArsip);
    assert.equal(harness.tables.mahasiswa.find((row) => row.penggunaId === 7n)?.nim, "22007");
    assert.equal(harness.tables.mahasiswa.find((row) => row.penggunaId === 8n)?.nim, null);
    assert.equal(harness.tables.dosen.find((row) => row.penggunaId === 8n)?.nidn, null);
  });

  await t.test("perubahan peran mempertahankan kedua profil dan menolak pemakaian ulang identitas historis", async () => {
    setup();
    await assignRole(session(admin), 4n, { role: "dosen", identifier: "991144", programStudiId: "1" }, reason, "UBAH PERAN");
    assert.equal(harness.tables.mahasiswa.find((row) => row.penggunaId === 4n)?.nim, student.mahasiswa!.nim);
    assert.equal(harness.tables.dosen.find((row) => row.penggunaId === 4n)?.nidn, "991144");
    await assert.rejects(assignRole(session(admin), 5n, { role: "mahasiswa", identifier: student.mahasiswa!.nim, programStudiId: "1" }, reason, "UBAH PERAN"), /NIM sudah/);
    await assignRole(session(admin), 4n, { role: "mahasiswa" }, reason, "UBAH PERAN");
    assert.equal(harness.tables.dosen.find((row) => row.penggunaId === 4n)?.nidn, "991144");
    assert.ok(!harness.tables.authSession.some((row) => row.penggunaId === 4n));
  });

  await t.test("restore menolak NIDN terpakai dan Kaprodi kedua", async () => {
    const archived = fixture(6n, "dosen");
    archived.deletedAt = new Date(); archived.dosen!.nidnArsip = lecturer.dosen!.nidn; archived.dosen!.nidn = null;
    setup([archived]);
    await assert.rejects(changeAccountStatus(session(admin), 6n, "restore", reason, "KONFIRMASI"), /NIDN sudah/);
    archived.dosen!.nidnArsip = "994422"; archived.dosen!.isKaprodi = true;
    setup([archived]);
    await assert.rejects(changeAccountStatus(session(admin), 6n, "restore", reason, "KONFIRMASI"), /Sudah ada Kaprodi/);
    assert.ok(harness.tables.pengguna.find((row) => row.id === 6n)?.deletedAt);
  });

  await t.test("pengaturan hanya Kaprodi/superadmin, kuota dan alias ikut transaksi audit", async () => {
    setup();
    const defaults = Object.fromEntries(Object.entries(settingDefinitions).map(([key, value]) => [key, value.default]));
    await assert.rejects(saveSettings(session(sekpro, "sekpro"), defaults, reason), /kewenangan/);
    await saveSettings(session(kaprodi, "kaprodi"), { ...defaults, kuota_bimbingan_default: "12" }, reason);
    assert.ok(harness.tables.dosen.every((row) => row.kuotaBimbingan === 12));
    assert.equal(harness.tables.pengaturanSistem.find((row) => row.kunci === "minimal_kehadiran_sempro")?.nilai, "3");
    assert.equal(harness.tables.logAktivitas[0].aksi, "update_pengaturan_sistem");
  });

  await t.test("entry point Server Actions menolak Origin asing sebelum sesi atau mutasi", async () => {
    setup();
    const requireForTest = createRequire(import.meta.url);
    const nextHeaders = requireForTest("next/headers") as typeof import("next/headers");
    const previousOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "http://localhost:3100";
    const headersMock = mock.method(nextHeaders, "headers", async () => new Headers({ origin: "https://foreign.invalid" }) as Awaited<ReturnType<typeof nextHeaders.headers>>);
    const actions = await import("../src/app/actions/accounts");
    try {
      for (const action of [actions.register, actions.requestReset, actions.finishReset, actions.accountAction]) {
        const result = await action({ error: "" }, new FormData());
        assert.match(result.error, /tidak dapat diverifikasi/);
      }
      assert.equal(harness.queries.length, 0);
    } finally {
      headersMock.mock.restore();
      if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
      else process.env.APP_ORIGIN = previousOrigin;
    }
  });

  await t.test("Server Action approval reset mempertahankan tampilan rahasia sekali tanpa revalidasi antrean", async () => {
    setup();
    await requestPasswordReset(student.email!);
    const requireForTest = createRequire(import.meta.url);
    const nextHeaders = requireForTest("next/headers") as typeof import("next/headers");
    const nextCache = requireForTest("next/cache") as typeof import("next/cache");
    const previousOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "http://localhost:3100";
    const browserToken = "a".repeat(64);
    harness.tables.authSession.find((row) => row.penggunaId === 1n)!.tokenHash = tokenHash(browserToken);
    const headersMock = mock.method(nextHeaders, "headers", async () => new Headers({ origin: process.env.APP_ORIGIN! }) as Awaited<ReturnType<typeof nextHeaders.headers>>);
    const cookiesMock = mock.method(nextHeaders, "cookies", async () => ({ get: () => ({ value: browserToken }) }) as Awaited<ReturnType<typeof nextHeaders.cookies>>);
    const revalidate = mock.method(nextCache, "revalidatePath", () => {});
    const actions = await import("../src/app/actions/accounts");
    try {
      const form = new FormData(); form.set("command", "approve-reset"); form.set("id", String(harness.tables.passwordResetRequest[0].id));
      const result = await actions.accountAction({ error: "" }, form);
      assert.equal(result.error, ""); assert.ok(result.secret);
      assert.equal(revalidate.mock.callCount(), 0);
      assert.ok(!serialized(harness.tables).includes(result.secret));
    } finally {
      headersMock.mock.restore(); cookiesMock.mock.restore(); revalidate.mock.restore();
      if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
      else process.env.APP_ORIGIN = previousOrigin;
    }
  });
});
