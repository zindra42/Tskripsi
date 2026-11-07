import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { tokenHash } from "../src/lib/auth/tokens";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { Context } from "../src/lib/academic/store";
import { SIDANG_ITEMS, formScore, recap, grade, officialResult, revisionComplete, revisionApprovers, announcementVisible, validateBoard, validateSlot, hundredths, EXAMINER_WEIGHTS, SUPERVISOR_WEIGHTS } from "../src/lib/sidang/policy";
import { reconcileSidang, preserveLegacyDecision } from "../src/lib/sidang/reconciliation";
import { syntheticSidang, session } from "./helpers/sidang-db";
import { notificationUrl } from "../src/lib/support/notifications";

test("rubrik sidang mempertahankan 7/10 komponen, desimal dan kedua metode sumber", () => {
  const values = Object.fromEntries(Object.keys(EXAMINER_WEIGHTS).map((k) => [k, "8.25"]));
  assert.equal(formScore("penguji_1", values).total, "82.50");
  assert.equal(formScore("pembimbing", values).total, "82.50");
  assert.equal(Object.keys(SUPERVISOR_WEIGHTS).length, 7);
  assert.equal(recap("90", "80", "70"), "80.10");
  assert.equal(recap("90", "80", "70", "rekap_rata_rata"), "77.50");
  assert.equal(recap("83.17", "83.17", "83.17"), "83.18"); // Source rounds each weighted contribution first.
  assert.equal(recap("50.99", "51", "51.01", "rekap_rata_rata"), "51.00"); // PHP boundary comparison after intermediate mean.
  const edge = Object.fromEntries(Object.keys(EXAMINER_WEIGHTS).map((k, i) => [k, (9.99 - i * 0.01).toFixed(2)]));
  assert.equal(formScore("penguji_1", edge).total, "99.42");
  assert.throws(() => formScore("penguji_1", { ...values, C_c: "10.01" }));
  assert.throws(() => formScore("penguji_1", { ...values, C_c: "" }));
  for (const value of [NaN, Infinity, "1e1", "-1", "8.001"]) assert.throws(() => hundredths(value));
  assert.equal(grade("50"), "C"); assert.equal(grade("65"), "B-"); assert.equal(grade("80"), "A-");
});
test("hasil legacy tetap resmi tanpa menimpa status sumber; keputusan gagal tidak membuka skripsi", () => {
  for (const hasil of ["lulus", "lulus_revisi", "tidak_lulus"]) assert.ok(officialResult({ hasil, statusPersetujuan: "menunggu_nilai_lengkap" }));
  assert.ok(!officialResult({ hasil: null, statusPersetujuan: "menunggu_persetujuan_kaprodi" }));
  assert.ok(!revisionComplete({ hasil: "tidak_lulus", statusPersetujuan: "disetujui_kaprodi", statusRevisi: "revisi_selesai" }));
  const preserved = preserveLegacyDecision({ hasil: "lulus", status_persetujuan: "menunggu_nilai_lengkap", disetujui_kaprodi_at: null });
  assert.equal(preserved.statusPersetujuan, "menunggu_nilai_lengkap"); assert.equal(preserved.sourceHasil, "lulus");
  assert.equal(preserved.transformProvenance.official, true); assert.equal(preserved.transformProvenance.sourceApprovalAt, null);
});
test("preflight mendeteksi kedua FK logis orphan dan undangan historis ambigu tanpa menulis data", () => {
  const input = { registrations: [{ id: "9007199254740993", id_pengajuan: "1", siklus_ke: "1" }],
    assignments: [{ id: "1", id_sidang_daftar: "7" }], checklist: [{ id: "2", id_sidang_daftar: "8" }],
    schedules: [{ id: "3", id_sidang: "9007199254740993", status: "ditunda", versi: 2 }], invitations: [
      { id: "4", jenis_dokumen: "undangan_sidang", id_jadwal: "3", id_jadwal_sidang: "3", status: "sah", snapshot_json: { versiJadwal: 1 } }],
  };
  const before = structuredClone(input), result = reconcileSidang(input);
  assert.ok(!result.valid); assert.equal(result.issues.filter((i) => i.code === "orphan-sidang-fk").length, 2);
  assert.ok(result.issues.some((i) => i.code === "ambiguous-historical-invitation-status"));
  assert.ok(result.issues.some((i) => i.code === "ambiguous-sidang-invitation-fk")); assert.deepEqual(input, before);
  assert.throws(() => reconcileSidang({ ...input, registrations: [{ id: "9223372036854775808", id_pengajuan: "1", siklus_ke: "1" }] }));
  const duplicate = reconcileSidang({ ...input, assignments: [input.assignments[0], input.assignments[0]] });
  assert.ok(duplicate.issues.some((i) => i.code === "duplicate-primary-key" && i.table === "penugasan_penguji"));
  assert.throws(() => reconcileSidang({ ...input, registrations: [{ ...input.registrations[0], siklus_ke: "0" }] }));
  assert.throws(() => reconcileSidang({ ...input, schedules: [{ ...input.schedules[0], versi: 0 }] }));
});
test("persetujuan revisi sidang hanya penilai peminta, fallback seluruh penilai tanpa bypass", () => {
  const scores = [{ penilaiId: 2n, peran: "pembimbing", perluRevisi: false }, { penilaiId: 3n, peran: "penguji_1", perluRevisi: true }, { penilaiId: 4n, peran: "penguji_2", perluRevisi: false }];
  assert.deepEqual(Object.keys(revisionApprovers(scores)), ["penguji_1"]);
  assert.equal(Object.keys(revisionApprovers(scores.map((p) => ({ ...p, perluRevisi: false })))).length, 3);
  assert.throws(() => revisionApprovers([]));
});
test("slot, dewan, visibility pengumuman dan item 11 mengikuti sumber terbaru", () => {
  assert.equal(SIDANG_ITEMS.length, 11); assert.equal(SIDANG_ITEMS[10], "Penggandaan Skripsi");
  assert.throws(() => validateBoard({ pembimbing_1: "2", penguji_1: "2", penguji_2: "3" }));
  assert.throws(() => validateSlot({ tanggal: "2026-02-30", mulai: "09:00", selesai: "10:00", ruang: "A1" }));
  assert.throws(() => validateSlot({ tanggal: "2026-11-09", mulai: "09:00", selesai: "09:00", ruang: "A1" }, new Date("2026-11-09T00:00Z")));
  const row = { status: "terbit", isPublik: false, targetPeran: ["mahasiswa"], deletedAt: null, tampilMulai: null, tampilSelesai: null };
  assert.ok(announcementVisible(row, "mahasiswa")); assert.ok(!announcementVisible(row, "dosen")); assert.ok(!announcementVisible(row));
  assert.ok(!announcementVisible({ ...row, isPublik: true, status: "draft" }));
  assert.ok(announcementVisible({ ...row, targetPeran: ["sekprodi"] }, "sekpro"));
  assert.equal(notificationUrl("https://legacy.invalid/sidang/status?id=12#hasil"), "/sidang/status?id=12#hasil");
  for (const url of ["javascript:alert(1)", "//foreign.invalid/a", "/\\foreign.invalid/a", "/a\nb"]) assert.equal(notificationUrl(url), null);
});

test("layanan sidang, dokumen dan komunikasi dijalankan dengan transaksi sintetis", async (t) => {
  const navMock = mock.module("next/navigation", { exports: { redirect: (url: string) => { throw new Error(`redirect:${url}`); }, notFound: () => { throw new Error("not-found"); } } });
  t.after(() => navMock.restore());
  const { academicMutation } = await import("../src/lib/academic/store");
  const { initialize, submit, updateChecklist, verifyChecklist, verifyBatch, returnRegistration } = await import("../src/lib/sidang/registration");
  const { schedule, confirm, cancelSchedule, checkConflicts, assignExaminers, requestChange, decideRequest, recommendSlots, emergencyAssignment } = await import("../src/lib/sidang/scheduling");
  const { score, examinerDecision, approveResult, uploadRevision, reviewRevision, latePermission } = await import("../src/lib/sidang/scoring");
  const { correctSidang } = await import("../src/lib/support/corrections");
  const { reviewSemproRevision } = await import("../src/lib/support/sempro-revisions");
  const { rollbackAudit } = await import("../src/lib/support/audit-rollback");
  const { saveAnnouncement, readAnnouncement, processScheduled } = await import("../src/lib/support/announcements");
  const { sidangRecord, canRead } = await import("../src/lib/sidang/store");
  const { renderSidangPdf } = await import("../src/lib/sidang/documents");
  const { dashboardIndicators } = await import("../src/lib/support/dashboard");
  const { studentOverview, lecturerOverview, managementOverview, systemOverview, commonOverview, administrationOverview } = await import("../src/lib/support/dashboard-overview");
  const { processReminders } = await import("../src/lib/sidang/reminders");
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-09T00:00:00Z") });
  const globalDb = globalThis as unknown as { siasDatabase?: PrismaClient };
  const previousDb = globalDb.siasDatabase, previousStorage = process.env.SIAS_STORAGE_ROOT;
  const storage = await mkdtemp(path.join(tmpdir(), "sias-sidang-test-"));
  process.env.SIAS_STORAGE_ROOT = storage;
  t.after(async () => { globalDb.siasDatabase = previousDb; if (previousStorage === undefined) delete process.env.SIAS_STORAGE_ROOT; else process.env.SIAS_STORAGE_ROOT = previousStorage; await rm(storage, { recursive: true, force: true }); });
  let fixture = syntheticSidang();
  function reset() { t.mock.timers.setTime(new Date("2026-11-09T00:00:00Z").getTime()); fixture = syntheticSidang(); globalDb.siasDatabase = fixture.db; }
  const actor = (id: number) => fixture.users.find((u) => u.id === BigInt(id))!;
  const run = (id: number, work: (context: Context) => Promise<unknown>, key = randomUUID(), input = {}, file: { bytes: Buffer; extension: string } | null = null) =>
    academicMutation(session(actor(id)), key, "test-sidang", input, { file }, work);
  const upload = { bytes: Buffer.from("%PDF-1.4\nsynthetic document"), extension: "pdf" };
  const sidangId = () => String(fixture.tables.pendaftaranSidang[0].id);
  const jadwalId = () => String(fixture.tables.jadwalSidang[0].id);
  const values = () => ({ id: sidangId(), jadwalId: jadwalId(), versi: String(fixture.tables.jadwalSidang[0].versi) });
  async function registration() {
    await run(1, initialize);
    for (let number = 1; number <= 11; number++) if (number !== 3) await run(1, (c) => updateChecklist(c,
      { id: sidangId(), nomorItem: number, ipk: "3.25", centang: "true" }, { file: number === 11 ? null : upload }));
    await run(1, (c) => submit(c, { id: sidangId() }));
    for (const item of fixture.tables.checklistDokumen.filter((i) => ![3, 11].includes(Number(i.nomorItem))))
      await run(6, (c) => verifyChecklist(c, { id: sidangId(), itemId: String(item.id), status: "diverifikasi" }));
    assert.equal(fixture.tables.pendaftaranSidang[0].statusBerkas, "lengkap");
  }
  async function scheduled() {
    await registration();
    await run(6, (c) => schedule(c, { id: sidangId(), tanggal: "2026-11-09", mulai: "09:00", selesai: "10:30", ruang: "Ruang B" }));
    for (const id of [2, 3, 4, 5]) await run(id, (c) => confirm(c, { ...values(), status: "bersedia" }));
    assert.equal(fixture.tables.jadwalSidang[0].status, "final");
  }
  async function scored(revision = true) {
    await scheduled();
    t.mock.timers.setTime(new Date("2026-11-09T01:30Z").getTime());
    for (const id of [2, 3, 4]) await run(id, (c) => score(c, { ...values(), ...Object.fromEntries(Object.keys(EXAMINER_WEIGHTS).map((k) => [k, "8"])),
      perluRevisi: revision && id === 3 ? "true" : "false", catatanRevisi: "Perbaiki metodologi penelitian" }));
  }
  async function result(hasil = "lulus_revisi") {
    await scored(hasil === "lulus_revisi");
    await run(3, (c) => examinerDecision(c, { ...values(), hasil, catatan: "Perbaikan hasil penelitian", tenggat: "2026-11-23" }));
    await run(6, (c) => approveResult(c, { ...values(), hasil, catatan: "Keputusan final", reason: "Penetapan berdasarkan rapat dewan", tenggat: "2026-11-23" }));
  }

  await t.test("sempro legacy lulus mengizinkan draf; sempro/revisi belum selesai ditolak", async () => {
    reset(); await run(1, initialize); assert.equal(fixture.tables.checklistDokumen.length, 11);
    assert.equal(fixture.tables.penugasanPenguji.filter((p) => p.jenis === "sidang").length, 2);
    reset(); fixture.tables.beritaAcara[0].hasil = "lulus_revisi"; fixture.tables.beritaAcara[0].statusRevisi = "dalam_revisi";
    await assert.rejects(run(1, initialize), /revisi/); assert.equal(fixture.tables.pendaftaranSidang.length, 0);
  });
  await t.test("pendaftaran membutuhkan semua ACC, IPK, 11 butir dan administrasi awal, tanpa pembayaran akhir", async () => {
    reset(); await registration(); assert.equal(fixture.tables.pembayaranSidang.length, 0);
    assert.equal(fixture.tables.checklistDokumen.find((i) => i.nomorItem === 11)?.statusItem, "terisi");
    reset(); await run(1, initialize); fixture.tables.dokumenVerifikasi[1].status = "dicabut";
    await assert.rejects(run(1, (c) => submit(c, { id: sidangId() })), /ACC/);
    await assert.rejects(run(9, (c) => updateChecklist(c, { id: sidangId(), nomorItem: 11, centang: "true" }, {})), /pemilik/);
  });
  await t.test("pemeriksaan berkas tidak dapat dipanggil mahasiswa dan mode dosen pimpinan", async () => {
    reset(); await run(1, initialize);
    await assert.rejects(run(1, (c) => verifyChecklist(c, { id: sidangId(), itemId: "1", status: "diverifikasi" })), /Kewenangan/);
    fixture.tables.authSession.find((s) => s.penggunaId === 6n)!.activeRole = "dosen";
    await assert.rejects(run(6, (c) => assignExaminers(c, { id: sidangId(), penguji1Id: "3", penguji2Id: "4" })), /Kewenangan/);
  });
  await t.test("undangan terbit setelah empat konfirmasi; jadwal berubah mencabut FK sidang dan mengganti versi", async () => {
    reset(); await scheduled(); const old = fixture.tables.dokumenVerifikasi.find((d) => d.jenisDokumen === "undangan_sidang")!;
    assert.equal(old.idJadwalSidang, fixture.tables.jadwalSidang[0].id); assert.equal(old.idJadwal, undefined);
    assert.equal(old.penandatanganUserId, 6n); assert.equal(old.peran, "kaprodi");
    await run(6, (c) => schedule(c, { ...values(), tanggal: "2026-11-09", mulai: "11:00", selesai: "12:30", ruang: "Ruang B", reason: "Perubahan waktu pelaksanaan" }));
    assert.equal(fixture.tables.dokumenVerifikasi.find((d) => d.id === old.id)!.status, "dicabut");
    assert.equal(fixture.tables.riwayatJadwalSidang.length, 1);
    await assert.rejects(run(3, (c) => confirm(c, { jadwalId: jadwalId(), versi: 1, status: "bersedia" })), /berubah/);
    for (const id of [2, 3, 4, 5]) await run(id, (c) => confirm(c, { ...values(), status: "bersedia" }));
    const docs = fixture.tables.dokumenVerifikasi.filter((d) => d.jenisDokumen === "undangan_sidang");
    assert.equal(docs.length, 2); assert.equal(docs[0].status, "digantikan"); assert.equal(docs[0].digantikanOlehId, docs[1].id);
    assert.notEqual(docs[0].token, docs[1].token); assert.equal(docs[1].versi, 2);
  });
  await t.test("draf jadwal tidak meminta konfirmasi; rekomendasi memeriksa konflik dan penerbitan membuat versi baru", async () => {
    reset(); await registration();
    const input = { id: sidangId(), tanggal: "2026-11-09", mulai: "08:30", selesai: "10:00", ruang: "Ruang B" };
    await run(6, (c) => schedule(c, input, undefined, true));
    assert.equal(fixture.tables.jadwalSidang[0].status, "draft"); assert.equal(fixture.tables.konfirmasiJadwalSidang.length, 0);
    await assert.rejects(run(1, (c) => recommendSlots(c, input)), /Kewenangan/);
    const suggestions = await recommendSlots({ tx: fixture.db, actor: actor(6), role: "kaprodi" }, input);
    assert.equal(suggestions.length, 5);
    await run(6, (c) => schedule(c, { ...input, versi: 1, reason: "Jadwal siap diterbitkan" }));
    assert.equal(fixture.tables.jadwalSidang[0].versi, 2); assert.equal(fixture.tables.konfirmasiJadwalSidang.length, 4);
    await assert.rejects(run(3, (c) => confirm(c, { ...values(), versi: 1, status: "bersedia" })), /berubah/);
    fixture.tables.jadwalSempro[0].tanggal = new Date("2026-11-09");
    const available = await recommendSlots({ tx: fixture.db, actor: actor(6), role: "kaprodi" }, input);
    assert.ok(!available.some((s) => s.mulai === "08:30"));
  });
  await t.test("pengganti darurat mempertahankan penguji lama, mencabut undangan dan menolak nilai penguji yang sudah terkunci", async () => {
    reset(); await scheduled();
    const invitation = fixture.tables.dokumenVerifikasi.find((d) => d.jenisDokumen === "undangan_sidang")!;
    await assert.rejects(run(1, (c) => emergencyAssignment(c, { ...values(), dosenLamaId: "3", dosenId: "6", reason: "Penguji tidak dapat hadir" })), /Kewenangan/);
    await assert.rejects(run(6, (c) => emergencyAssignment(c, { ...values(), dosenLamaId: "3", dosenId: "2", reason: "Pembimbing mengganti penguji" })), /Dewan/);
    await run(6, (c) => emergencyAssignment(c, { ...values(), dosenLamaId: "3", dosenId: "7", reason: "Penguji berhalangan darurat" }));
    assert.ok(fixture.tables.penugasanPenguji.some((p) => p.idSidangDaftar && p.idDosenPenguji === 3n && p.isPengganti));
    assert.equal(fixture.tables.dokumenVerifikasi.find((d) => d.id === invitation.id)!.status, "digantikan");
    await assert.rejects(run(3, (c) => score(c, values())), /bukan dewan/);
    t.mock.timers.setTime(new Date("2026-11-09T01:30Z").getTime());
    await run(7, (c) => score(c, { ...values(), ...Object.fromEntries(Object.keys(EXAMINER_WEIGHTS).map((k) => [k, "8"])) }));
    await assert.rejects(run(6, (c) => emergencyAssignment(c, { ...values(), dosenLamaId: "7", dosenId: "3", reason: "Penguji hadir kembali" })), /dibuka ulang/);
  });
  await t.test("verifikasi batch rollback seluruhnya pada butir salah; pengembalian dan identitas pemeriksa tersimpan", async () => {
    reset(); await run(1, initialize);
    for (let n = 1; n <= 11; n++) if (n !== 3) await run(1, (c) => updateChecklist(c, { id: sidangId(), nomorItem: n, ipk: "3.25", centang: "true" }, { file: n === 11 ? null : upload }));
    await run(1, (c) => submit(c, { id: sidangId() }));
    const first = fixture.tables.checklistDokumen.find((i) => i.nomorItem === 1)!;
    await assert.rejects(run(6, (c) => verifyBatch(c, { id: sidangId(), itemIds: [String(first.id), "9999"] })), /otomatis/);
    assert.equal(fixture.tables.checklistDokumen.find((i) => i.id === first.id)!.statusItem, "terisi");
    await run(6, (c) => verifyBatch(c, { id: sidangId(), itemIds: [String(first.id)] }));
    assert.equal(fixture.tables.checklistDokumen.find((i) => i.id === first.id)!.lastVerifierId, 6n);
    await run(6, (c) => returnRegistration(c, { id: sidangId(), reason: "Periksa kelengkapan sertifikat" }));
    assert.equal(fixture.tables.pendaftaranSidang[0].statusBerkas, "dikembalikan");
  });
  await t.test("konflik ruang dan dosen lintas sempro–sidang ditolak, slot bersambung sah", async () => {
    reset(); await scheduled();
    await assert.rejects(checkConflicts({ tx: fixture.db }, { tanggal: "2026-11-09", mulai: "09:30", selesai: "11:00", ruang: "Ruang B" }, [99n]), /Bentrok/);
    await assert.rejects(checkConflicts({ tx: fixture.db }, { tanggal: "2026-11-09", mulai: "09:30", selesai: "11:00", ruang: "Ruang C" }, [3n]), /Bentrok/);
    await checkConflicts({ tx: fixture.db }, { tanggal: "2026-11-09", mulai: "10:30", selesai: "12:00", ruang: "Ruang B" }, [3n]);
    fixture.tables.jadwalSempro[0].tanggal = new Date("2026-11-09");
    await assert.rejects(checkConflicts({ tx: fixture.db }, { tanggal: "2026-11-09", mulai: "09:30", selesai: "11:00", ruang: "Ruang A" }, [99n]), /seminar proposal/);
  });
  await t.test("nilai, keputusan dua tingkat, revisi requester, audit dan PDF berjalan sampai selesai", async () => {
    reset(); await result();
    const ba = fixture.tables.beritaAcara.find((b) => b.idJadwalSidang)!;
    assert.equal(ba.nilai, "80.00"); assert.equal(ba.predikatHuruf, "A-"); assert.equal(ba.statusPersetujuan, "disetujui_kaprodi");
    await run(1, (c) => uploadRevision(c, { ...values(), catatan: "Naskah telah diperbaiki" }, { file: upload }));
    const revision = fixture.tables.revisiDokumen[0];
    await assert.rejects(run(6, (c) => reviewRevision(c, { revisiId: String(revision.id), status: "disetujui" })), /dewan/);
    await assert.rejects(run(4, (c) => reviewRevision(c, { revisiId: String(revision.id), status: "disetujui" })), /peminta/);
    await run(3, (c) => reviewRevision(c, { revisiId: String(revision.id), status: "disetujui" }));
    assert.equal(fixture.tables.beritaAcara.find((b) => b.id === ba.id)!.statusRevisi, "revisi_selesai");
    const doc = fixture.tables.dokumenVerifikasi.find((d) => d.jenisDokumen === "berita_acara_sidang")!;
    const bytes = renderSidangPdf(doc as unknown as Parameters<typeof renderSidangPdf>[0]);
    assert.ok(bytes.toString("latin1").startsWith("%PDF-1.4")); assert.ok(bytes.toString("latin1").includes("BERITA ACARA SIDANG SKRIPSI"));
    assert.ok(fixture.tables.logAktivitas.some((l) => l.aksi === "hasil_sidang_ditetapkan"));
    assert.ok(fixture.tables.notification.length > 0);
  });
  await t.test("revisi ditolak mempertahankan versi lama, versi baru memulai persetujuan baru", async () => {
    reset(); await result(); await run(1, (c) => uploadRevision(c, values(), { file: upload }));
    await run(3, (c) => reviewRevision(c, { revisiId: String(fixture.tables.revisiDokumen[0].id), status: "ditolak", reason: "Metodologi belum diperbaiki" }));
    await run(1, (c) => uploadRevision(c, values(), { file: upload }));
    assert.equal(fixture.tables.revisiDokumen.length, 2); assert.equal(fixture.tables.revisiDokumen[1].versi, 2);
    assert.notEqual(fixture.tables.revisiDokumen[0].fileDraft, fixture.tables.revisiDokumen[1].fileDraft);
  });
  await t.test("nilai terkunci, pembimbing kedua, dan keputusan bukan Penguji 1 ditolak server", async () => {
    reset(); await scored();
    await assert.rejects(run(3, (c) => score(c, { ...values() })), /terkunci/);
    await assert.rejects(run(5, (c) => score(c, { ...values() })), /utama/);
    await assert.rejects(run(4, (c) => examinerDecision(c, { ...values(), hasil: "lulus" })), /Penguji 1/);
    await assert.rejects(run(6, (c) => approveResult(c, { ...values(), hasil: "lulus" })), /Penguji 1/);
    await assert.rejects(run(6, (c) => assignExaminers(c, { id: sidangId(), penguji1Id: "3", penguji2Id: "4" })), /Nilai/);
  });
  await t.test("batas nilai satu jam dan izin susulan terbatas tidak membuka nilai terkunci", async () => {
    reset(); await scheduled(); t.mock.timers.setTime(new Date("2026-11-09T04:00Z").getTime());
    const input = { ...values(), ...Object.fromEntries(Object.keys(EXAMINER_WEIGHTS).map((k) => [k, "8"])) };
    await assert.rejects(run(3, (c) => score(c, input)), /Toleransi/);
    await run(6, (c) => latePermission(c, { ...values(), dosenId: "3", reason: "Koneksi dosen terputus" }));
    assert.equal((fixture.tables.penilaianSidang[0].izinBerlakuSampai as Date).getTime() - Date.now(), 15 * 60000);
    t.mock.timers.setTime(Date.now() + 16 * 60000);
    await assert.rejects(run(3, (c) => score(c, input)), /Toleransi/);
    await run(6, (c) => latePermission(c, { ...values(), dosenId: "3", reason: "Koneksi masih belum pulih" }));
    await run(3, (c) => score(c, input));
    await assert.rejects(run(6, (c) => latePermission(c, { ...values(), dosenId: "3", reason: "Koreksi skor tersimpan" })), /terkunci/);
  });
  await t.test("nilai tersimpan menutup perubahan konfirmasi, keputusan menolak formulir versi lama", async () => {
    reset(); await scored(false);
    await assert.rejects(run(3, (c) => confirm(c, { ...values(), status: "tidak_bersedia", reason: "Perubahan konfirmasi terlambat" })), /penilaian/);
    await assert.rejects(run(3, (c) => examinerDecision(c, { ...values(), versi: 2, hasil: "lulus" })), /berubah/);
    await run(3, (c) => examinerDecision(c, { ...values(), hasil: "lulus_revisi", catatan: "Perbaiki naskah penelitian", tenggat: "2026-11-30" }));
    await assert.rejects(run(6, (c) => approveResult(c, { ...values(), versi: 2, hasil: "lulus" })), /berubah/);
    await run(6, (c) => approveResult(c, { ...values(), hasil: "lulus_revisi", reason: "Ikuti rekomendasi dewan" }));
    assert.equal((fixture.tables.beritaAcara.find((b) => b.idJadwalSidang)!.tenggatRevisi as Date).toISOString().slice(0, 10), "2026-11-30");
  });
  await t.test("superadmin membuka nilai dengan audit, reissue mengganti token; hasil resmi menutup reopen/cancel", async () => {
    reset(); await scored();
    await run(8, (c) => correctSidang(c, { ...values(), correction: "reopen-score", dosenId: "3", reason: "Kesalahan input nilai" }));
    assert.equal(fixture.tables.penilaianSidang.find((p) => p.penilaiId === 3n)!.status, "draft");
    assert.ok(fixture.tables.logSuperAdmin.length); assert.equal(fixture.tables.beritaAcara.find((b) => b.idJadwalSidang)!.statusPersetujuan, "menunggu_nilai_lengkap");
    reset(); await result("lulus");
    await assert.rejects(run(8, (c) => correctSidang(c, { ...values(), correction: "reopen-score", dosenId: "3", reason: "Koreksi sesudah hasil" })), /resmi/);
    await assert.rejects(run(6, (c) => cancelSchedule(c, { ...values(), status: "dibatalkan", reason: "Pembatalan sesudah hasil" })), /tersimpan/);
    await run(8, (c) => correctSidang(c, { ...values(), correction: "reissue-minutes", reason: "Cetak ulang dokumen resmi" }));
    assert.equal(fixture.tables.dokumenVerifikasi.filter((d) => d.jenisDokumen === "berita_acara_sidang").length, 2);
  });
  await t.test("koreksi sempro mereset penanda penguji, mempertahankan audit, mengganti token dan membatalkan jadwal", async () => {
    reset();
    Object.assign(fixture.tables.beritaAcara[0], { hasil: null, nilaiPenguji1: "80", nilaiPenguji2: "85", nilai: "82", statusDinilaiPembimbing: false });
    Object.assign(fixture.tables.penugasanPenguji[0], { statusDinilai: true, nilaiTotal: "80" });
    fixture.tables.dokumenVerifikasi.push({ id: 400n, idJadwal: 50n, jenisDokumen: "form_nilai", status: "sah", penandatanganUserId: 3n });
    const input = { correction: "sempro-reopen-score", jadwalId: "50", dosenId: "3", reason: "Kesalahan input nilai sempro" };
    await assert.rejects(run(6, (c) => correctSidang(c, input)), /superadmin/);
    await run(8, (c) => correctSidang(c, input));
    assert.equal(fixture.tables.penugasanPenguji[0].statusDinilai, false);
    assert.equal(fixture.tables.penugasanPenguji[0].nilaiTotal, "80");
    assert.equal(fixture.tables.beritaAcara[0].nilaiPenguji1, null);
    assert.equal(fixture.tables.beritaAcara[0].nilaiPenguji2, "85");
    assert.equal(fixture.tables.dokumenVerifikasi.find((d) => d.id === 400n)!.status, "tidak_berlaku");
    assert.ok(fixture.tables.logSuperAdmin.length); assert.ok(fixture.tables.notification.length);
    fixture.tables.beritaAcara[0].hasil = "lulus";
    fixture.tables.dokumenVerifikasi.push({ id: 401n, idJadwal: 50n, jenisDokumen: "berita_acara", status: "sah", versi: 1, token: "a".repeat(48), snapshotJson: { judul: "Judul historis" }, hashSha256: "hash-historis" });
    await run(8, (c) => correctSidang(c, { ...input, correction: "sempro-reissue-minutes" }));
    const replacement = fixture.tables.dokumenVerifikasi.find((d) => d.jenisDokumen === "berita_acara" && d.versi === 2)!;
    assert.notEqual(replacement.token, "a".repeat(48));
    assert.equal(fixture.tables.dokumenVerifikasi.find((d) => d.id === 401n)!.digantikanOlehId, replacement.id);
    await assert.rejects(run(8, (c) => correctSidang(c, { ...input, correction: "sempro-cancel-schedule", versi: 1 })), /resmi/);
    fixture.tables.beritaAcara[0].hasil = null;
    await run(8, (c) => correctSidang(c, { ...input, correction: "sempro-cancel-schedule", versi: 1 }));
    assert.equal(fixture.tables.jadwalSempro[0].status, "dibatalkan");
    assert.equal(fixture.tables.jadwalSempro[0].versi, 2);
  });
  await t.test("review revisi sempro membuka sidang melalui approver aktif dan menolak versi lama", async () => {
    reset();
    Object.assign(fixture.tables.beritaAcara[0], { hasil: "lulus_revisi", statusRevisi: "dalam_revisi" });
    const revision = await fixture.db.revisiDokumen.create({ data: { tipe: "sempro", beritaAcaraId: 60n, mahasiswaId: 1n, versi: 1, fileDraft: "revisi_sempro/test.pdf" } });
    const input = { revisiId: String(revision.id), status: "disetujui" };
    await assert.rejects(run(4, (c) => reviewSemproRevision(c, input)), /Penguji 1 aktif/);
    await assert.rejects(run(1, initialize), /revisi/);
    await run(3, (c) => reviewSemproRevision(c, input));
    assert.equal(fixture.tables.beritaAcara[0].statusRevisi, "revisi_selesai");
    await assert.rejects(run(2, (c) => reviewSemproRevision(c, input)), /versi aktif/);
    await run(1, initialize); assert.equal(fixture.tables.pendaftaranSidang.length, 1);
    reset();
    Object.assign(fixture.tables.beritaAcara[0], { hasil: "lulus_revisi", statusRevisi: "dalam_revisi" });
    fixture.tables.penugasanPenguji[0].isPengganti = true;
    const stale = await fixture.db.revisiDokumen.create({ data: { tipe: "sempro", beritaAcaraId: 60n, mahasiswaId: 1n, versi: 1, fileDraft: "revisi_sempro/test.pdf" } });
    await assert.rejects(run(3, (c) => reviewSemproRevision(c, { ...input, revisiId: String(stale.id) })), /Penguji 1 aktif/);
  });
  await t.test("koreksi penugasan per slot menyimpan histori, mencabut ACC dan menolak perangkapan", async () => {
    reset(); await scheduled();
    const input = { correction: "sidang-examiner", id: sidangId(), slot: 1, dosenId: "7", reason: "Penguji berhalangan tetap" };
    await assert.rejects(run(1, (c) => correctSidang(c, input)), /Kewenangan/);
    await assert.rejects(run(8, (c) => correctSidang(c, { ...input, dosenId: "2" })), /Pembimbing/);
    await run(8, (c) => correctSidang(c, input));
    assert.equal(fixture.tables.jadwalSidang[0].status, "draft");
    assert.ok(fixture.tables.penugasanPenguji.some((p) => p.idSidangDaftar && p.idDosenPenguji === 3n && p.isPengganti));
    reset();
    Object.assign(fixture.tables.beritaAcara[0], { hasil: null, statusDinilaiPembimbing: false });
    await run(8, (c) => correctSidang(c, { correction: "sempro-examiner", semproId: "40", slot: 1, dosenId: "7", reason: "Koreksi penguji seminar" }));
    assert.equal(fixture.tables.jadwalSempro[0].status, "draft");
    assert.ok(fixture.tables.penugasanPenguji.some((p) => p.idSempro === 40n && p.idDosenPenguji === 3n && p.isPengganti));
    reset();
    await run(8, (c) => correctSidang(c, { correction: "correct-supervisor", bimbinganId: "30", slot: 1, dosenId: "7", reason: "Koreksi pembimbing utama" }));
    assert.equal(fixture.tables.bimbingan[0].idDosenPembimbing, 7n);
    assert.equal(fixture.tables.dokumenVerifikasi.find((d) => d.penandatanganUserId === 2n)!.status, "dicabut");
    assert.ok(fixture.tables.bimbingan[0].pembatalanP1); assert.ok(fixture.tables.logSuperAdmin.length);
  });
  await t.test("rollback audit menjalankan pembatalan akun, berkas, jadwal dan profil tanpa menghapus histori", async () => {
    reset();
    const reverse = async (action: string, entity: string, detail: object = {}) => {
      const log = await fixture.db.logAktivitas.create({ data: { penggunaId: 6n, aksi: action, entitasTerkait: entity, detail, status: "aktif" } });
      const input = { logId: String(log.id), cancellerId: "6", confirmation: "BATALKAN", reason: "Pembatalan aksi pengujian historis" };
      await assert.rejects(run(6, (c) => rollbackAudit(c, input)), /superadmin/);
      await run(8, (c) => rollbackAudit(c, input));
      const saved = fixture.tables.logAktivitas.find((l) => l.id === log.id)!;
      assert.equal(saved.status, "dibatalkan"); assert.equal(saved.dibatalkanOlehId, 6n); assert.equal(saved.pelakuAsliId, 8n);
      await assert.rejects(run(8, (c) => rollbackAudit(c, input)), /sudah dibatalkan/);
    };
    await reverse("approve_akun", "pengguna:9");
    assert.equal(fixture.tables.pengguna.find((u) => u.id === 9n)!.statusAkun, "menunggu_persetujuan");
    assert.ok(!fixture.tables.authSession.some((s) => s.penggunaId === 9n));
    await reverse("verifikasi_pembayaran_disetujui", "administrasi:90");
    assert.equal(fixture.tables.verifikasiPembayaran[0].statusVerifikasi, "menunggu_verifikasi");
    await reverse("judul_approve", "judul:20"); assert.equal(fixture.tables.pengajuanJudul[0].status, "diajukan");
    fixture.tables.pengajuanJudul[0].status = "disetujui";
    fixture.tables.dokumenVerifikasi.push({ id: 4000n, jenisDokumen: "acc", idBimbingan: 30n, idSempro: 40n, status: "sah" });
    await reverse("terbit_acc_sempro", "DokumenVerifikasi #4000");
    assert.equal(fixture.tables.dokumenVerifikasi.find((d) => d.id === 4000n)!.status, "dicabut");
    fixture.tables.jadwalBimbingan.push({ id: 4001n, status: "selesai", deletedAt: null, bimbinganId: 30n });
    await reverse("selesaikan_jadwal_bimbingan", "jadwal:4001", { before: { status: "dikonfirmasi_mahasiswa" } });
    assert.equal(fixture.tables.jadwalBimbingan[0].status, "dikonfirmasi_mahasiswa");
    await reverse("update_profil", "pengguna:2", { before: "Nama Dosen Sebelumnya", after: "Aktor 2" });
    assert.equal(fixture.tables.pengguna.find((u) => u.id === 2n)!.nama, "Nama Dosen Sebelumnya");
    fixture.tables.pengajuanPerubahanJudul.push({ id: 4002n, bimbinganId: 30n, status: "disetujui", judulLama: "Judul lama", matriksLama: {} });
    await reverse("setujui_perubahan_judul", "Pengajuan Perubahan Judul #4002");
    assert.equal(fixture.tables.pengajuanJudul[0].judul, "Judul lama");
    assert.equal(fixture.tables.pengajuanPerubahanJudul[0].status, "menunggu_kaprodi");
    await reverse("penetapan_dosen_pembimbing", "bimbingan:30");
    assert.equal(fixture.tables.bimbingan.length, 1); assert.equal(fixture.tables.bimbingan[0].idDosenPembimbing, null);
    assert.ok(fixture.tables.bimbingan[0].pembatalanP1);
  });
  await t.test("rollback audit menolak log stale dan dispensasi dengan hasil resmi; kegagalan mempertahankan status log", async () => {
    reset();
    const log = await fixture.db.logAktivitas.create({ data: { aksi: "judul_approve", entitasTerkait: "judul:20", status: "aktif" } });
    await fixture.db.logAktivitas.create({ data: { aksi: "penetapan_berikutnya", entitasTerkait: "judul:20", status: "aktif" } });
    const input = { logId: String(log.id), cancellerId: "6", confirmation: "BATALKAN", reason: "Pembatalan riwayat yang berubah" };
    await assert.rejects(run(8, (c) => rollbackAudit(c, input)), /lebih baru/);
    assert.equal(fixture.tables.logAktivitas.find((l) => l.id === log.id)!.status, "aktif");
    const dispensation = await fixture.db.dispensasiKehadiranSempro.create({ data: { pendaftaranSemproId: 40n, mahasiswaId: 1n, status: "disetujui", alasan: "Sakit", syaratSaatPengajuan: 5, terkumpulSaatPengajuan: 3 } });
    const dlog = await fixture.db.logAktivitas.create({ data: { aksi: "setujui_dispensasi_kehadiran", entitasTerkait: `Dispensasi #${dispensation.id}`, status: "aktif" } });
    await assert.rejects(run(8, (c) => rollbackAudit(c, { ...input, logId: String(dlog.id) })), /berita acara/);
    fixture.tables.beritaAcara[0].hasil = null; fixture.tables.pendaftaranSempro[0].dispensasiId = dispensation.id;
    await run(8, (c) => rollbackAudit(c, { ...input, logId: String(dlog.id) }));
    assert.equal(fixture.tables.dispensasiKehadiranSempro[0].status, "menunggu");
    assert.equal(fixture.tables.pendaftaranSempro[0].dispensasiId, null);
  });
  await t.test("tidak lulus memblokir pendaftaran ulang siklus sama; siklus lama hanya baca", async () => {
    reset(); await result("tidak_lulus");
    await assert.rejects(run(1, (c) => submit(c, { id: sidangId() })), /diajukan/);
    fixture.tables.bimbingan[0].siklusKe = 2; fixture.tables.pengajuanJudul[0].siklusKe = 2;
    await assert.rejects(run(1, (c) => sidangRecord(c, BigInt(sidangId()))), /sebelumnya/);
    await run(1, (c) => sidangRecord(c, BigInt(sidangId()), false));
  });
  await t.test("permohonan perubahan versi menolak keputusan sendiri dan menyimpan riwayat keputusan", async () => {
    reset(); await scheduled();
    await run(3, (c) => requestChange(c, { ...values(), jenis: "ubah_jadwal", reason: "Jadwal dosen berbenturan", slots: [{ tanggal: "2026-11-09", mulai: "13:00", selesai: "14:30", ruang: "Ruang B" }] }));
    const requestId = String(fixture.tables.permohonanSidang[0].id);
    await assert.rejects(run(3, (c) => decideRequest(c, { requestId, status: "disetujui", reason: "Setujui sendiri" })), /Kewenangan/);
    await run(6, (c) => decideRequest(c, { requestId, status: "disetujui", reason: "Disepakati oleh program studi", slotIndex: 0 }));
    assert.equal(fixture.tables.permohonanSidang[0].status, "disetujui"); assert.equal(fixture.tables.jadwalSidang[0].versi, 2);
  });
  await t.test("retry paralel menggunakan satu receipt, gagal audit rollback seluruh perubahan", async () => {
    reset(); const key = randomUUID();
    await Promise.all([run(1, initialize, key), run(1, initialize, key)]);
    assert.equal(fixture.tables.pendaftaranSidang.length, 1); assert.equal(fixture.tables.academicReceipt.length, 1);
    await assert.rejects(run(9, initialize, key), /Kunci/);
    const auditStore = fixture.db.logAktivitas as unknown as { create: unknown };
    const createAudit = auditStore.create;
    auditStore.create = async () => { throw new Error("audit unavailable"); };
    await assert.rejects(run(1, (c) => updateChecklist(c, { id: sidangId(), nomorItem: 11, centang: "true" }, {})), /audit unavailable/);
    auditStore.create = createAudit;
    assert.equal(fixture.tables.checklistDokumen.find((i) => i.nomorItem === 11)!.statusItem, "kosong");
  });
  await t.test("perubahan peran mempertahankan profil tetapi menutup kewenangan dewan", async () => {
    reset(); await scheduled(); const stored = fixture.tables.pengguna.find((u) => u.id === 3n)!; stored.role = "admin_keuangan";
    const record = await run(1, (c) => sidangRecord(c, BigInt(sidangId())));
    assert.ok(!canRead({ actor: stored as unknown as typeof fixture.users[0], role: "admin_keuangan" }, record as Awaited<ReturnType<typeof sidangRecord>>));
    await assert.rejects(run(3, (c) => confirm(c, { ...values(), status: "bersedia" })), /dosen aktif/);
  });
  await t.test("pengumuman publik/bertarget, jadwal, notifikasi sekali dan status baca memakai transaksi", async () => {
    reset(); const input = { judul: "Jadwal sidang November", isi: "Informasi <script>alert(1)</script> tetap teks.", kategori: "jadwal", targetPeran: ["mahasiswa"], publik: "false", status: "terbit" };
    await assert.rejects(run(1, (c) => saveAnnouncement(c, input, {})), /Kewenangan/);
    await run(6, (c) => saveAnnouncement(c, input, { file: upload }));
    const id = String(fixture.tables.pengumuman[0].id), notifications = fixture.tables.notification.length;
    await run(6, (c) => saveAnnouncement(c, { ...input, id }, {})); assert.equal(fixture.tables.notification.length, notifications);
    await run(6, (c) => saveAnnouncement(c, { ...input, id, kirimUlang: "true" }, {})); assert.equal(fixture.tables.notification.length, notifications * 2);
    await run(1, (c) => readAnnouncement(c, { id })); await run(1, (c) => readAnnouncement(c, { id })); assert.equal(fixture.tables.pengumumanDibaca.length, 1);
    await assert.rejects(run(3, (c) => readAnnouncement(c, { id })), /tersedia/);
    await run(6, (c) => saveAnnouncement(c, { ...input, judul: "Terjadwal besok", status: "draft", mulai: "2026-11-09T10:00" }, {}));
    await run(6, processScheduled); assert.equal(fixture.tables.pengumuman[1].status, "draft");
    t.mock.timers.setTime(new Date("2026-11-09T02:00Z").getTime()); await run(6, processScheduled); assert.equal(fixture.tables.pengumuman[1].status, "terbit");
  });
  await t.test("indikator dashboard memakai versi konfirmasi saat ini dan kewenangan penilai/reviewer", async () => {
    reset(); await scheduled();
    fixture.tables.konfirmasiJadwalSidang.push({ id: 9999n, jadwalSidangId: BigInt(jadwalId()), dosenId: 3n, versi: 0, status: "menunggu" });
    let indicators = await dashboardIndicators(session(actor(3)));
    assert.equal(indicators.find((i) => i.label === "Konfirmasi sidang menunggu")?.count, 0);
    assert.equal(indicators.find((i) => i.label === "Nilai sidang belum dikirim")?.count, 1);
    indicators = await dashboardIndicators(session(actor(5)));
    assert.equal(indicators.find((i) => i.label === "Nilai sidang belum dikirim")?.count, 0);
    reset(); await result(); await run(1, (c) => uploadRevision(c, values(), { file: upload }));
    indicators = await dashboardIndicators(session(actor(3)));
    assert.equal(indicators.find((i) => i.label === "Naskah revisi menunggu persetujuan")?.count, 1);
    indicators = await dashboardIndicators(session(actor(2)));
    assert.equal(indicators.find((i) => i.label === "Naskah revisi menunggu persetujuan")?.count, 0);
  });
  await t.test("dashboard progres, kuota, sasaran pengumuman dan kesehatan berasal dari data sesuai peran", async () => {
    reset();
    const initial = await studentOverview(session(actor(1)));
    assert.equal(initial?.steps.length, 7); assert.equal(initial?.steps[4].status, "aktif");
    assert.equal(await studentOverview(session(actor(3))), null);
    fixture.tables.logbookBimbingan.push({ id: 2000n, idBimbingan: 30n, idDosen: 2n, statusSelesai: false, isDibatalkan: false });
    const lecturer = await lecturerOverview(session(actor(2)));
    assert.equal(lecturer?.total, 1); assert.equal(lecturer?.quota, 10); assert.equal(lecturer?.logs, 1);
    assert.equal(await lecturerOverview(session(actor(10))), null);
    assert.equal(await managementOverview(session(actor(1))), null);
    assert.equal(await systemOverview(session(actor(3))), null);
    assert.equal(await administrationOverview(session(actor(3))), null);
    assert.equal((await administrationOverview(session(actor(10))))?.verified, 1);
    await run(6, (c) => saveAnnouncement(c, { judul: "Hanya mahasiswa", isi: "Informasi akademik semester ini", kategori: "akademik", targetPeran: ["mahasiswa"], status: "terbit" }, {}));
    assert.equal((await commonOverview(session(actor(1)))).announcements.length, 1);
    assert.equal((await commonOverview(session(actor(3)))).announcements.length, 0);
    fixture.tables.pengaturanSistem.push({ kunci: "scheduler_last_heartbeat", nilai: new Date().toISOString() });
    const system = await systemOverview(session(actor(8)));
    assert.ok(system?.healthy); assert.equal(system?.users.find((u) => u.role === "mahasiswa")?.active, 2);
    const management = await managementOverview(session(actor(6)));
    assert.ok(management?.lecturers.length); assert.equal(management?.funnel[0].count, 1);
    await result("lulus");
    assert.equal((await studentOverview(session(actor(1))))?.steps[6].status, "selesai");
  });
  await t.test("pengingat H-7/H-3/H-1 idempoten per versi dan hanya dikirim untuk jadwal aktif", async () => {
    reset(); await scheduled();
    fixture.tables.jadwalSidang[0].tanggal = new Date("2026-11-16");
    await assert.rejects(run(1, processReminders), /Kewenangan/);
    const before = fixture.tables.notification.length;
    await run(6, processReminders); assert.equal(fixture.tables.notification.length - before, 5);
    await run(6, processReminders); assert.equal(fixture.tables.notification.length - before, 5);
    fixture.tables.jadwalSidang[0].status = "dibatalkan";
    fixture.tables.jadwalSidang[0].tanggal = new Date("2026-11-12");
    await run(6, processReminders); assert.equal(fixture.tables.notification.length - before, 5);
  });
  await t.test("endpoint PDF memeriksa pemilik, revisi selesai, rekap pengelola dan pencabutan", async () => {
    reset(); await result();
    await run(6, (c) => saveAnnouncement(c, { judul: "Lampiran publik", isi: "Lampiran informasi akademik", kategori: "umum", targetPeran: ["mahasiswa"], status: "terbit", publik: "true" }, { file: upload }));
    const nextHeaders = createRequire(import.meta.url)("next/headers") as typeof import("next/headers");
    const oldCookies = nextHeaders.cookies;
    let token = "1".repeat(64);
    nextHeaders.cookies = (async () => ({ get: () => ({ value: token }) })) as unknown as typeof nextHeaders.cookies;
    t.after(() => { nextHeaders.cookies = oldCookies; });
    for (const id of [1, 3, 6, 9]) fixture.tables.authSession.find((s) => s.penggunaId === BigInt(id))!.tokenHash = tokenHash(String(id).repeat(64));
    const { GET } = await import("../src/app/api/sidang/dokumen/[token]/route");
    const minutes = fixture.tables.dokumenVerifikasi.find((d) => d.jenisDokumen === "berita_acara_sidang")!;
    const summary = fixture.tables.dokumenVerifikasi.find((d) => d.jenisDokumen === "rekap_nilai_sidang")!;
    const request = new Request("http://localhost/api/sidang/dokumen/test");
    const get = (doc: Record<string, unknown>) => GET(request, { params: Promise.resolve({ token: String(doc.token) }) });
    assert.equal((await get(minutes)).status, 404); // student still revising
    assert.equal((await get(summary)).status, 404);
    fixture.tables.beritaAcara.find((b) => b.idJadwalSidang)!.statusRevisi = "revisi_selesai";
    const response = await get(minutes); assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.ok(Buffer.from(await response.arrayBuffer()).toString("latin1").includes("BERITA ACARA SIDANG"));
    token = "9".repeat(64); assert.equal((await get(minutes)).status, 404);
    token = "6".repeat(64); assert.equal((await get(summary)).status, 200);
    const files = await import("../src/app/api/sidang/file/[kind]/[id]/route");
    const checklist = fixture.tables.checklistDokumen.find((i) => i.nomorItem === 1)!;
    const fileRequest = new Request(`http://localhost/api/sidang/file/checklist/${checklist.id}`);
    assert.equal((await files.GET(fileRequest, { params: Promise.resolve({ kind: "checklist", id: String(checklist.id) }) })).status, 200);
    token = "9".repeat(64);
    assert.equal((await files.GET(fileRequest, { params: Promise.resolve({ kind: "checklist", id: String(checklist.id) }) })).status, 404);
    token = "6".repeat(64);
    const templates = await import("../src/app/sidang/templates/[kind]/route");
    for (const kind of ["acc", "undangan", "form-nilai", "rekap", "berita-acara"]) {
      const template = await templates.GET(new Request("http://localhost/sidang/templates/test?download=1"), { params: Promise.resolve({ kind }) });
      assert.equal(template.status, 200); assert.equal(template.headers.get("Content-Type"), "application/pdf");
      assert.match(template.headers.get("Content-Disposition") ?? "", /^attachment;/);
      assert.ok(Buffer.from(await template.arrayBuffer()).subarray(0, 5).equals(Buffer.from("%PDF-")));
    }
    assert.equal((await templates.GET(request, { params: Promise.resolve({ kind: "__proto__" }) })).status, 404);
    const { storePrivateUpload } = await import("../src/lib/academic/files");
    const revisionPath = await storePrivateUpload(upload, "revisi_sempro");
    const semproRevision = await fixture.db.revisiDokumen.create({ data: { tipe: "sempro", beritaAcaraId: 60n, mahasiswaId: 1n, versi: 1, fileDraft: revisionPath } });
    const semproFiles = await import("../src/app/sempro/revisi-draft/[id]/route");
    const revisionParams = { params: Promise.resolve({ id: String(semproRevision.id) }) };
    token = "1".repeat(64); assert.equal((await semproFiles.GET(request, revisionParams)).status, 200);
    token = "9".repeat(64); assert.equal((await semproFiles.GET(request, revisionParams)).status, 404);
    token = "3".repeat(64); assert.equal((await semproFiles.GET(request, revisionParams)).status, 200);
    assert.equal((await semproFiles.GET(request, { params: Promise.resolve({ id: "9223372036854775808" }) })).status, 404);
    const attachments = await import("../src/app/api/pengumuman/[id]/lampiran/route");
    const announcementId = String(fixture.tables.pengumuman[0].id), attachmentParams = { params: Promise.resolve({ id: announcementId }) };
    token = ""; assert.equal((await attachments.GET(request, attachmentParams)).status, 200);
    fixture.tables.pengumuman[0].isPublik = false;
    assert.equal((await attachments.GET(request, attachmentParams)).status, 404);
    token = "1".repeat(64); assert.equal((await attachments.GET(request, attachmentParams)).status, 200);
    token = "3".repeat(64); assert.equal((await attachments.GET(request, attachmentParams)).status, 404);
    token = "6".repeat(64);
    fixture.tables.dokumenVerifikasi.find((d) => d.id === minutes.id)!.status = "dicabut";
    assert.equal((await get(minutes)).status, 410);
    const legacy = await import("../src/app/api/sempro/dokumen/[token]/route");
    assert.equal((await legacy.GET(request as unknown as Parameters<typeof legacy.GET>[0], { params: Promise.resolve({ token: String(summary.token) }) })).status, 404);
  });
  await t.test("Server Action memeriksa Origin dan mengirim hasil inisialisasi yang dapat dipakai UI", async () => {
    reset();
    const nextHeaders = createRequire(import.meta.url)("next/headers") as typeof import("next/headers");
    const oldHeaders = nextHeaders.headers, oldCookies = nextHeaders.cookies, oldOrigin = process.env.APP_ORIGIN;
    const cacheMock = mock.module("next/cache", { exports: { revalidatePath: () => {} } });
    t.after(() => { cacheMock.restore(); nextHeaders.headers = oldHeaders; nextHeaders.cookies = oldCookies;
      if (oldOrigin === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = oldOrigin; });
    process.env.APP_ORIGIN = "http://localhost:3106";
    let origin = "https://foreign.invalid";
    nextHeaders.headers = (async () => new Headers({ origin })) as unknown as typeof nextHeaders.headers;
    let token = "1".repeat(64);
    nextHeaders.cookies = (async () => ({ get: () => ({ value: token }) })) as unknown as typeof nextHeaders.cookies;
    fixture.tables.authSession[0].tokenHash = tokenHash(token);
    const { sidangAction } = await import("../src/app/actions/sidang");
    const form = new FormData(); form.set("command", "initialize"); form.set("key", randomUUID());
    assert.match((await sidangAction({}, form)).error ?? "", /diverifikasi/); assert.equal(fixture.tables.pendaftaranSidang.length, 0);
    origin = "http://localhost:3106";
    const response = await sidangAction({}, form); assert.equal(response.success, "Perubahan tersimpan."); assert.equal(response.id, sidangId());
    fixture.tables.authSession[0].tokenHash = "1".padStart(64, "0");
    await scheduled();
    token = "3".repeat(64); fixture.tables.authSession.find((s) => s.penggunaId === 3n)!.tokenHash = tokenHash(token);
    const alternatives = new FormData();
    for (const [key, value] of Object.entries({ command: "request-change", key: randomUUID(), ...values(), jenis: "ubah_jadwal", reason: "Jadwal perlu usulan alternatif", tanggal: "2026-11-10", mulai: "09:00", selesai: "10:30", ruang: "Ruang B", tanggal2: "2026-11-11", mulai2: "09:00", selesai2: "10:30", ruang2: "Ruang B", tanggal3: "2026-11-12", mulai3: "10:00", selesai3: "11:30", ruang3: "Ruang C" })) alternatives.set(key, value);
    assert.equal((await sidangAction({}, alternatives)).success, "Perubahan tersimpan.");
    assert.equal((fixture.tables.permohonanSidang[0].slotUsulan as unknown[]).length, 3);
  });
  await t.test("PDF naskah panjang menambah halaman dengan xref dan isi akhir tetap tersimpan", () => {
    const marker = "AKHIR_CATATAN_REVISI";
    const pdf = renderSidangPdf({ jenisDokumen: "berita_acara_sidang", token: "a".repeat(48), nomorSurat: "001-d/UTS",
      status: "sah", versi: 1, namaPenandatangan: "Kaprodi", snapshotJson: { mahasiswaNama: "Mahasiswa", judul: "Judul penelitian",
        hasil: "lulus_revisi", nilai: "80", catatan: `${"Catatan metodologi panjang. ".repeat(180)} ${marker}` } });
    const bytes = pdf.toString("latin1"); assert.ok(bytes.includes(marker)); assert.ok(!bytes.includes("/Count 1 >>"));
    for (const match of bytes.matchAll(/(\d+) 0 obj/g)) assert.ok(Number(match[1]) > 0);
    const xref = Number(bytes.match(/startxref\n(\d+)/)?.[1]); assert.equal(bytes.slice(xref, xref + 4), "xref");
  });
});
