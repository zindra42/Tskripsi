import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as React from "react";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { Account } from "../src/lib/accounts/store";
import type { AuthenticatedSession } from "../src/lib/auth/session";
import type { Context, Input } from "../src/lib/academic/store";
import { preprocess, jaccard, similarity, similarityWarning, recommendationScore } from "../src/lib/academic/similarity";
import { stemWord } from "../src/lib/academic/stemmer";
import legacyStems from "./fixtures/legacy-corpus-stems.json";
import { administrationValid, periodCode, witaDate } from "../src/lib/academic/policy";
import type { VerifikasiPembayaran } from "../src/generated/prisma/client";
import { tokenHash } from "../src/lib/auth/tokens";

type Row = Record<string, unknown>;
const clone = <T>(value: T): T => structuredClone(value);
const row = (value: unknown) => value as Row;

function user(id: bigint, role: Account["role"]): Account {
  return { id, role, nama: `User ${id}`, email: `user${id}@example.invalid`, emailArsip: null, statusAkun: "aktif", deletedAt: null,
    authVersion: 0, wajibGantiPassword: false, catatanPenolakan: null, dibuatOlehSuperAdmin: false,
    mahasiswa: role === "mahasiswa" ? { penggunaId: id, nim: `22001${id}`, nimArsip: null, semester: 9, prodi: "Informatika", noHp: null, createdAt: null, updatedAt: null } : null,
    dosen: ["dosen", "kaprodi", "sekpro"].includes(role) ? { penggunaId: id, nidn: `12345${id}`, nidnArsip: null, noHp: null, kuotaBimbingan: 1, prodi: "Informatika",
      isKaprodi: role === "kaprodi", isSekpro: role === "sekpro", keahlian: [], createdAt: null, updatedAt: null } : null };
}

function session(actor: Account): AuthenticatedSession {
  return { tokenHash: `session-${actor.id}`, publicId: randomUUID(), penggunaId: actor.id, activeRole: actor.role, authVersion: 0,
    remember: false, expiresAt: new Date(Date.now() + 86400000), lastActivity: new Date(), createdAt: new Date(), user: actor, pengguna: actor };
}

// This adapter verifies service behavior and transaction boundaries. PostgreSQL locks and FK execution need integration verification.
function synthetic(users: Account[]) {
  const tables: Record<string, Row[]> = {};
  for (const name of ["pengguna", "mahasiswa", "authSession", "pengaturanSistem", "dosen", "bidangKeahlian", "pengajuanJudul", "bimbingan", "logbookBimbingan", "pengajuanPerubahanJudul", "jadwalBimbingan", "dokumenVerifikasi", "verifikasiPembayaran", "arsipJudulSkripsi", "notification", "academicReceipt", "logAktivitas", "logSuperAdmin"]) tables[name] = [];
  tables.pengguna = users.map((item) => row(clone(item)));
  tables.mahasiswa = users.filter((item) => item.mahasiswa).map((item) => row(clone(item.mahasiswa)));
  tables.authSession = users.map((item) => row(session(item)));
  tables.dosen = users.filter((item) => item.dosen).map((item) => row(clone(item.dosen)));
  tables.bidangKeahlian = [{ id: 1n, namaBidang: "Data" }, { id: 2n, namaBidang: "Jaringan" }];
  tables.pengaturanSistem = Object.entries({ periode_pengajuan_judul_mulai: "2000-01-01", periode_pengajuan_judul_selesai: "2099-12-31", periode_akademik_mulai: "2000-01-01", periode_akademik_selesai: "2099-12-31", minimal_sesi_bimbingan_acc_sempro: "2", minimal_sesi_bimbingan_skripsi: "2" }).map(([kunci, nilai]) => ({ kunci, nilai }));
  let sequence = 100n;
  let queue = Promise.resolve();
  const queries: string[] = [];
  function hydrate(name: string, item: Row): Row {
    const find = (table: string, id: unknown) => tables[table].find((candidate) => candidate.id === id);
    if (name === "pengajuanJudul") return { ...item, mahasiswa: hydrate("pengguna", find("pengguna", item.idMahasiswa)!), bimbingan: tables.bimbingan.find((candidate) => candidate.idPengajuan === item.id) ?? null };
    if (name === "bimbingan") return { ...item, pengajuan: hydrate("pengajuanJudul", find("pengajuanJudul", item.idPengajuan)!),
      pembimbing1: find("pengguna", item.idDosenPembimbing), pembimbing2: find("pengguna", item.idDosenPembimbing2),
      logbook: tables.logbookBimbingan.filter((candidate) => candidate.idBimbingan === item.id),
      schedules: tables.jadwalBimbingan.filter((candidate) => candidate.bimbinganId === item.id),
      changes: tables.pengajuanPerubahanJudul.filter((candidate) => candidate.bimbinganId === item.id),
      documents: tables.dokumenVerifikasi.filter((candidate) => candidate.idBimbingan === item.id),
    };
    if (name === "authSession") return { ...item, pengguna: find("pengguna", item.penggunaId) };
    if (name === "dosen") return { ...item, pengguna: find("pengguna", item.penggunaId) };
    if (name === "mahasiswa") return { ...item, pengguna: find("pengguna", item.penggunaId) };
    if (name === "pengguna") return { ...item, dosen: tables.dosen.find((candidate) => candidate.penggunaId === item.id) ?? item.dosen ?? null, mahasiswa: tables.mahasiswa.find((candidate) => candidate.penggunaId === item.id) ?? item.mahasiswa ?? null };
    return item;
  }
  function matches(item: Row, where: Row = {}): boolean {
    return Object.entries(where).every(([key, expected]) => {
      if (expected === undefined) return true;
      if (key === "OR") return (expected as Row[]).some((condition) => matches(item, condition));
      if (key === "NOT") return !matches(item, row(expected));
      if (key === "AND") return (expected as Row[]).every((condition) => matches(item, condition));
      const actual = item[key];
      if (expected && typeof expected === "object" && !(expected instanceof Date)) {
        const condition = row(expected);
        if ("in" in condition) return (condition.in as unknown[]).includes(actual);
        if ("not" in condition) return actual !== condition.not;
        if ("isNot" in condition) return actual !== condition.isNot;
        if ("contains" in condition) return String(actual ?? "").includes(String(condition.contains));
        if ("gt" in condition) return (actual as Date) > (condition.gt as Date);
        if ("lt" in condition) return Number(actual) < Number(condition.lt);
        return Boolean(actual && matches(row(actual), condition));
      }
      return actual === expected;
    });
  }
  function update(item: Row, data: Row) {
    for (const [key, value] of Object.entries(data)) if (value !== undefined) item[key] = value && typeof value === "object" && "increment" in value ? Number(item[key]) + Number(row(value).increment) : value;
    return clone(item);
  }
  const db: Row = {};
  for (const name of Object.keys(tables)) {
    const find = (args: Row = {}) => {
      const found = tables[name].filter((item) => matches(hydrate(name, item), args.where as Row));
      if (args.orderBy) {
        const [key, order] = Object.entries(row(args.orderBy))[0];
        found.sort((a, b) => (a[key] === b[key] ? 0 : a[key]! > b[key]! ? 1 : -1) * (order === "desc" ? -1 : 1));
      }
      return found;
    };
    const unique = async (args: Row) => { const item = find(args)[0]; return item ? clone(hydrate(name, item)) : null; };
    db[name] = {
      findUnique: unique, findFirst: unique,
      findUniqueOrThrow: async (args: Row) => { const found = await unique(args); assert.ok(found); return found; },
      findMany: async (args: Row = {}) => find(args).map((item) => clone(hydrate(name, item))), count: async (args: Row) => find(args).length,
      create: async ({ data }: { data: Row }) => {
        const defaults = name === "pengajuanJudul" ? { deletedAt: null, isDiarsipkan: false, status: "diajukan", statusDraft: "draft", counterPengajuan: 0, siklusKe: 1 }
          : name === "bimbingan" ? { idDosenPembimbing: null, idDosenPembimbing2: null, siklusKe: 1, faseSkripsiAt: null }
            : name === "logbookBimbingan" ? { isDibatalkan: false, siklusKe: 1, statusSelesai: false }
              : name === "jadwalBimbingan" ? { deletedAt: null } : name === "pengajuanPerubahanJudul" ? { disetujuiDospem1: null, disetujuiDospem2: null, konfirmasiDospem1At: null, konfirmasiDospem2At: null } : name === "verifikasiPembayaran" ? { revision: 1 } : {};
        const item = { id: ++sequence, ...defaults, ...data };
        tables[name].push(item);
        return clone(item);
      },
      createMany: async ({ data }: { data: Row[] }) => {
        for (const entry of data) tables[name].push({ id: ++sequence, ...entry });
        return { count: data.length };
      },
      deleteMany: async (args: Row = {}) => {
        const found = find(args);
        tables[name] = tables[name].filter((item) => !found.includes(item));
        return { count: found.length };
      },
      update: async (args: Row) => { const item = find(args)[0]; assert.ok(item, `Missing ${name}`); return update(item, row(args.data)); },
      updateMany: async (args: Row) => { const found = find(args); found.forEach((item) => update(item, row(args.data))); return { count: found.length }; },
    };
  }
  db.$transaction = async (work: (tx: Row) => Promise<unknown>) => {
    let release: (() => void) | undefined;
    let snapshot: typeof tables | undefined;
    const tx = { ...db, $queryRaw: async (strings: TemplateStringsArray) => {
      queries.push(strings.join("?"));
      if (strings[0].includes("pg_advisory_xact_lock")) {
        const previous = queue;
        queue = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        snapshot = clone(tables);
      }
      return [];
    } };
    try { return await work(tx); }
    catch (error) { if (snapshot) for (const name of Object.keys(tables)) tables[name] = snapshot[name]; throw error; }
    finally { release?.(); }
  };
  return { db: db as unknown as PrismaClient, tables, queries };
}

test("preprocessing dan Jaccard mengikuti contoh sumber Indonesia", () => {
  assert.deepEqual(preprocess("pengembangan pembelajaran mengajar"), ["kembang", "ajar"]);
  assert.deepEqual(preprocess("sistem untuk manajemen dan pengolahan data", true), ["sistem", "manajemen", "olah", "data"]);
  assert.ok(preprocess("Sistem Informasi Manajemen Skripsi Berbasis Web dengan Metode Agile").includes("bas"));
  assert.deepEqual(preprocess("sistem a INFORMASI, sistem"), ["sistem", "informasi"]);
  assert.deepEqual(preprocess("   "), []);
  assert.equal(jaccard(["a", "b"], ["b", "c"]), 33);
  assert.equal(jaccard([], ["a"]), 0);
  const title = "Rancang Bangun Sistem Informasi Pendaftaran Seminar Berbasis Web";
  const corpus = [{ id: 9007199254740993n, judul: title, namaPenulis: "Penulis", nim: "211001062", tahun: "2025", prodi: "Informatika", keywords: JSON.stringify(preprocess(title, true)) }];
  const result = similarity(title, corpus);
  assert.equal(result.skor, 100);
  assert.equal(result.top[0].id, "9007199254740993");
  assert.equal(recommendationScore("sistem Data", [1n], [{ bidangId: 1n, bidang: { namaBidang: "Data" } }]), 10);
});

test("periode WITA dan validitas verifikasi ulang legacy", () => {
  assert.equal(witaDate(new Date("2026-11-06T16:00:00Z")), "2026-11-07");
  const settings = { periode_akademik_mulai: "2026-08-01", periode_akademik_selesai: "2027-01-31" };
  const payment = { statusVerifikasi: "terverifikasi", perluVerifikasiUlang: false, periode: periodCode(settings), createdAt: new Date("2026-11-01T00:00:00Z") } as VerifikasiPembayaran;
  assert.ok(administrationValid(payment, settings, new Date("2026-11-07")));
  assert.ok(!administrationValid({ ...payment, perluVerifikasiUlang: true }, settings, new Date("2026-11-07")));
  assert.ok(administrationValid({ ...payment, periode: null }, settings, new Date("2026-11-07")));
  assert.ok(!administrationValid(payment, settings, new Date("2027-02-01")));
});

test("pasangan judul dan batas peringatan cocok dengan oracle PHP tanpa database", () => {
  const left = preprocess("Pengembangan Sistem Informasi Akademik Mahasiswa");
  const right = preprocess("Sistem Informasi Akademik Berbasis Web");
  assert.deepEqual(left, ["kembang", "sistem", "informasi", "akademik", "mahasiswa"]);
  assert.deepEqual(right, ["sistem", "informasi", "akademik", "bas", "web"]);
  assert.equal(jaccard(left, right), 43);
  assert.equal(jaccard(preprocess("Prediksi Penyakit Tanaman Menggunakan Jaringan Saraf"), preprocess("Sistem Informasi Pendaftaran Seminar")), 0);
  assert.equal(jaccard(preprocess("dan di ke untuk"), preprocess("pada yang oleh dalam")), 0);
  assert.equal(jaccard([], []), 0);
  assert.equal(similarityWarning(34, {}).high, false);
  assert.equal(similarityWarning(35, {}).high, true);
  assert.equal(similarityWarning(38, { threshold_peringatan_plagiasi: "40" }).high, false);
  assert.equal(similarityWarning(40, { threshold_peringatan_plagiasi: "40" }).high, true);
  assert.equal(similarityWarning(0, { threshold_peringatan_plagiasi: "0" }).high, true);
});

test("rekomendasi mempertahankan ID bidang, containment, overlap dan stopword sumber", () => {
  const expertise = [{ bidangId: 1n, bidang: { namaBidang: "Sistem Cerdas" } }, { bidangId: 2n, bidang: { namaBidang: "Analisis Data" } }];
  assert.equal(recommendationScore("Sistem Informasi", [], expertise), 0);
  assert.equal(recommendationScore("Sistem Cerdas Akademik", [], expertise), 10);
  assert.equal(recommendationScore("Prediksi Data Mahasiswa", [], expertise), 3);
  assert.equal(recommendationScore("Sistem Cerdas", [2n], expertise), 10);
  assert.equal(recommendationScore("Sistem Informasi", [3n], expertise), 0);
  assert.equal(recommendationScore("Sistem Informasi", [], expertise, "Prediksi Data", ""), 3);
});

test("1885 token corpus sesuai keluaran Sastrawi PHP 1.2.0 yang dikunci composer.lock", () => {
  for (const [word, expected] of Object.entries(legacyStems)) assert.equal(stemWord(word), expected, word);
});

test("alur akademik menjalankan layanan dan entry point aktual dengan database sintetis", async (t) => {
  const navigation = mock.module("next/navigation", { exports: { redirect: () => { throw new Error("redirect"); }, notFound: () => { throw new Error("notFound"); } } });
  t.after(() => navigation.restore());
  const { academicMutation, cancelSupervisor } = await import("../src/lib/academic/store");
  const { submitAdministration, decideAdministration, removeAdministrationFile, saveTitle, reviewTitle, assignSupervisors, checkSimilarity } = await import("../src/lib/academic/titles");
  const { addLog, updateLog, acc, saveSchedule, transitionSchedule } = await import("../src/lib/academic/guidance");
  const { submitChange, decideChange } = await import("../src/lib/academic/changes");
  const { validateUpload, readStoredFile } = await import("../src/lib/academic/files");
  const globalDb = globalThis as unknown as { siasDatabase?: PrismaClient };
  const previousDb = globalDb.siasDatabase;
  const previousStorage = process.env.SIAS_STORAGE_ROOT;
  const root = await mkdtemp(path.join(tmpdir(), "sias-academic-"));
  process.env.SIAS_STORAGE_ROOT = root;
  t.after(async () => { globalDb.siasDatabase = previousDb; process.env.SIAS_STORAGE_ROOT = previousStorage; if (previousStorage === undefined) delete process.env.SIAS_STORAGE_ROOT; await rm(root, { recursive: true, force: true }); });
  const actors = [user(1n, "mahasiswa"), user(2n, "kaprodi"), user(3n, "sekpro"), user(4n, "dosen"), user(5n, "dosen"), user(6n, "mahasiswa"), user(7n, "admin_keuangan")];
  let fixture = synthetic(actors);
  const reset = () => { fixture = synthetic(actors); globalDb.siasDatabase = fixture.db; };
  const run = async (actor: number, work: (context: Context) => Promise<void>, key = randomUUID(), input: Input = {}) => {
    await academicMutation(session(actors[actor]), key, "test", input, {}, work);
  };
  const matrix = [{ bidang_keahlian_id: "1", bidang_keahlian_2_id: "", variabel_penelitian: "Data mahasiswa", lokasi: "Sumbawa", metode: "Waterfall", instrumen: "Kuesioner", analisis_data: "Deskriptif" }];
  const titleInput = { judul: "Sistem Informasi Akademik Mahasiswa", matriks: matrix, preferensi: [] };
  const pdf = { bytes: Buffer.from("%PDF-1.7\nfixture"), extension: "pdf" };
  const title = () => fixture.tables.pengajuanJudul.find((item) => item.statusDraft === "diajukan" && !item.isDiarsipkan)!;
  const bimbingan = () => fixture.tables.bimbingan[0];
  async function establish(two = false) {
    reset();
    await run(0, (context) => submitAdministration(context, { namaPengirim: "Mahasiswa Sumbawa", tanggalTransfer: "2026-01-01" }, { kwitansi: pdf, transfer: pdf, krs: pdf }));
    await run(6, (context) => decideAdministration(context, { id: String(fixture.tables.verifikasiPembayaran[0].id), revision: "1" }, true));
    await run(0, (context) => saveTitle(context, titleInput, { proposal: pdf }, false));
    await run(1, (context) => reviewTitle(context, { id: String(title().id) }, "approve"));
    await run(1, (context) => assignSupervisors(context, { id: String(title().id), supervisors: two ? ["4", "5"] : ["4"] }));
  }

  await t.test("unggahan memeriksa ukuran, magic bytes, dan path traversal", async () => {
    assert.ok(await validateUpload(new File([pdf.bytes], "proposal.pdf"), true));
    assert.equal((await validateUpload(new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "foto.png", { type: "image/png" })))?.extension, "png");
    assert.equal((await validateUpload(new File([new Uint8Array([255, 216, 255])], "foto.jpg", { type: "image/jpeg" })))?.extension, "jpg");
    await assert.rejects(() => validateUpload(new File(["javascript"], "proposal.pdf"), true));
    await assert.rejects(() => validateUpload(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "foto.png")));
    await assert.rejects(() => readStoredFile("../secret"), /Path/);
    await assert.rejects(() => readStoredFile("C:/secret"), /Path/);
    await mkdir(path.join(root, "private", "proposal"), { recursive: true });
    await writeFile(path.join(root, "private", "proposal", "legacy.pdf"), pdf.bytes);
    assert.equal((await readStoredFile("proposal/legacy.pdf")).toString(), pdf.bytes.toString());
    process.env.SIAS_STORAGE_ROOT = path.join(process.cwd(), "public", "uploads");
    try { await assert.rejects(() => readStoredFile("proposal/legacy.pdf"), /direktori statis/); }
    finally { process.env.SIAS_STORAGE_ROOT = root; }
  });
  await t.test("penanganan streaming berkas aman createSecureFileResponse dan deteksi tipe", async () => {
    const { detectFileType, createSecureFileResponse } = await import("../src/lib/academic/files");
    const pdfBytes = Buffer.from("%PDF-1.4\ncontent");
    const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const jpgBytes = Buffer.from([255, 216, 255, 224, 0, 16]);
    const unknownBytes = Buffer.from("plain text content");

    assert.deepEqual(detectFileType(pdfBytes), { extension: "pdf", mime: "application/pdf" });
    assert.deepEqual(detectFileType(pngBytes), { extension: "png", mime: "image/png" });
    assert.deepEqual(detectFileType(jpgBytes), { extension: "jpg", mime: "image/jpeg" });
    assert.equal(detectFileType(unknownBytes), null);

    const resPdf = createSecureFileResponse(pdfBytes, "dokumen", { disposition: "inline" });
    assert.equal(resPdf.status, 200);
    assert.equal(resPdf.headers.get("Content-Type"), "application/pdf");
    assert.equal(resPdf.headers.get("Content-Disposition"), 'inline; filename="dokumen.pdf"');
    assert.equal(resPdf.headers.get("Cache-Control"), "private, no-store");
    assert.equal(resPdf.headers.get("X-Content-Type-Options"), "nosniff");

    const resPng = createSecureFileResponse(pngBytes, 'foto"test".png', { disposition: "attachment" });
    assert.equal(resPng.status, 200);
    assert.equal(resPng.headers.get("Content-Type"), "image/png");
    assert.equal(resPng.headers.get("Content-Disposition"), 'attachment; filename="foto_test_.png"');
    assert.equal(resPng.headers.get("X-Content-Type-Options"), "nosniff");

    const resErr = createSecureFileResponse(unknownBytes, "file.bin");
    assert.equal(resErr.status, 415);
    assert.equal(await resErr.text(), "Format berkas tidak didukung.");

    const resNotPdf = createSecureFileResponse(pngBytes, "draft.pdf", {
      allowedExtensions: ["pdf"],
      unsupportedMessage: "Format naskah tidak didukung.",
    });
    assert.equal(resNotPdf.status, 415);
    assert.equal(await resNotPdf.text(), "Format naskah tidak didukung.");

    const resFallback = createSecureFileResponse(unknownBytes, "lampiran", {
      disposition: "attachment",
      fallbackExtension: "bin",
      contentType: "application/octet-stream",
    });
    assert.equal(resFallback.status, 200);
    assert.equal(resFallback.headers.get("Content-Type"), "application/octet-stream");
    assert.equal(resFallback.headers.get("Content-Disposition"), 'attachment; filename="lampiran.bin"');
  });
  await t.test("memoization query master data dan parameter sistem getCachedSystemSettings getCachedActiveLecturers", async () => {
    reset();
    const { getCachedSystemSettings, getCachedActiveLecturers, getCachedLecturerOptions, getCachedMasterFields } = await import("../src/lib/support/master-data");
    const { titleOptions } = await import("../src/lib/academic/views");

    const settings = await getCachedSystemSettings();
    assert.equal(typeof settings, "object");
    assert.equal(settings.periode_pengajuan_judul_mulai, "2000-01-01");
    assert.equal(settings.minimal_sesi_bimbingan_acc_sempro, "2");

    const activeLecturers = await getCachedActiveLecturers();
    assert.ok(Array.isArray(activeLecturers));
    assert.ok(activeLecturers.length > 0);
    assert.ok(activeLecturers.every((l) => l.dosen !== null));

    const options = await getCachedLecturerOptions();
    assert.ok(Array.isArray(options));
    assert.equal(options.length, activeLecturers.length);
    assert.ok(options[0].id && options[0].nama);

    const fields = await getCachedMasterFields();
    assert.ok(Array.isArray(fields));
    assert.ok(fields.length >= 2);
    assert.ok(fields.some((f) => f.namaBidang === "Data"));

    const titleOpts = await titleOptions();
    assert.ok(Array.isArray(titleOpts.fields));
    assert.ok(Array.isArray(titleOpts.lecturers));
    assert.ok(titleOpts.fields.length >= 2);
  });
  await t.test("administrasi sampai ACC, audit dan notifikasi berada dalam transaksi", async () => {
    await establish(true);
    const b = bimbingan();
    await assert.rejects(() => run(3, (context) => acc(context, { id: String(b.id), fase: "sempro" }, false)), /minimum/);
    for (let i = 0; i < 2; i++) await run(0, (context) => addLog(context, { id: String(b.id), dosenId: "4", tanggal: "2026-11-01", fase: "sempro", catatan: "Pembahasan penelitian", selesai: true }));
    await run(3, (context) => acc(context, { id: String(b.id), fase: "sempro" }, false));
    await run(3, (context) => acc(context, { id: String(b.id), fase: "sempro" }, false));
    assert.equal(fixture.tables.dokumenVerifikasi.length, 1);
    assert.equal(fixture.tables.dokumenVerifikasi[0].status, "sah");
    assert.equal(String(fixture.tables.dokumenVerifikasi[0].token).length, 48);
    assert.ok(fixture.tables.logAktivitas.length >= 8);
    assert.ok(fixture.tables.notification.length >= 5);
    assert.ok(fixture.queries.some((query) => query.includes("pg_advisory_xact_lock")));
  });
  await t.test("hak lintas mahasiswa, dosen tanpa penugasan, dan mode dosen pimpinan ditolak", async () => {
    await establish();
    const id = String(bimbingan().id);
    await assert.rejects(() => run(5, (context) => addLog(context, { id, dosenId: "4", tanggal: "2026-11-01", fase: "sempro", catatan: "Sesi palsu", selesai: true })), /pembimbing/);
    await assert.rejects(() => run(4, (context) => acc(context, { id, fase: "sempro" }, false)), /pembimbing/);
    fixture.tables.authSession.find((item) => item.penggunaId === 2n)!.activeRole = "dosen";
    await assert.rejects(() => run(1, (context) => reviewTitle(context, { id: String(title().id), reason: "Revisi penelitian" }, "revise")), /mode peran/);
    assert.equal(fixture.tables.logbookBimbingan.length, 0);
  });
  await t.test("receipt retry paralel mencatat satu log dan konflik payload membatalkan mutasi", async () => {
    await establish();
    const id = String(bimbingan().id);
    const key = randomUUID();
    const input = { id, dosenId: "4", tanggal: "2026-11-01", fase: "sempro", catatan: "Pembahasan penelitian", selesai: true };
    await Promise.all([run(0, (context) => addLog(context, input), key, input), run(0, (context) => addLog(context, input), key, input)]);
    assert.equal(fixture.tables.logbookBimbingan.length, 1);
    await assert.rejects(() => run(0, (context) => addLog(context, input), key, { ...input, catatan: "diubah" }), /Kunci/);
    await assert.rejects(() => run(0, async (context) => { await addLog(context, input); throw new Error("rollback"); }), /rollback/);
    assert.equal(fixture.tables.logbookBimbingan.length, 1);
  });
  await t.test("kuota kedua slot dibatasi saat penetapan bersamaan", async () => {
    await establish(true);
    fixture.tables.pengajuanJudul.push({ ...clone(title()), id: 901n, idMahasiswa: 6n });
    const results = await Promise.allSettled([
      run(1, (context) => assignSupervisors(context, { id: "901", supervisors: ["5"] })),
      run(2, (context) => assignSupervisors(context, { id: "901", supervisors: ["4"] })),
    ]);
    assert.ok(results.every((result) => result.status === "rejected"));
    assert.equal(fixture.tables.bimbingan.length, 1);
  });
  await t.test("dua penetapan bersamaan memperebutkan satu kuota menghasilkan satu persetujuan", async () => {
    await establish();
    fixture.tables.pengguna.push(row(user(8n, "mahasiswa")));
    fixture.tables.pengajuanJudul.push({ ...clone(title()), id: 901n, idMahasiswa: 6n }, { ...clone(title()), id: 902n, idMahasiswa: 8n });
    const results = await Promise.allSettled([
      run(1, (context) => assignSupervisors(context, { id: "901", supervisors: ["5"] })),
      run(2, (context) => assignSupervisors(context, { id: "902", supervisors: ["5"] })),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(fixture.tables.bimbingan.filter((item) => item.idDosenPembimbing === 5n).length, 1);
  });
  await t.test("dua pengajuan bersamaan milik mahasiswa yang sama hanya membuat satu record", async () => {
    await establish();
    await run(1, (context) => cancelSupervisor(context, bimbingan().id as bigint, 1, "Pembimbing dilepas untuk pengajuan baru"));
    await run(1, (context) => reviewTitle(context, { id: String(title().id), reason: "Pengajuan lama dibatalkan" }, "cancel"));
    const outcomes = await Promise.allSettled([0, 1].map(() => run(0, (context) => saveTitle(context, titleInput, { proposal: pdf }, false))));
    assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(fixture.tables.pengajuanJudul.filter((item) => !item.deletedAt && !item.isDiarsipkan && item.statusDraft === "diajukan").length, 1);
  });
  await t.test("draft lebih baru tidak menutupi pengajuan yang sudah disetujui saat mahasiswa mengedit", async () => {
    await establish();
    await run(1, (context) => cancelSupervisor(context, bimbingan().id as bigint, 1, "Pembimbing perlu diganti"));
    const id = String(title().id);
    await run(1, (context) => reviewTitle(context, { id, reason: "Revisi penelitian mahasiswa" }, "revise"));
    await run(0, (context) => saveTitle(context, titleInput, {}, true));
    await run(1, (context) => reviewTitle(context, { id }, "approve"));
    await assert.rejects(() => run(0, (context) => saveTitle(context, titleInput, { proposal: pdf }, false)), /Pengajuan aktif/);
    assert.equal(fixture.tables.pengajuanJudul.filter((item) => item.statusDraft === "diajukan").length, 1);
  });
  await t.test("verifikasi ulang, periode tertutup, dan keuangan nonaktif menolak efek bisnis", async () => {
    await establish();
    const b = bimbingan();
    await run(1, (context) => cancelSupervisor(context, b.id as bigint, 1, "Pembimbing perlu diganti"));
    await run(1, (context) => reviewTitle(context, { id: String(title().id), reason: "Revisi penelitian mahasiswa" }, "revise"));
    const payment = fixture.tables.verifikasiPembayaran[0];
    payment.perluVerifikasiUlang = true;
    await assert.rejects(() => run(0, (context) => saveTitle(context, titleInput, { proposal: pdf }, false)), /Administrasi/);
    fixture.tables.verifikasiPembayaran[0].perluVerifikasiUlang = false;
    fixture.tables.pengaturanSistem.find((row) => row.kunci === "periode_pengajuan_judul_selesai")!.nilai = "2000-01-01";
    await assert.rejects(() => run(0, (context) => saveTitle(context, titleInput, { proposal: pdf }, false)), /Periode pengajuan/);
    const finance = fixture.tables.pengguna.find((row) => row.id === 7n)!;
    finance.statusAkun = "nonaktif"; finance.deletedAt = new Date();
    await assert.rejects(() => run(6, (context) => decideAdministration(context, { id: String(payment.id) }, true)), /Sesi/);
    assert.equal(fixture.tables.pengguna.find((row) => row.id === 7n)?.statusAkun, "nonaktif");
  });
  await t.test("receipt memulihkan hasil pengecekan dan menolak aktor, command serta unggahan berbeda", async () => {
    reset();
    const key = randomUUID();
    const input = { judul: titleInput.judul };
    const first = await academicMutation(session(actors[0]), key, "similarity", input, {}, (context) => checkSimilarity(context, input.judul));
    const retry = await academicMutation(session(actors[0]), key, "similarity", input, {}, () => { throw new Error("Replay must not execute"); });
    assert.deepEqual(retry, first);
    await assert.rejects(() => academicMutation(session(actors[5]), key, "similarity", input, {}, async () => {}), /Kunci/);
    await assert.rejects(() => academicMutation(session(actors[0]), key, "draft", input, {}, async () => {}), /Kunci/);
    const uploadKey = randomUUID();
    await academicMutation(session(actors[0]), uploadKey, "test", {}, { proposal: pdf }, async () => {});
    await assert.rejects(() => academicMutation(session(actors[0]), uploadKey, "test", {}, { proposal: { ...pdf, bytes: Buffer.from("%PDF-other") } }, async () => {}), /Kunci/);
  });
  await t.test("akun, sesi, versi autentikasi dan peran dibaca ulang sebelum mutasi maupun retry", async () => {
    reset();
    const key = randomUUID();
    await run(0, async () => {}, key);
    fixture.tables.pengguna[0].authVersion = 1;
    await assert.rejects(() => run(0, async () => {}, key), /Sesi/);
    reset();
    fixture.tables.authSession[0].expiresAt = new Date(0);
    await assert.rejects(() => run(0, async () => {}), /Sesi/);
    reset();
    fixture.tables.authSession = fixture.tables.authSession.filter((row) => row.penggunaId !== 1n);
    await assert.rejects(() => run(0, async () => {}), /Sesi/);
    reset();
    fixture.tables.pengguna[0].wajibGantiPassword = true;
    await assert.rejects(() => run(0, async () => {}), /Sesi/);
  });
  await t.test("pembimbing kedua baru menutup approval perubahan yang terikat susunan lama", async () => {
    await establish();
    const id = String(bimbingan().id);
    await run(0, (context) => submitChange(context, { ...titleInput, id, judul: "Sistem Penelitian Akademik Baru", jenis: "revisi_minor", reason: "Menyesuaikan ruang lingkup penelitian" }));
    const changeId = String(fixture.tables.pengajuanPerubahanJudul[0].id);
    await run(3, (context) => decideChange(context, { id: changeId }, true, false));
    await run(1, (context) => assignSupervisors(context, { id: String(title().id), supervisors: ["4", "5"] }));
    assert.equal(fixture.tables.pengajuanPerubahanJudul[0].status, "ditolak_kaprodi");
    await assert.rejects(() => run(1, (context) => decideChange(context, { id: changeId }, true, true)), /seluruh pembimbing/);
    assert.equal(title().judul, titleInput.judul);
  });
  await t.test("penolakan perubahan mempertahankan judul dan permohonan minor baru disetujui bertahap", async () => {
    await establish(true);
    const id = String(bimbingan().id);
    const changeInput = { ...titleInput, id, judul: "Sistem Penelitian Akademik Baru", jenis: "revisi_minor", reason: "Menyesuaikan ruang lingkup penelitian" };
    await run(0, (context) => submitChange(context, changeInput));
    const firstId = String(fixture.tables.pengajuanPerubahanJudul[0].id);
    await run(3, (context) => decideChange(context, { id: firstId, reason: "Ruang lingkup belum sesuai" }, false, false));
    assert.equal(title().judul, titleInput.judul);
    fixture.tables.arsipJudulSkripsi.push({ id: 9007199254740993n, judul: changeInput.judul, namaPenulis: "Alumni Uji",
      nim: null, tahun: "2025", prodi: "Informatika", keywords: preprocess(changeInput.judul) });
    await run(0, (context) => submitChange(context, changeInput));
    const secondId = String(fixture.tables.pengajuanPerubahanJudul[1].id);
    await Promise.all([run(3, (context) => decideChange(context, { id: secondId }, true, false)), run(4, (context) => decideChange(context, { id: secondId }, true, false))]);
    await run(1, (context) => decideChange(context, { id: secondId }, true, true));
    assert.equal(title().judul, changeInput.judul);
    assert.equal(bimbingan().idDosenPembimbing, 4n);
    assert.equal(bimbingan().idDosenPembimbing2, 5n);
    assert.equal(title().counterPengajuan, 1);
    assert.equal(title().skorKemiripan, 100);
    assert.equal(title().judulTermirip, changeInput.judul);
  });
  await t.test("periode baru mempertahankan histori, membuka siklus dan mencabut ACC skripsi lama sekali", async () => {
    await establish();
    const id = String(bimbingan().id);
    fixture.tables.bimbingan[0].siklusKe = 3;
    fixture.tables.bimbingan[0].faseSkripsiAt = new Date();
    for (let i = 0; i < 2; i++) await run(3, (context) => addLog(context, { id, tanggal: "2026-11-01", fase: "skripsi", catatan: "Pembahasan skripsi", selesai: true }));
    await run(3, (context) => acc(context, { id, fase: "skripsi" }, false));
    fixture.tables.pengaturanSistem.find((row) => row.kunci === "periode_akademik_mulai")!.nilai = "2001-01-01";
    await run(0, (context) => submitAdministration(context, { namaPengirim: "Mahasiswa Sumbawa", tanggalTransfer: "2026-01-01" }, { kwitansi: pdf, transfer: pdf, krs: pdf }));
    assert.equal(fixture.tables.verifikasiPembayaran.length, 2);
    const payment = fixture.tables.verifikasiPembayaran[1];
    const key = randomUUID();
    await Promise.all([run(6, (context) => decideAdministration(context, { id: String(payment.id), revision: "1" }, true), key), run(6, (context) => decideAdministration(context, { id: String(payment.id), revision: "1" }, true), key)]);
    assert.equal(bimbingan().siklusKe, 4);
    assert.equal(bimbingan().idDosenPembimbing, 4n);
    assert.equal(fixture.tables.dokumenVerifikasi[0].status, "dicabut");
    await assert.rejects(() => run(3, (context) => acc(context, { id, fase: "skripsi" }, false)), /minimum/);
    await assert.rejects(() => run(0, (context) => updateLog(context, { id: String(fixture.tables.logbookBimbingan[0].id), catatan: "Catatan baru" }, false)), /siklus sebelumnya/);
    assert.equal(fixture.tables.logAktivitas.filter((row) => row.aksi === "pembukaan_siklus_baru").length, 1);
  });
  await t.test("review administrasi lama ditolak setelah mahasiswa mengganti berkas", async () => {
    await establish();
    const id = String(fixture.tables.verifikasiPembayaran[0].id);
    await run(6, (context) => decideAdministration(context, { id, revision: "2", reason: "Perbaiki bukti transfer yang diunggah" }, false));
    await run(0, (context) => submitAdministration(context, { namaPengirim: "Pengirim Pengganti", tanggalTransfer: "2026-01-01" }, { transfer: { ...pdf, bytes: Buffer.from("%PDF-berkas-baru") } }));
    const updated = fixture.tables.verifikasiPembayaran[0];
    await assert.rejects(() => run(6, (context) => decideAdministration(context, { id, revision: "3" }, true)), /telah berubah/);
    assert.equal(fixture.tables.verifikasiPembayaran[0].statusVerifikasi, "menunggu_verifikasi");
    await run(6, (context) => decideAdministration(context, { id, revision: String(updated.revision) }, true));
    assert.equal(fixture.tables.verifikasiPembayaran[0].statusVerifikasi, "terverifikasi");
  });
  await t.test("administrasi dapat disimpan bertahap, dihapus pemilik sebelum approval, dan terkunci sesudahnya", async () => {
    reset();
    await run(0, (context) => submitAdministration(context, {}, { kwitansi: pdf }, true));
    const id = String(fixture.tables.verifikasiPembayaran[0].id);
    await assert.rejects(() => run(6, (context) => decideAdministration(context, { id, revision: "1" }, true)), /belum lengkap/);
    await assert.rejects(() => run(5, (context) => removeAdministrationFile(context, { id, revision: "1", file: "kwitansi" })), /bukan milik/);
    const oldPath = String(fixture.tables.verifikasiPembayaran[0].fileKwitansi);
    await run(0, (context) => removeAdministrationFile(context, { id, revision: "1", file: "kwitansi" }));
    assert.equal(fixture.tables.verifikasiPembayaran[0].fileKwitansi, null);
    assert.equal((await readStoredFile(oldPath)).toString(), pdf.bytes.toString());
    await run(0, (context) => submitAdministration(context, { namaPengirim: "Mahasiswa Sumbawa", tanggalTransfer: "2026-01-01" }, { kwitansi: pdf, transfer: pdf, krs: pdf }));
    await run(6, (context) => decideAdministration(context, { id, revision: "3" }, true));
    await assert.rejects(() => run(0, (context) => removeAdministrationFile(context, { id, revision: "4", file: "kwitansi" })), /terkunci/);
    await assert.rejects(() => run(0, (context) => submitAdministration(context, {}, { kwitansi: pdf }, true)), /terkunci/);
  });
  await t.test("siklus baru melepas pembimbing tidak aktif dan mempertahankan profil historis", async () => {
    await establish(true);
    fixture.tables.pengguna.find((row) => row.id === 4n)!.statusAkun = "nonaktif";
    fixture.tables.pengaturanSistem.find((row) => row.kunci === "periode_akademik_mulai")!.nilai = "2001-01-01";
    await run(0, (context) => submitAdministration(context, { namaPengirim: "Mahasiswa Sumbawa", tanggalTransfer: "2026-01-01" }, { kwitansi: pdf, transfer: pdf, krs: pdf }));
    const payment = fixture.tables.verifikasiPembayaran[1];
    await run(6, (context) => decideAdministration(context, { id: String(payment.id), revision: "1" }, true));
    assert.equal(bimbingan().idDosenPembimbing, null);
    assert.equal(bimbingan().idDosenPembimbing2, 5n);
    assert.ok(fixture.tables.dosen.some((row) => row.penggunaId === 4n));
    assert.ok(bimbingan().pembatalanP1);
    await assert.rejects(() => run(6, (context) => cancelSupervisor(context, bimbingan().id as bigint, 2, "Pembatalan manual oleh finance")), /pengelola/);
  });
  await t.test("perubahan peran mahasiswa mempertahankan histori dan menutup mutasi akademik lama", async () => {
    await establish();
    fixture.tables.pengguna.find((row) => row.id === 1n)!.role = "dosen";
    await assert.rejects(() => run(3, (context) => addLog(context, { id: String(bimbingan().id), tanggal: "2026-11-01", fase: "sempro", catatan: "Pembahasan penelitian", selesai: true })), /tidak aktif/);
    assert.ok(fixture.tables.pengguna.find((row) => row.id === 1n)!.mahasiswa);
    assert.equal(fixture.tables.pengajuanJudul.length, 1);
  });
  await t.test("revisi dan draft mempertahankan pengajuan lama, keputusan Kaprodi mengikat Sekpro", async () => {
    await establish();
    await run(1, (context) => cancelSupervisor(context, bimbingan().id as bigint, 1, "Penetapan perlu diperbaiki"));
    const oldId = title().id;
    await assert.rejects(() => run(2, (context) => reviewTitle(context, { id: String(oldId), reason: "Revisi oleh sekretaris" }, "revise")), /final bagi Sekpro/);
    await run(1, (context) => reviewTitle(context, { id: String(oldId), reason: "Perbaiki rancangan penelitian" }, "revise"));
    await run(0, (context) => saveTitle(context, { ...titleInput, judul: "Rancangan Sistem Informasi Baru" }, {}, true));
    await run(0, (context) => saveTitle(context, { ...titleInput, judul: "Rancangan Sistem Informasi Baru" }, { proposal: pdf }, false));
    const old = fixture.tables.pengajuanJudul.find((item) => item.id === oldId)!;
    assert.equal(old.isDiarsipkan, true);
    assert.ok(old.fileProposal);
    const active = fixture.tables.pengajuanJudul.filter((item) => !item.isDiarsipkan && !item.deletedAt && item.statusDraft === "diajukan");
    assert.equal(active.length, 1);
    assert.equal(active[0].counterPengajuan, 2);
    assert.ok(fixture.tables.pengajuanJudul.some((item) => item.statusDraft === "draft" && item.deletedAt));
  });
  await t.test("perubahan judul menunggu dua pembimbing lalu keputusan final dan seminar ulang mengarsipkan histori", async () => {
    await establish(true);
    const id = String(bimbingan().id);
    await run(0, (context) => addLog(context, { id, dosenId: "4", tanggal: "2026-11-01", fase: "sempro", catatan: "Pembahasan penelitian", selesai: true }));
    await run(0, (context) => submitChange(context, { ...titleInput, id, judul: "Sistem Informasi Penelitian Baru", jenis: "seminar_ulang", reason: "Perubahan topik penelitian mahasiswa" }));
    const change = fixture.tables.pengajuanPerubahanJudul[0];
    await assert.rejects(() => run(1, (context) => decideChange(context, { id: String(change.id) }, true, true)), /seluruh pembimbing/);
    await run(3, (context) => decideChange(context, { id: String(change.id) }, true, false));
    assert.equal(fixture.tables.pengajuanPerubahanJudul[0].status, "menunggu_dospem");
    await run(4, (context) => decideChange(context, { id: String(change.id) }, true, false));
    assert.equal(fixture.tables.pengajuanPerubahanJudul[0].status, "menunggu_kaprodi");
    await run(1, (context) => decideChange(context, { id: String(change.id) }, true, true));
    assert.equal(title().judul, "Sistem Informasi Penelitian Baru");
    assert.equal(bimbingan().idDosenPembimbing, null);
    assert.equal(bimbingan().idDosenPembimbing2, null);
    assert.equal(fixture.tables.logbookBimbingan[0].isDibatalkan, true);
    assert.equal(fixture.tables.pengajuanPerubahanJudul[0].status, "disetujui");
  });
  await t.test("fase dan siklus lama hanya baca, pembatalan pembimbing mencabut ACC", async () => {
    await establish();
    const id = String(bimbingan().id);
    await assert.rejects(() => run(0, (context) => addLog(context, { id, dosenId: "4", tanggal: "2026-11-01", fase: "skripsi", catatan: "Pembahasan penelitian", selesai: true })), /Fase skripsi/);
    for (let i = 0; i < 2; i++) await run(3, (context) => addLog(context, { id, tanggal: "2026-11-01", fase: "sempro", catatan: "Pembahasan penelitian", selesai: true }));
    await run(3, (context) => acc(context, { id, fase: "sempro" }, false));
    fixture.tables.bimbingan[0].siklusKe = 2;
    await assert.rejects(() => run(0, (context) => updateLog(context, { id: String(fixture.tables.logbookBimbingan[0].id), catatan: "Catatan baru" }, false)), /siklus sebelumnya/);
    await run(1, (context) => cancelSupervisor(context, BigInt(id), 1, "Pembimbing berhalangan tetap"));
    assert.equal(fixture.tables.dokumenVerifikasi[0].status, "dicabut");
    assert.equal(fixture.tables.logbookBimbingan.length, 2);
    assert.equal(fixture.tables.logbookBimbingan[0].isDibatalkan, true);
  });
  await t.test("jadwal disimpan dalam WITA, pemilik konfirmasi dan penugasan membatasi tindakan", async () => {
    await establish();
    const id = String(bimbingan().id);
    await run(3, (context) => saveSchedule(context, { id, mulai: "2090-11-07T09:00", selesai: "2090-11-07T10:00", lokasi: "Ruang Dosen", catatan: "Bimbingan proposal" }, false));
    const scheduleId = String(fixture.tables.jadwalBimbingan[0].id);
    assert.equal((fixture.tables.jadwalBimbingan[0].waktuMulai as Date).toISOString(), "2090-11-07T01:00:00.000Z");
    await assert.rejects(() => run(5, (context) => transitionSchedule(context, { id: scheduleId }, "confirm")), /pemilik/);
    await run(0, (context) => transitionSchedule(context, { id: scheduleId, reason: "Ada jadwal kuliah lain", usulan: "2090-11-08T09:00" }, "reschedule"));
    await run(0, (context) => transitionSchedule(context, { id: scheduleId }, "confirm"));
    await run(3, (context) => transitionSchedule(context, { id: scheduleId }, "complete"));
    await assert.rejects(() => run(0, (context) => transitionSchedule(context, { id: scheduleId }, "confirm")), /tidak tersedia/);
    assert.equal(fixture.tables.jadwalBimbingan[0].status, "selesai");
  });
  await t.test("Server Action memeriksa Origin dan menjalankan formulir logbook dengan sesi aktual", async () => {
    await establish();
    const requireForTest = createRequire(import.meta.url);
    const nextHeaders = requireForTest("next/headers") as typeof import("next/headers");
    const nextCache = requireForTest("next/cache") as typeof import("next/cache");
    const previousOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "http://127.0.0.1:3104";
    let origin = "https://foreign.invalid";
    const token = "a".repeat(64);
    fixture.tables.authSession.find((item) => item.penggunaId === 1n)!.tokenHash = tokenHash(token);
    const headersMock = mock.method(nextHeaders, "headers", async () => new Headers({ origin }) as Awaited<ReturnType<typeof nextHeaders.headers>>);
    const cookiesMock = mock.method(nextHeaders, "cookies", async () => ({ get: () => ({ value: token }) }) as Awaited<ReturnType<typeof nextHeaders.cookies>>);
    const revalidate = mock.method(nextCache, "revalidatePath", () => {});
    const { academicAction } = await import("../src/app/actions/academic");
    try {
      const result = await academicAction({}, new FormData());
      assert.match(result.error!, /tidak dapat diverifikasi/);
      origin = process.env.APP_ORIGIN;
      const form = new FormData();
      for (const [key, value] of Object.entries({ command: "add-log", key: randomUUID(), id: String(bimbingan().id), dosenId: "4", tanggal: "2026-11-01", fase: "sempro", catatan: "Dikirim melalui formulir", selesai: "on" })) form.set(key, value);
      assert.ok((await academicAction({}, form)).success);
      assert.equal(fixture.tables.logbookBimbingan.length, 1);
      assert.equal(fixture.tables.logbookBimbingan[0].statusSelesai, true);
      assert.ok(revalidate.mock.calls.some((c) => c.arguments[0] === "/bimbingan"));
      assert.ok(!revalidate.mock.calls.some((c) => c.arguments[0] === "/administrasi"));
      assert.ok(!revalidate.mock.calls.some((c) => c.arguments[0] === "/notifikasi"));
      assert.ok((await academicAction({}, form)).success);
      assert.equal(fixture.tables.logbookBimbingan.length, 1);
    } finally {
      headersMock.mock.restore(); cookiesMock.mock.restore(); revalidate.mock.restore();
      if (previousOrigin === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = previousOrigin;
    }
  });
  await t.test("route unduh proposal memeriksa pemilik, penugasan dan file administrasi keuangan", async () => {
    await establish();
    const requireForTest = createRequire(import.meta.url);
    const nextHeaders = requireForTest("next/headers") as typeof import("next/headers");
    let token = "b".repeat(64);
    const cookiesMock = mock.method(nextHeaders, "cookies", async () => ({ get: () => ({ value: token }) }) as Awaited<ReturnType<typeof nextHeaders.cookies>>);
    const { GET } = await import("../src/app/berkas/[kind]/[id]/[file]/route");
    const request = (kind = "proposal", id = String(title().id), file = "proposal") => GET(new Request("http://127.0.0.1:3104/berkas"), { params: Promise.resolve({ kind, id, file }) });
    const login = (actor: number) => {
      token = String(actor + 1).repeat(64);
      fixture.tables.authSession.find((item) => item.penggunaId === actors[actor].id)!.tokenHash = tokenHash(token);
    };
    try {
      assert.equal((await request()).status, 401);
      login(5); assert.equal((await request()).status, 404);
      login(4); assert.equal((await request()).status, 404);
      login(3); assert.equal((await request()).status, 200);
      const formerLecturer = fixture.tables.pengguna.find((item) => item.id === actors[3].id)!;
      formerLecturer.role = "admin_keuangan";
      fixture.tables.authSession.find((item) => item.penggunaId === actors[3].id)!.activeRole = "admin_keuangan";
      assert.ok(formerLecturer.dosen);
      assert.equal((await request()).status, 404);
      formerLecturer.role = "dosen";
      fixture.tables.authSession.find((item) => item.penggunaId === actors[3].id)!.activeRole = "dosen";
      login(0);
      const response = await request();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      assert.equal(response.headers.get("Content-Type"), "application/pdf");
      assert.equal(await response.text(), pdf.bytes.toString());
      login(3); assert.equal((await request("administrasi", String(fixture.tables.verifikasiPembayaran[0].id), "transfer")).status, 404);
      login(6); assert.equal((await request("administrasi", String(fixture.tables.verifikasiPembayaran[0].id), "transfer")).status, 200);
    } finally { cookiesMock.mock.restore(); }
  });
  await t.test("halaman bimbingan menyembunyikan catatan internal dari mahasiswa dan menolak dosen lain", async () => {
    const linksMock = mock.module("next/link", { exports: { default: "a" } });
    t.after(() => linksMock.restore());
    await establish();
    const id = String(bimbingan().id);
    await run(0, (context) => submitChange(context, { ...titleInput, id, judul: "Sistem Penelitian Akademik Baru", jenis: "revisi_minor", reason: "Menyesuaikan ruang lingkup penelitian" }));
    await run(3, (context) => decideChange(context, { id: String(fixture.tables.pengajuanPerubahanJudul[0].id),
      reason: "Catatan publik penelitian", internal: "CATATAN_INTERNAL_UJI_12345" }, true, false));
    const requireForTest = createRequire(import.meta.url);
    const nextHeaders = requireForTest("next/headers") as typeof import("next/headers");
    let token = "1".repeat(64);
    const cookiesMock = mock.method(nextHeaders, "cookies", async () => ({ get: () => ({ value: token }) }) as Awaited<ReturnType<typeof nextHeaders.cookies>>);
    const { default: GuidanceDetail } = await import("../src/app/bimbingan/[id]/page");
    const login = (actor: number) => {
      token = String(actor + 1).repeat(64);
      fixture.tables.authSession.find((item) => item.penggunaId === actors[actor].id)!.tokenHash = tokenHash(token);
    };
    const content = (node: React.ReactNode): string => {
      if (Array.isArray(node)) return node.map(content).join(" ");
      if (typeof node === "string" || typeof node === "number") return String(node);
      if (React.isValidElement<{ children?: React.ReactNode }>(node)) return content(node.props.children);
      return "";
    };
    const render = () => GuidanceDetail({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });
    try {
      login(0);
      const student = content(await render());
      assert.match(student, /Catatan publik penelitian/);
      assert.doesNotMatch(student, /CATATAN_INTERNAL_UJI_12345/);
      login(3); assert.match(content(await render()), /CATATAN_INTERNAL_UJI_12345/);
      login(1); assert.match(content(await render()), /CATATAN_INTERNAL_UJI_12345/);
      login(4); await assert.rejects(render, /notFound/);
      const formerLecturer = fixture.tables.pengguna.find((item) => item.id === actors[3].id)!;
      formerLecturer.role = "admin_keuangan";
      const live = fixture.tables.authSession.find((item) => item.penggunaId === actors[3].id)!;
      live.activeRole = "admin_keuangan";
      login(3); await assert.rejects(render, /notFound/);
      assert.ok(formerLecturer.dosen);
      const { scopedTitles } = await import("../src/lib/academic/views");
      const account = formerLecturer as unknown as Account;
      assert.equal((await fixture.db.pengajuanJudul.findMany({ where: scopedTitles(account, false) })).length, 0);
      assert.equal((await fixture.db.bimbingan.findMany({ where: { pengajuan: scopedTitles(account, false) } })).length, 0);
      formerLecturer.role = "dosen";
      live.activeRole = "dosen";
      assert.equal((await fixture.db.pengajuanJudul.findMany({ where: scopedTitles(account, false) })).length, 1);
      assert.match(content(await render()), /CATATAN_INTERNAL_UJI_12345/);
    } finally { cookiesMock.mock.restore(); }
  });
});
