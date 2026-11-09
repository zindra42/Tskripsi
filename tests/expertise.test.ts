import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { readFile } from "node:fs/promises";
import type { PrismaClient } from "../src/generated/prisma/client";
import { fixture, session, syntheticDatabase } from "./helpers/accounts-db";

const reason = "Penataan bidang sesuai program studi dan fakultas";

test("bidang per prodi melalui layanan dan database sintetis", async (t) => {
  const navigation = mock.module("next/navigation", { exports: { redirect: () => { throw Error("redirect"); }, notFound: () => { throw Error("notFound"); } } });
  t.after(() => navigation.restore());
  const { addExpertise, linkLegacyExpertise } = await import("../src/lib/accounts/settings");
  const { registerAccount } = await import("../src/lib/accounts/registration");
  const { editAccountProfile, submitProfileRequest, decideProfileRequest } = await import("../src/lib/accounts/profile");
  const { expertiseOptions, profileValues } = await import("../src/lib/accounts/views");
  const { accountTransaction, lockedAccount, syncExpertise } = await import("../src/lib/accounts/store");
  const { assertProgramExpertise, matrixExpertiseIds } = await import("../src/lib/accounts/expertise");
  const { getCachedMasterFields } = await import("../src/lib/support/master-data");
  const globalDb = globalThis as unknown as { siasDatabase?: PrismaClient };
  const previous = globalDb.siasDatabase;
  t.after(() => { globalDb.siasDatabase = previous; });
  const admin = fixture(1n, "superadmin"), lecturer = fixture(2n, "dosen"), student = fixture(3n);
  const setup = () => {
    const memory = syntheticDatabase([admin, lecturer, student], [admin, lecturer, student].map((u) => session(u)));
    memory.tables.bidangKeahlian.push(
      { id: 4n, namaBidang: "Data", programStudiId: 2n },
      { id: 5n, namaBidang: "Jaringan", programStudiId: 2n },
      { id: 6n, namaBidang: "Legacy", programStudiId: null },
      { id: 9007199254740993n, namaBidang: "Bigint", programStudiId: 1n },
    );
    globalDb.siasDatabase = memory.db;
    return memory;
  };
  const registration = { role: "dosen", programStudiId: "1", nama: "Dosen Bidang", email: "bidang@example.invalid",
    password: "password123", confirmation: "password123", nidn: "991199", noHp: "081234567890", bidang: ["1", "2"] };

  await t.test("nama CITEXT unik per ID prodi, termasuk nama prodi sama beda fakultas", async () => {
    const { tables } = setup();
    await addExpertise(session(admin), "Komputasi", 1n, reason);
    await addExpertise(session(admin), "komputasi", 2n, reason);
    await addExpertise(session(admin), "KOMPUTASI", 3n, reason);
    await assert.rejects(addExpertise(session(admin), "kOmPuTaSi", 1n, reason), /Duplicate/);
    assert.equal(tables.bidangKeahlian.filter((f) => String(f.namaBidang).toLowerCase() === "komputasi").length, 3);
    assert.equal(tables.logAktivitas.length, 3);
  });

  await t.test("pengelolaan khusus superadmin, menolak ID prodi palsu dan master nonaktif", async () => {
    const { tables } = setup();
    await assert.rejects(addExpertise(session(lecturer), "Bidang", 1n, reason), /kewenangan/);
    tables.pengguna.find((u) => u.id === 2n)!.role = "dekan";
    tables.authSession.find((s) => s.penggunaId === 2n)!.activeRole = "dekan";
    await assert.rejects(addExpertise(session({ ...lecturer, role: "dekan" }, "dekan"), "Bidang", 1n, reason), /kewenangan/);
    await assert.rejects(addExpertise(session(admin), "Bidang", 999n, reason), /tidak aktif/);
    tables.programStudi[0].aktif = false;
    await assert.rejects(addExpertise(session(admin), "Bidang", 1n, reason), /tidak aktif/);
    tables.programStudi[0].aktif = true; tables.fakultas[0].aktif = false;
    await assert.rejects(addExpertise(session(admin), "Bidang", 1n, reason), /tidak aktif/);
  });

  await t.test("opsi hanya metadata publik, null fail closed dan master nonaktif tersembunyi", async () => {
    const { tables } = setup();
    assert.deepEqual(await expertiseOptions(null), []);
    assert.deepEqual(await getCachedMasterFields(), []);
    assert.ok((await expertiseOptions(1n)).every((f) => f.programStudiId === "1"));
    assert.deepEqual((await expertiseOptions(2n)).map((f) => f.id), ["4", "5"]);
    const all = await expertiseOptions();
    assert.ok(!all.some((f) => f.id === "6"));
    assert.deepEqual(Object.keys(all[0]).sort(), ["id", "namaBidang", "programStudiId"]);
    tables.programStudi[0].aktif = false;
    assert.deepEqual(await expertiseOptions(1n), []);
    tables.fakultas[1].aktif = false;
    assert.deepEqual(await expertiseOptions(2n), []);
    await assert.rejects(accountTransaction((tx) => assertProgramExpertise(tx, [], null)), /Pilih program studi/);
  });

  await t.test("registrasi publik dan pembuatan admin menolak bidang lintas prodi, null dan ID palsu secara atomik", async () => {
    for (const bidang of [["1", "4"], ["1", "6"], ["1", "999"], ["1", "1"]]) {
      const { tables } = setup();
      await assert.rejects(registerAccount({ ...registration, bidang }));
      await assert.rejects(registerAccount({ ...registration, bidang }, session(admin), "temporary123"));
      assert.equal(tables.pengguna.length, 3);
      assert.equal(tables.dosenKeahlian.length, 0);
    }
    for (const kind of ["program", "faculty"] as const) {
      const { tables } = setup();
      (kind === "program" ? tables.programStudi : tables.fakultas)[0].aktif = false;
      await assert.rejects(registerAccount(registration), /tidak aktif/);
    }
  });

  await t.test("bidang lainnya upsert scoped, case insensitive dan rollback bila pilihan ditolak", async () => {
    const { tables } = setup();
    await registerAccount({ ...registration, bidang: ["1", "lainnya"], bidangLainnya: "data" });
    assert.equal(tables.bidangKeahlian.length, 7);
    await registerAccount({ ...registration, email: "prodi2@example.invalid", nidn: "991198", programStudiId: "2", bidang: ["4", "lainnya"], bidangLainnya: "Robotika" });
    assert.ok(tables.bidangKeahlian.some((f) => f.namaBidang === "Robotika" && f.programStudiId === 2n));
    const before = structuredClone(tables);
    await assert.rejects(registerAccount({ ...registration, email: "rollback@example.invalid", nidn: "991197", bidang: ["4", "lainnya"], bidangLainnya: "Rollback Bidang" }));
    assert.deepEqual(tables, before);
  });

  await t.test("profil memakai afiliasi tersimpan dan approval memeriksa ulang master", async () => {
    const { tables } = setup();
    for (const bidang of [["1", "4"], ["1", "6"], ["1", "999"]]) {
      await assert.rejects(submitProfileRequest(session(lecturer), { bidang }, reason), /program studi/);
      await assert.rejects(editAccountProfile(session(admin), 2n, { bidang }, reason), /program studi/);
    }
    await submitProfileRequest(session(lecturer), { bidang: ["1", "9007199254740993"] }, reason);
    const request = tables.keahlianChangeRequest[0];
    assert.deepEqual(request.keahlianDiajukan, ["1", "9007199254740993"]);
    tables.programStudi[0].aktif = false;
    await assert.rejects(decideProfileRequest(session(admin), "keahlian", request.id as bigint, true, ""), /tidak aktif/);
    tables.programStudi[0].aktif = true;
    await decideProfileRequest(session(admin), "keahlian", request.id as bigint, true, "");
    assert.deepEqual(tables.dosenKeahlian.map((f) => f.bidangId), [1n, 9007199254740993n]);
  });

  await t.test("ganti afiliasi menyimpan pivot lama dan pilihan baru hanya memakai prodi tujuan", async () => {
    const { tables } = setup();
    tables.dosenKeahlian.push({ dosenId: 2n, bidangId: 1n }, { dosenId: 2n, bidangId: 6n });
    await editAccountProfile(session(admin), 2n, { programStudiId: "2" }, reason);
    let target = await accountTransaction((tx) => lockedAccount(tx, 2n));
    assert.deepEqual(profileValues(target).bidang, []);
    assert.equal(tables.dosenKeahlian.length, 2);
    await assert.rejects(editAccountProfile(session(admin), 2n, { bidang: ["1", "2"] }, reason), /program studi/);
    await editAccountProfile(session(admin), 2n, { bidang: ["4", "5"] }, reason);
    await editAccountProfile(session(admin), 2n, { bidang: ["4", "5"] }, reason);
    target = await accountTransaction((tx) => lockedAccount(tx, 2n));
    assert.deepEqual(profileValues(target).bidang, ["4", "5"]);
    assert.equal(tables.dosenKeahlian.length, 4);
  });

  await t.test("permohonan pindah sekaligus bidang divalidasi terhadap tujuan dan permohonan stale ditolak", async () => {
    let memory = setup();
    await assert.rejects(submitProfileRequest(session(lecturer), { programStudiId: "2", bidang: ["1", "2"] }, reason), /program studi/);
    await submitProfileRequest(session(lecturer), { programStudiId: "2", bidang: ["4", "5"] }, reason);
    await decideProfileRequest(session(admin), "keahlian", memory.tables.keahlianChangeRequest[0].id as bigint, true, "");
    assert.equal(memory.tables.dosen[0].programStudiId, 2n);
    assert.deepEqual(memory.tables.dosenKeahlian.map((p) => p.bidangId), [4n, 5n]);
    memory = setup();
    await submitProfileRequest(session(lecturer), { bidang: ["1", "2"] }, reason);
    memory.tables.dosen[0].programStudiId = 2n;
    await assert.rejects(decideProfileRequest(session(admin), "keahlian", memory.tables.keahlianChangeRequest[0].id as bigint, true, ""), /Afiliasi telah berubah/);
  });

  await t.test("approval legacy tanpa flag tidak meloloskan bidang null/lintas prodi atau numeric bigint rusak", async () => {
    for (const bidang of [[1, "4"], [1, "6"], [1, 9007199254740992], { bidang: [1, 2] }]) {
      const { tables } = setup();
      tables.keahlianChangeRequest.push({ id: 91n, dosenId: 2n, status: "pending", keahlianLama: [], keahlianDiajukan: bidang, namaLama: lecturer.nama, namaBaru: "Nama Baru", ubahNama: true });
      await assert.rejects(decideProfileRequest(session(admin), "keahlian", 91n, true, ""));
      assert.equal(tables.pengguna[1].nama, lecturer.nama);
      assert.equal(tables.keahlianChangeRequest[0].status, "pending");
    }
    const { tables } = setup();
    tables.dosen[0].programStudiId = null;
    await assert.rejects(accountTransaction((tx) => syncExpertise(tx, 2n, [1n, 2n])), /Pilih program studi/);
    assert.deepEqual(matrixExpertiseIds([{ bidang_keahlian_id: "9007199254740993" }]), [9007199254740993n]);
    assert.throws(() => matrixExpertiseIds([{ bidang_keahlian_id: 9007199254740992 }]));
  });

  await t.test("penautan legacy memeriksa semua referensi scalar, matriks, draft, perubahan dan permohonan", async () => {
    for (const reference of ["pivot", "scalar", "matrix", "draft", "changeOld", "changeNew", "requestOld", "requestNew"] as const) {
      for (const ownerProgram of [2n, null]) {
        const { tables } = setup();
        tables.dosen[0].programStudiId = ownerProgram;
        tables.mahasiswa[0].programStudiId = ownerProgram;
        const matrix = [{ bidang_keahlian_id: "1" }, { bidang_keahlian_2_id: "6" }];
        if (reference === "pivot") tables.dosenKeahlian.push({ dosenId: 2n, bidangId: 6n });
        else if (reference.startsWith("request")) tables.keahlianChangeRequest.push({ id: 91n, dosenId: 2n, status: "disetujui",
          [reference === "requestOld" ? "keahlianLama" : "keahlianDiajukan"]: ["6"] });
        else {
          tables.pengajuanJudul.push({ id: 70n, idMahasiswa: 3n, deletedAt: new Date(),
            bidangKeahlianId: reference === "scalar" ? 6n : null,
            matriksPenelitian: reference === "matrix" ? matrix : [], draftData: reference === "draft" ? { matriks: matrix } : null });
          if (reference.startsWith("change")) {
            tables.bimbingan.push({ id: 71n, idPengajuan: 70n });
            tables.pengajuanPerubahanJudul.push({ id: 72n, bimbinganId: 71n, [reference === "changeOld" ? "matriksLama" : "matriksBaru"]: matrix });
          }
        }
        const before = structuredClone(tables);
        await assert.rejects(linkLegacyExpertise(session(admin), 6n, 1n, reason), /Referensi historis/);
        assert.deepEqual(tables, before);
      }
    }
  });

  await t.test("penautan sukses mempertahankan ID dan histori, menolak remap, duplikasi dan pemetaan bersamaan", async () => {
    const { tables } = setup();
    tables.dosenKeahlian.push({ dosenId: 2n, bidangId: 6n });
    tables.pengajuanJudul.push({ id: 70n, idMahasiswa: 3n, matriksPenelitian: [{ bidang_keahlian_id: "6" }] });
    const pivot = structuredClone(tables.dosenKeahlian), titles = structuredClone(tables.pengajuanJudul);
    const results = await Promise.allSettled([linkLegacyExpertise(session(admin), 6n, 1n, reason), linkLegacyExpertise(session(admin), 6n, 2n, reason)]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(tables.bidangKeahlian.find((f) => f.id === 6n)!.programStudiId, 1n);
    assert.deepEqual(tables.dosenKeahlian, pivot); assert.deepEqual(tables.pengajuanJudul, titles);
    await assert.rejects(linkLegacyExpertise(session(admin), 6n, 2n, reason), /belum terpetakan/);
    await assert.rejects(linkLegacyExpertise(session(lecturer), 6n, 1n, reason), /kewenangan/);
    tables.bidangKeahlian.push({ id: 7n, namaBidang: "DATA", programStudiId: null });
    await assert.rejects(linkLegacyExpertise(session(admin), 7n, 1n, reason), /Duplicate/);
    assert.equal(tables.bidangKeahlian.find((f) => f.id === 7n)!.programStudiId, null);
  });
});

test("migration additive mempertahankan CITEXT, legacy nullable dan afiliasi bidang immutable", async () => {
  const sql = await readFile("prisma/migrations/20261109000000_expertise_program/migration.sql", "utf8");
  assert.match(sql, /ADD COLUMN "program_studi_id" BIGINT;/);
  assert.match(sql, /CREATE UNIQUE INDEX[\s\S]*\("program_studi_id", "nama_bidang"\)/);
  assert.match(sql, /OLD.program_studi_id IS NOT NULL/);
  assert.doesNotMatch(sql, /UPDATE\s+"?bidang_keahlian"?\s+SET|DELETE FROM|DROP TABLE/i);
});
