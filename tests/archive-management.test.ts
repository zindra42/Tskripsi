import assert from "node:assert/strict";
import test, { mock } from "node:test";
import React from "react";
import type { PrismaClient } from "../src/generated/prisma/client";
import { cohortPattern, pageLinks, titleFilters, titleListUrl, titlePage } from "../src/lib/academic/title-list-params";
import { archiveCsvRow, importArchiveCsv, parseCsv } from "../src/lib/academic/archive-csv";
import { fixture, session, syntheticDatabase } from "./helpers/accounts-db";
import { preprocess } from "../src/lib/academic/similarity";

test("angkatan mengikuti NIM dua/empat digit dan menolak nilai ambigu", () => {
  const matches = (year: string, nim: string | null) => nim !== null && new RegExp(cohortPattern(year)).test(nim);
  for (const nim of ["2200111", "2022001111", "220000000001"]) assert.ok(matches("2022", nim));
  for (const nim of [null, "", "22", "22ABC111", "2022001111_DEL_2", "2021001111", " 2200111"]) assert.equal(matches("2022", nim), false);
  assert.ok(matches("2000", "0000111"));
  assert.ok(matches("1999", "9900111"));
  assert.ok(matches("2020", "2000111"));
  assert.equal(matches("2020", "2019001111"), false);
  assert.ok(matches("2019", "2019001111"));
  assert.equal(matches("2019", "1900000000"), false);
  assert.ok(matches("1900", "1900000000"));
});

test("pagination ekstrem, parameter rusak, ellipsis dan filter retention", () => {
  const invalid = titleFilters({ page: "-1", q: ["secret"], perPage: "999999", sort: "injection", angkatan: "22" });
  assert.deepEqual(invalid, { page: 1, q: "", perPage: 20, sort: "latest", angkatan: "", mode: "alumni" });
  for (const page of ["NaN", "Infinity", "1.5", "1e8", ""]) assert.equal(titleFilters({ page }).page, 1);
  const filters = titleFilters({ page: "9".repeat(400), perPage: "50", mode: "pengajuan", q: "A&B + C", angkatan: "2022", sort: "nim-desc" });
  assert.equal(filters.page, 2147483647);
  assert.deepEqual(titlePage(1234, filters), { page: 25, pages: 25, total: 1234, skip: 1200, take: 50 });
  assert.equal(titlePage(0, filters).page, 1);
  assert.ok(pageLinks(500, 2000).length <= 9);
  assert.deepEqual(pageLinks(500, 2000), [1, "ellipsis", 498, 499, 500, 501, 502, "ellipsis", 2000]);
  const url = new URL(titleListUrl("/judul", filters, { page: 3 }), "https://test.invalid");
  for (const [key, expected] of Object.entries({ q: "A&B + C", page: "3", mode: "pengajuan", angkatan: "2022", perPage: "50", sort: "nim-desc" })) assert.equal(url.searchParams.get(key), expected);
  assert.equal(titleFilters({ perPage: "100", q: "a".repeat(1000) }).q.length, 255);
});

test("CSV escaping, formula defense dan round-trip NIM sebagai teks", async () => {
  const input = { judul: '=HYPERLINK("x", "y")', namaPenulis: "'Penulis,\nSatu", tahun: "+2025", nim: "0000123456", prodi: "@Ilmu" };
  const csv = "\uFEFFjudul,nama_penulis,tahun,nim,prodi\r\n" + archiveCsvRow(input);
  const parsed = parseCsv(csv)[1];
  assert.equal(parsed[0], "'" + input.judul);
  assert.equal(parsed[1], "'" + input.namaPenulis);
  assert.equal(parsed[3], "'0000123456");
  let restored: unknown;
  const tx = { arsipJudulSkripsi: { createMany: async ({ data }: { data: unknown[] }) => { restored = data[0]; } } };
  const result = await importArchiveCsv(tx as never, csv);
  assert.equal(result.imported, 1);
  for (const [key, value] of Object.entries(input)) assert.equal((restored as Record<string, unknown>)[key], value);
  for (const prefix of ["=", "+", "-", "@", "\t", "\r", "\n", "  ="]) {
    assert.ok(parseCsv(archiveCsvRow({ ...input, judul: prefix + "abc" }))[0][0].startsWith("'"));
  }
});

type Row = Record<string, unknown>;
function elements(node: React.ReactNode): React.ReactElement<Row>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Row>(node)) return [];
  return [node, ...elements(node.props.children as React.ReactNode)];
}

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined) return true;
    if (key === "AND") return (expected as Row[]).every((part) => matches(row, part));
    if (key === "OR") return (expected as Row[]).some((part) => matches(row, part));
    const actual = row[key];
    if (expected && typeof expected === "object") {
      const filter = expected as Row;
      if ("in" in filter) return (filter.in as unknown[]).includes(actual);
      if ("contains" in filter) return typeof actual === "string" && actual.toLowerCase().includes(String(filter.contains).toLowerCase());
      return actual != null && matches(actual as Row, filter);
    }
    return actual === expected;
  });
}

function setup() {
  const users = [fixture(1n, "superadmin"), fixture(2n, "kaprodi"), fixture(3n, "sekpro"), fixture(4n), fixture(5n, "dekan")];
  const sessions = users.map((u) => session(u));
  const memory = syntheticDatabase(users, sessions);
  memory.tables.arsipJudulSkripsi = [];
  memory.tables.pengajuanJudul = [];
  const calls: { name: string; args: Row }[] = [];
  const db = memory.db as unknown as Record<string, unknown>;
  for (const name of ["arsipJudulSkripsi", "pengajuanJudul"]) {
    const read = (args: Row = {}) => {
      calls.push({ name, args });
      let rows = memory.tables[name].filter((row) => matches(row, args.where as Row));
      const order = (args.orderBy ?? []) as Row[];
      const value = (row: Row, spec: Row): unknown => {
        const [key, next] = Object.entries(spec)[0];
        return key === "mahasiswa" ? value((row[key] ?? {}) as Row, next as Row) : row[key];
      };
      rows = [...rows].sort((a, b) => {
        for (const spec of order) {
          const left = value(a, spec), right = value(b, spec);
          if (left === right) continue;
          if (left == null) return 1;
          if (right == null) return -1;
          const desc = JSON.stringify(spec).includes("desc");
          return (left < right ? -1 : 1) * (desc ? -1 : 1);
        }
        return 0;
      });
      return rows.slice(Number(args.skip ?? 0), args.take ? Number(args.skip ?? 0) + Number(args.take) : undefined);
    };
    db[name] = {
      findMany: async (args: Row) => structuredClone(read(args)),
      findUnique: async (args: Row) => structuredClone(read(args)[0] ?? null),
      count: async (args: Row) => read(args).length,
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = memory.tables[name].find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return structuredClone(row);
      },
    };
  }
  db.$queryRaw = async (sql: { strings: string[]; values: unknown[] }) => {
    const regex = new RegExp(String(sql.values[0]));
    const name = sql.strings.join("").includes("arsip_judul") ? "arsipJudulSkripsi" : "mahasiswa";
    return memory.tables[name].filter((r) => typeof r.nim === "string" && regex.test(r.nim)).map((r) => ({ nim: r.nim }));
  };
  const transaction = memory.db.$transaction.bind(memory.db);
  db.$transaction = (work: (tx: unknown) => Promise<unknown>, options: unknown) => transaction(async (tx) => {
    const raw = tx.$queryRaw.bind(tx);
    tx.$queryRaw = (async (sql: { strings?: string[]; values?: unknown[] }, ...args: unknown[]) => {
      if (!sql.strings) return (raw as (...args: unknown[]) => Promise<unknown>)(sql, ...args);
      const regex = new RegExp(String(sql.values![0]));
      const name = sql.strings.join("").includes("arsip_judul") ? "arsipJudulSkripsi" : "mahasiswa";
      return memory.tables[name].filter((r) => typeof r.nim === "string" && regex.test(r.nim)).map((r) => ({ nim: r.nim }));
    }) as typeof tx.$queryRaw;
    return work(tx);
  }, options as never);
  const archive = { id: 100n, judul: "Sistem Informasi Lama", namaPenulis: "Penulis Lama", nim: "2200111", tahun: "2025", prodi: "Informatika", keywords: ["lama"], createdAt: null, updatedAt: null };
  memory.tables.arsipJudulSkripsi.push(archive, { ...archive, id: 101n, judul: "Judul Lain", nim: null });
  (globalThis as unknown as { siasDatabase: PrismaClient }).siasDatabase = memory.db;
  return { ...memory, users, sessions, archive, calls };
}

test("edit, query dan ekspor melalui service dan entry point aplikasi", async (t) => {
  const nav = mock.module("next/navigation", { exports: { redirect: () => { throw Error("redirect"); }, notFound: () => { throw Error("notFound"); } } });
  t.after(() => nav.restore());
  const globalDb = globalThis as unknown as { siasDatabase?: PrismaClient };
  const old = globalDb.siasDatabase;
  t.after(() => { globalDb.siasDatabase = old; });
  const { editArchive, archiveFingerprint, archiveEditSchema } = await import("../src/lib/academic/archive-edit");
  const { titleListQuery } = await import("../src/lib/academic/title-list");
  const { exportTitleList } = await import("../src/lib/academic/title-export");
  const input = (row: ReturnType<typeof setup>["archive"]) => ({ ...row, id: String(row.id), original: archiveFingerprint(row), judul: "Rancang Bangun Aplikasi Akademik", reason: "Koreksi data hasil impor CSV" });

  await t.test("superadmin mengedit satu entri, menghitung keywords dan mencatat audit lengkap", async () => {
    const { sessions, archive, tables, queries } = setup();
    const before = structuredClone(archive);
    await editArchive(sessions[0], input(archive));
    assert.deepEqual(archive.keywords, preprocess(archive.judul, true));
    assert.equal(tables.arsipJudulSkripsi.length, 2);
    assert.equal(tables.arsipJudulSkripsi[1].judul, "Judul Lain");
    assert.equal(tables.logAktivitas[0].penggunaId, 1n);
    const detail = tables.logAktivitas[0].detail as Row;
    assert.equal((detail.before as Row).judul, before.judul);
    assert.equal((detail.after as Row).judul, archive.judul);
    assert.equal(detail.reason, "Koreksi data hasil impor CSV");
    assert.equal(tables.logSuperAdmin.length, 1);
    assert.ok(queries.some((q) => q.includes("arsip_judul_skripsi") && q.includes("FOR UPDATE")));
  });
  await t.test("kaprodi, sekpro, mahasiswa dan Dekan ditolak", async () => {
    const { sessions, archive, tables } = setup();
    for (const actor of sessions.slice(1)) await assert.rejects(editArchive(actor, input(archive)), /kewenangan/);
    assert.equal(archive.judul, "Sistem Informasi Lama");
    assert.equal(tables.logAktivitas.length, 0);
  });
  await t.test("sesi superadmin lama tidak mengatasi role/status/version/revocation aktual", async () => {
    for (const change of [{ role: "mahasiswa" }, { statusAkun: "nonaktif" }, { authVersion: 9 }, { wajibGantiPassword: true }, { deletedAt: new Date() }]) {
      const { sessions, archive, tables } = setup();
      Object.assign(tables.pengguna[0], change);
      await assert.rejects(editArchive(sessions[0], input(archive)), /kewenangan|Sesi telah berubah/);
    }
    for (const change of [{ authVersion: 9 }, { expiresAt: new Date(0) }, { penggunaId: 99n }]) {
      const { sessions, archive, tables } = setup();
      Object.assign(tables.authSession[0], change);
      await assert.rejects(editArchive(sessions[0], input(archive)), /Sesi telah berubah/);
    }
    const { sessions, archive, tables } = setup();
    tables.authSession.length = 0;
    await assert.rejects(editArchive(sessions[0], input(archive)), /Sesi telah berubah/);
  });
  await t.test("validasi bigint, panjang, nullable, entri hilang dan formulir usang", async () => {
    const { sessions, archive, tables } = setup();
    for (const change of [{ id: "0" }, { id: "9223372036854775808" }, { id: "1e4" }, { judul: "xy" }, { judul: "a".repeat(10001) }, { nim: "a".repeat(51) }, { namaPenulis: "a".repeat(256) }, { prodi: "a".repeat(101) }, { tahun: "a".repeat(11) }, { reason: "short" }]) {
      assert.equal(archiveEditSchema.safeParse({ ...input(archive), ...change }).success, false);
    }
    await assert.rejects(editArchive(sessions[0], { ...input(archive), id: "9999" }), /tidak ditemukan/);
    const previous = input(archive);
    await editArchive(sessions[0], { ...previous, nim: "", namaPenulis: null, prodi: "", tahun: "" });
    assert.equal(tables.arsipJudulSkripsi[0].nim, null);
    await assert.rejects(editArchive(sessions[0], previous), /telah diubah/);
    assert.equal(tables.logAktivitas.length, 1);
  });
  await t.test("audit gagal membatalkan seluruh edit", async () => {
    const { sessions, archive, db, tables } = setup();
    (db.logAktivitas as unknown as { create: () => Promise<never> }).create = async () => { throw Error("synthetic audit failure"); };
    await assert.rejects(editArchive(sessions[0], input(archive)), /audit failure/);
    assert.equal(tables.arsipJudulSkripsi[0].judul, "Sistem Informasi Lama");
  });
  await t.test("edit bersamaan dari fingerprint sama hanya menyimpan satu perubahan", async () => {
    const { sessions, archive, tables } = setup();
    const original = input(archive);
    const results = await Promise.allSettled([
      editArchive(sessions[0], original),
      editArchive(sessions[0], { ...original, judul: "Perubahan Paralel Judul Arsip" }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(tables.logAktivitas.length, 1);
    assert.deepEqual(tables.arsipJudulSkripsi[0].keywords, preprocess(String(tables.arsipJudulSkripsi[0].judul), true));
  });
  await t.test("filter/query memakai AND scope, NIM dan urutan deterministik null-last", async () => {
    const { db, users } = setup();
    const filters = titleFilters({ q: "Penulis", angkatan: "2022", sort: "nim-desc" });
    const query = await titleListQuery(db, filters, users[0], true);
    assert.equal((await db.arsipJudulSkripsi.findMany({ where: query.archiveWhere })).length, 1);
    assert.deepEqual(query.archiveOrder, [{ nim: { sort: "desc", nulls: "last" } }, { id: "desc" }]);
    const scoped = await titleListQuery(db, { ...filters, mode: "pengajuan" }, users[1], true);
    assert.deepEqual(scoped.titleWhere.AND && (scoped.titleWhere.AND as unknown[])[0], { mahasiswa: { mahasiswa: { programStudiId: 1n } } });
    const own = await titleListQuery(db, { ...filters, mode: "pengajuan" }, users[3], false);
    assert.deepEqual((own.titleWhere.AND as unknown[])[0], { idMahasiswa: 4n });
    const dean = await titleListQuery(db, filters, users[4], false);
    assert.deepEqual((dean.titleWhere.AND as unknown[])[0], { id: -1n });
  });
  await t.test("export semua 1203 baris dalam beberapa batch, RFC4180 dan tanpa data privat", async () => {
    const { sessions, archive, tables, calls } = setup();
    tables.arsipJudulSkripsi = Array.from({ length: 1203 }, (_, i) => ({ ...archive, id: BigInt(i + 1), nim: "000" + i, judul: `Judul, \"${i}\"\nBaru`, keywords: ["PRIVATE_KEYWORDS"] }));
    const csv = await exportTitleList(sessions[0], titleFilters({ perPage: "20", page: "99", sort: "nim-asc" }));
    assert.equal(parseCsv(csv).length, 1204);
    assert.ok(csv.startsWith("\uFEFFjudul,"));
    assert.ok(csv.includes("\r\n"));
    assert.ok(!csv.includes("PRIVATE_KEYWORDS"));
    assert.deepEqual(calls.map((c) => c.args.skip), [0, 500, 1000]);
    assert.equal(parseCsv(csv)[1][3], "'0000");
  });
  await t.test("export pengajuan menerapkan prodi dan status sumber, filter sama dengan daftar", async () => {
    const { sessions, tables, users } = setup();
    const title = (id: bigint, programStudiId: bigint, statusDraft = "diajukan") => ({ id, judul: `Pengajuan ${id}`, idMahasiswa: 4n,
      deletedAt: null, statusDraft, tanggalPengajuan: new Date("2025-01-01"), mahasiswa: { nama: "Penulis", mahasiswa: { nim: "2200111", prodi: "Informatika", programStudiId } } });
    tables.pengajuanJudul.push(title(1n, 1n), title(2n, 2n), title(3n, 1n, "draft"));
    const filters = titleFilters({ mode: "pengajuan", q: "Penulis", sort: "nim-desc" });
    const scoped = parseCsv(await exportTitleList(sessions[1], filters));
    assert.equal(scoped.length, 2);
    assert.equal(scoped[1][0], "Pengajuan 1");
    const all = parseCsv(await exportTitleList(sessions[0], filters));
    assert.equal(all.length, 3);
    assert.equal(all[1][0], "Pengajuan 2");
    const withDrafts = parseCsv(await exportTitleList(sessions[1], filters, true));
    assert.equal(withDrafts.length, 3);
    assert.equal(withDrafts[1][0], "Pengajuan 3");
    users[1].dosen!.programStudiId = null;
    tables.dosen[0].programStudiId = null;
    await assert.rejects(exportTitleList(sessions[1], filters), /kewenangan/);
  });
  await t.test("halaman arsip meng-clamp halaman, menampilkan NIM dan menjaga kontrol filter", async (subtest) => {
    const links = mock.module("next/link", { exports: { default: "a" } });
    const { createRequire } = await import("node:module");
    const headers = createRequire(import.meta.url)("next/headers") as typeof import("next/headers");
    const token = "c".repeat(64);
    const cookies = mock.method(headers, "cookies", async () => ({ get: () => ({ value: token }) }) as never);
    subtest.after(() => { links.restore(); cookies.mock.restore(); });
    const { tables, archive } = setup();
    const { tokenHash } = await import("../src/lib/auth/tokens");
    tables.authSession[0].tokenHash = tokenHash(token);
    tables.arsipJudulSkripsi = Array.from({ length: 55 }, (_, i) => ({ ...archive, id: BigInt(i + 1), nim: `2200${String(i).padStart(3, "0")}` }));
    const { default: ArchivePage } = await import("../src/app/arsip-judul/page");
    const { TitlePagination, TitleDownloads, TitleListFilters } = await import("../src/components/title-list-controls");
    const filters = titleFilters({ page: "999", perPage: "50", q: "Penulis", angkatan: "2022", sort: "nim-asc" });
    const tree = elements(await ArchivePage({ searchParams: Promise.resolve(Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, String(value)]))) }));
    assert.equal(tree.filter((node) => node.type === "article").length, 5);
    const pagination = tree.find((node) => node.type === TitlePagination)!;
    assert.deepEqual(pagination.props.pagination, { total: 55, pages: 2, page: 2, skip: 50, take: 50 });
    const navigation = elements(TitlePagination(pagination.props as never));
    for (const link of navigation.filter((node) => node.type === "a")) {
      const url = new URL(String(link.props.href), "https://test.invalid");
      assert.equal(url.searchParams.get("q"), "Penulis");
      assert.equal(url.searchParams.get("perPage"), "50");
      assert.equal(url.searchParams.get("angkatan"), "2022");
      assert.equal(url.searchParams.get("sort"), "nim-asc");
    }
    assert.ok(navigation.some((node) => node.type === "input" && node.props.name === "mode" && node.props.value === "alumni"));
    const filterInputs = elements(TitleListFilters({ filters, source: true }));
    assert.ok(!filterInputs.some((node) => node.props.name === "page"));
    const downloads = elements(TitleDownloads({ filters })).filter((node) => node.type === "a");
    assert.equal(downloads.length, 2);
    assert.equal(downloads[0].props.children, "Unduh hasil filter (CSV)");
    assert.equal(downloads[1].props.href, "/api/arsip-judul/export?mode=alumni");
    assert.ok(tree.some((node) => node.props.href === "/arsip-judul/51/edit"));
  });
  await t.test("entry point edit hanya dapat dibuka superadmin dan menolak ID palsu", async (subtest) => {
    const links = mock.module("next/link", { exports: { default: "a" } });
    const { createRequire } = await import("node:module");
    const headers = createRequire(import.meta.url)("next/headers") as typeof import("next/headers");
    const token = "d".repeat(64);
    const cookies = mock.method(headers, "cookies", async () => ({ get: () => ({ value: token }) }) as never);
    subtest.after(() => { links.restore(); cookies.mock.restore(); });
    const { tokenHash } = await import("../src/lib/auth/tokens");
    const { default: EditPage } = await import("../src/app/arsip-judul/[id]/edit/page");
    const render = (id = "100") => EditPage({ params: Promise.resolve({ id }) });
    const { tables, archive } = setup();
    tables.authSession[0].tokenHash = tokenHash(token);
    const nodes = elements(await render());
    const form = nodes.find((node) => Boolean(node.props.initial))!;
    assert.equal((form.props.initial as Row).original, archiveFingerprint(archive));
    await assert.rejects(render("9999"), /notFound/);
    await assert.rejects(render("9223372036854775808"), /notFound/);
    tables.authSession[0].tokenHash = "other";
    tables.authSession[1].tokenHash = tokenHash(token);
    await assert.rejects(render(), /notFound/);
  });
  await t.test("halaman pengajuan memakai count scoped dan pagination yang sama", async (subtest) => {
    const links = mock.module("next/link", { exports: { default: "a" } });
    const { createRequire } = await import("node:module");
    const headers = createRequire(import.meta.url)("next/headers") as typeof import("next/headers");
    const token = "e".repeat(64);
    const cookies = mock.method(headers, "cookies", async () => ({ get: () => ({ value: token }) }) as never);
    subtest.after(() => { links.restore(); cookies.mock.restore(); });
    const { tables } = setup();
    const { tokenHash } = await import("../src/lib/auth/tokens");
    tables.authSession[1].tokenHash = tokenHash(token);
    tables.pengajuanJudul = Array.from({ length: 26 }, (_, i) => ({ id: BigInt(i + 1), judul: `Judul Pengajuan ${i}`,
      idMahasiswa: 4n, statusDraft: "diajukan", status: "diajukan", deletedAt: null, tanggalPengajuan: null,
      mahasiswa: { nama: "Penulis", mahasiswa: { nim: "2200111", programStudiId: i === 0 ? 2n : 1n } } }));
    const { default: TitlesPage } = await import("../src/app/judul/page");
    const { TitlePagination, TitleDownloads } = await import("../src/components/title-list-controls");
    const nodes = elements(await TitlesPage({ searchParams: Promise.resolve({ page: "9000", perPage: "20", q: "Penulis" }) }));
    assert.equal(nodes.filter((node) => node.type === "article").length, 5);
    assert.deepEqual(nodes.find((node) => node.type === TitlePagination)!.props.pagination, { total: 25, pages: 2, page: 2, skip: 20, take: 20 });
    const downloads = nodes.find((node) => node.type === TitleDownloads)!;
    assert.equal(downloads.props.submissions, true);
    assert.equal((downloads.props.filters as Row).mode, "pengajuan");
  });
  await t.test("API export menolak guest, role/status/authVersion usang dan menjaga header", async () => {
    const { createRequire } = await import("node:module");
    const nextHeaders = createRequire(import.meta.url)("next/headers") as typeof import("next/headers");
    const cookie = mock.method(nextHeaders, "cookies", async () => ({ get: () => undefined }) as never);
    t.after(() => cookie.mock.restore());
    const { GET } = await import("../src/app/api/arsip-judul/export/route");
    const request = () => GET(new Request("https://test.invalid/api/arsip-judul/export"));
    setup();
    assert.equal((await request()).status, 401);
    const { tokenHash } = await import("../src/lib/auth/tokens");
    const token = "a".repeat(64);
    cookie.mock.mockImplementation(async () => ({ get: () => ({ value: token }) }) as never);
    for (const change of [{ role: "mahasiswa" }, { statusAkun: "nonaktif" }, { authVersion: 3 }]) {
      const { tables } = setup();
      tables.authSession[0].tokenHash = tokenHash(token);
      Object.assign(tables.pengguna[0], change);
      assert.ok([401, 403].includes((await request()).status));
    }
    const { tables } = setup();
    tables.authSession[0].tokenHash = tokenHash(token);
    const response = await request();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "text/csv; charset=utf-8");
    assert.equal(response.headers.get("Content-Disposition"), 'attachment; filename="arsip_judul_skripsi.csv"');
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  });
  await t.test("Server Action memeriksa origin dan revalidate setelah audit", async () => {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const headers = require("next/headers") as typeof import("next/headers");
    const cache = require("next/cache") as typeof import("next/cache");
    const oldOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "https://test.invalid";
    t.after(() => { if (oldOrigin === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = oldOrigin; });
    let origin = "https://foreign.invalid";
    const originMock = mock.method(headers, "headers", async () => new Headers({ origin }) as never);
    const token = "b".repeat(64);
    const cookiesMock = mock.method(headers, "cookies", async () => ({ get: () => ({ value: token }) }) as never);
    const revalidate = mock.method(cache, "revalidatePath", () => {});
    t.after(() => { originMock.mock.restore(); cookiesMock.mock.restore(); revalidate.mock.restore(); });
    const { editArchiveAction } = await import("../src/app/actions/archive");
    assert.match((await editArchiveAction({}, new FormData())).error!, /tidak dapat diverifikasi/);
    const { tables, archive } = setup();
    const { tokenHash } = await import("../src/lib/auth/tokens");
    tables.authSession[0].tokenHash = tokenHash(token);
    origin = process.env.APP_ORIGIN;
    const form = new FormData();
    for (const [key, value] of Object.entries(input(archive))) if (typeof value === "string") form.set(key, value);
    const saved = await editArchiveAction({}, form);
    assert.ok(saved.success);
    assert.equal(saved.values!.original, archiveFingerprint(tables.arsipJudulSkripsi[0] as never));
    assert.ok(revalidate.mock.calls.some((c) => c.arguments[0] === "/arsip-judul"));
    const retry = new FormData();
    for (const [key, value] of Object.entries(saved.values!)) retry.set(key, value);
    retry.set("judul", "Sistem Baru Setelah Simpan");
    retry.set("reason", "Perbaikan kedua data judul");
    assert.ok((await editArchiveAction({}, retry)).success);
  });
});
