import assert from "node:assert/strict";
import type { Account } from "../../src/lib/accounts/store";
import type { AuthenticatedSession } from "../../src/lib/auth/session";
import type { PrismaClient } from "../../src/generated/prisma/client";

type Row = Record<string, unknown>;
const clone = <T>(v: T): T => structuredClone(v);
const row = (v: unknown) => v as Row;
export function account(id: bigint, role: Account["role"]): Account {
  return { id, role, nama: `Aktor ${id}`, email: `user${id}@example.invalid`, emailArsip: null, statusAkun: "aktif", deletedAt: null,
    wajibGantiPassword: false, authVersion: 0, dibuatOlehSuperAdmin: false, catatanPenolakan: null,
    mahasiswa: role === "mahasiswa" ? { penggunaId: id, nim: `20200000${id}`, nimArsip: null, semester: 9, noHp: null, createdAt: null, updatedAt: null } : null,
    dosen: ["dosen", "kaprodi", "sekpro"].includes(role) ? { penggunaId: id, nidn: `9000${id}`, nidnArsip: null, noHp: null,
      isKaprodi: role === "kaprodi", isSekpro: role === "sekpro", kuotaBimbingan: 10, keahlian: [], createdAt: null, updatedAt: null } : null };
}
export function session(actor: Account): AuthenticatedSession {
  return { tokenHash: String(actor.id).padStart(64, "0"), publicId: "10000000-0000-4000-8000-000000000001", penggunaId: actor.id,
    activeRole: actor.role, authVersion: 0, remember: false, expiresAt: new Date(Date.now() + 86400000), lastActivity: new Date(),
    createdAt: new Date(), user: actor, pengguna: actor };
}

// A transaction-aware test adapter. It verifies service execution and rollback, not PostgreSQL SQL/lock/FK semantics.
export function syntheticSidang() {
  const users = [account(1n, "mahasiswa"), account(2n, "dosen"), account(3n, "dosen"), account(4n, "dosen"), account(5n, "dosen"),
    account(6n, "kaprodi"), account(7n, "sekpro"), account(8n, "superadmin"), account(9n, "mahasiswa"), account(10n, "admin_keuangan")];
  const names = ["pengguna", "authSession", "pengaturanSistem", "pengajuanJudul", "bimbingan", "pendaftaranSempro", "jadwalSempro",
    "checklistDokumen", "penugasanPenguji", "pendaftaranSidang", "jadwalSidang", "konfirmasiJadwalSidang", "riwayatJadwalSidang",
    "permohonanSidang", "penilaianSidang", "beritaAcara", "revisiDokumen", "dokumenVerifikasi", "nomorSuratDasar", "nomorSuratKategori",
    "logAktivitas", "logSuperAdmin", "notification", "academicReceipt", "verifikasiPembayaran", "pengumuman", "pengumumanDibaca", "pembayaranSidang", "logbookBimbingan",
    "jadwalBimbingan", "pengajuanPerubahanJudul", "riwayatJadwalSempro", "konfirmasiJadwalSempro"];
  const tables: Record<string, Row[]> = Object.fromEntries(names.map((name) => [name, []]));
  tables.pengguna = clone(users) as unknown as Row[];
  tables.authSession = users.map(session) as unknown as Row[];
  tables.pengaturanSistem = Object.entries({ periode_akademik_mulai: "2000-01-01", periode_akademik_selesai: "2099-12-31",
    metode_bobot_sidang: "rekap_rata_rata", nilai_batas_lulus_sidang: "51" }).map(([kunci, nilai]) => ({ kunci, nilai }));
  tables.pengajuanJudul.push({ id: 20n, idMahasiswa: 1n, judul: "Sistem Informasi Sidang Skripsi Terpadu", status: "disetujui", statusDraft: "diajukan", deletedAt: null, isDiarsipkan: false, siklusKe: 1 });
  tables.bimbingan.push({ id: 30n, idPengajuan: 20n, idDosenPembimbing: 2n, idDosenPembimbing2: 5n, siklusKe: 1, faseSkripsiAt: new Date() });
  tables.pendaftaranSempro.push({ id: 40n, idPengajuan: 20n, statusBerkas: "lengkap", idDosenPembimbingSempro: 2n });
  tables.jadwalSempro.push({ id: 50n, idSempro: 40n, versi: 1, status: "final", statusPelaksanaan: "selesai", tanggal: new Date("2026-10-01"), waktuMulai: "09:00", waktuSelesai: "10:30", ruang: "Ruang A" });
  tables.beritaAcara.push({ id: 60n, idJadwal: 50n, idJadwalSidang: null, hasil: "lulus", statusPersetujuan: "menunggu_nilai_lengkap", statusRevisi: null });
  tables.penugasanPenguji.push(...[3n, 4n].map((idDosenPenguji, i) => ({ id: 70n + BigInt(i), idSempro: 40n, idSidangDaftar: null, idDosenPenguji, nomorPenguji: i + 1, jenis: "sempro", isPengganti: false })));
  tables.dokumenVerifikasi.push(...[2n, 5n].map((penandatanganUserId, i) => ({ id: 80n + BigInt(i), idBimbingan: 30n, idPengajuan: 20n,
    jenisDokumen: "acc_sidang", status: "sah", versi: 1, token: `acc-token-${i}`.padEnd(48, "a"), penandatanganUserId, snapshotJson: {} })));
  tables.verifikasiPembayaran.push({ id: 90n, idMahasiswa: 1n, siklusKe: 1, periode: "2000-01-01 s/d 2099-12-31", statusVerifikasi: "terverifikasi", perluVerifikasiUlang: false });
  let sequence = 100n;
  let queue = Promise.resolve();
  const findId = (table: string, id: unknown) => tables[table].find((r) => r.id === id);
  const related = (table: string, field: string, id: unknown) => tables[table].filter((r) => r[field] === id);
  const desc = (rows: Row[], key = "id") => [...rows].sort((a, b) => a[key]! > b[key]! ? -1 : a[key] === b[key] ? 0 : 1);
  const titleSummary = (id: unknown) => {
    const title = findId("pengajuanJudul", id)!;
    return { ...title, mahasiswa: findId("pengguna", title.idMahasiswa), bimbingan: tables.bimbingan.find((b) => b.idPengajuan === id) ?? null };
  };
  function hydrate(name: string, r: Row): Row {
    if (name === "bimbingan") return { ...r, pengajuan: titleSummary(r.idPengajuan) };
    if (name === "pengajuanJudul") return { ...r, mahasiswa: findId("pengguna", r.idMahasiswa), bimbingan: tables.bimbingan.find((b) => b.idPengajuan === r.id) ?? null,
      sempro: tables.pendaftaranSempro.filter((s) => s.idPengajuan === r.id).map((s) => hydrate("pendaftaranSempro", s))[0] ?? null };
    if (name === "pendaftaranSempro") return { ...r, pengajuan: titleSummary(r.idPengajuan), jadwal: related("jadwalSempro", "idSempro", r.id).map((j) => hydrate("jadwalSempro", j))[0], penguji: related("penugasanPenguji", "idSempro", r.id) };
    if (name === "jadwalSempro") {
      const sempro = findId("pendaftaranSempro", r.idSempro)!;
      return { ...r, beritaAcara: related("beritaAcara", "idJadwal", r.id)[0] ?? null, sempro: {
        ...sempro, pengajuan: titleSummary(sempro.idPengajuan), penguji: related("penugasanPenguji", "idSempro", r.idSempro),
      } };
    }
    if (name === "beritaAcara") {
      const j = findId("jadwalSidang", r.idJadwalSidang), s = j && findId("pendaftaranSidang", j.idSidang);
      return { ...r, revisiList: desc(related("revisiDokumen", "beritaAcaraId", r.id), "versi"),
        jadwalSidang: j && s ? { ...j, sidang: { ...s, pengajuan: hydrate("pengajuanJudul", findId("pengajuanJudul", s.idPengajuan)!), penguji: related("penugasanPenguji", "idSidangDaftar", s.id) } } : null };
    }
    if (name === "revisiDokumen") return { ...r, beritaAcara: hydrate("beritaAcara", findId("beritaAcara", r.beritaAcaraId)!) };
    if (name === "penugasanPenguji" || name === "konfirmasiJadwalSidang") return { ...r, dosen: findId("pengguna", r.idDosenPenguji ?? r.dosenId) };
    if (name === "jadwalSidang") {
      const s = findId("pendaftaranSidang", r.idSidang);
      return { ...r, konfirmasiList: related("konfirmasiJadwalSidang", "jadwalSidangId", r.id).map((c) => hydrate("konfirmasiJadwalSidang", c)),
        riwayatList: related("riwayatJadwalSidang", "jadwalSidangId", r.id), permohonanList: related("permohonanSidang", "jadwalSidangId", r.id),
        penilaianList: related("penilaianSidang", "idJadwalSidang", r.id), documents: related("dokumenVerifikasi", "idJadwalSidang", r.id),
        beritaAcaraList: related("beritaAcara", "idJadwalSidang", r.id).map((b) => hydrate("beritaAcara", b)),
        sidang: s ? { ...s, pengajuan: hydrate("pengajuanJudul", findId("pengajuanJudul", s.idPengajuan)!), penguji: related("penugasanPenguji", "idSidangDaftar", s.id) } : null };
    }
    if (name === "pendaftaranSidang") return { ...r, pengajuan: hydrate("pengajuanJudul", findId("pengajuanJudul", r.idPengajuan)!),
      penguji: desc(related("penugasanPenguji", "idSidangDaftar", r.id)).map((p) => hydrate("penugasanPenguji", p)),
      checklist: related("checklistDokumen", "idSidangDaftar", r.id), jadwalList: desc(related("jadwalSidang", "idSidang", r.id)).map((j) => hydrate("jadwalSidang", j)) };
    return r;
  }
  function matches(r: Row, where: Row = {}): boolean {
    return Object.entries(where).every(([key, expected]) => {
      if (expected === undefined) return true;
      if (key === "AND") return (expected as Row[]).every((x) => matches(r, x));
      if (key === "OR") return (expected as Row[]).some((x) => matches(r, x));
      const actual = r[key];
      if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
      if (expected !== null && typeof expected === "object") {
        const c = row(expected);
        if ("in" in c) return (c.in as unknown[]).includes(actual);
        if ("notIn" in c) return !(c.notIn as unknown[]).includes(actual);
        if ("isNot" in c) return actual !== c.isNot;
        if ("not" in c) return actual !== c.not;
        if ("gt" in c) return Number(actual) > Number(c.gt);
        if ("gte" in c) return Number(actual) >= Number(c.gte);
        if ("lte" in c) return Number(actual) <= Number(c.lte);
        if ("lt" in c) return Number(actual) < Number(c.lt);
        if ("some" in c) return Array.isArray(actual) && actual.some((x) => matches(row(x), row(c.some)));
        if ("contains" in c) return String(actual).includes(String(c.contains));
        if (actual === undefined && key.includes("_")) return matches(r, c);
        return actual !== null && actual !== undefined && matches(row(actual), c);
      }
      return actual === expected;
    });
  }
  function update(r: Row, data: Row) { for (const [key, value] of Object.entries(data)) if (value !== undefined) r[key] = value && typeof value === "object" && "increment" in value ? Number(r[key]) + Number(row(value).increment) : clone(value); return clone(r); }
  const db: Row = {};
  for (const name of names) {
    const find = (args: Row = {}) => {
      let found = tables[name].filter((r) => matches(hydrate(name, r), row(args.where ?? {})));
      if (args.orderBy) for (const order of (Array.isArray(args.orderBy) ? [...args.orderBy].reverse() : [args.orderBy])) {
        const [key, dir] = Object.entries(row(order))[0];
        found = [...found].sort((a, b) => (a[key] === b[key] ? 0 : a[key]! > b[key]! ? 1 : -1) * (dir === "desc" ? -1 : 1));
      }
      if (args.cursor) found = found.slice(found.findIndex((r) => matches(r, row(args.cursor))) + Number(args.skip ?? 0));
      else if (args.skip) found = found.slice(Number(args.skip));
      return args.take ? found.slice(0, Number(args.take)) : found;
    };
    const unique = async (args: Row) => { const r = find(args)[0]; return r ? clone(hydrate(name, r)) : null; };
    const create = async ({ data }: { data: Row }) => {
      const defaults: Row = name === "pendaftaranSidang" ? { statusBerkas: "draft", statusDraft: "draft", idDosenPembimbingSidang: null, siklusKe: 1, ipk: null }
        : name === "jadwalSidang" ? { versi: 1, status: "draft", statusPelaksanaan: "terjadwal", statusKonfirmasiDosen: "menunggu", revisiUndangan: 0 }
          : name === "penugasanPenguji" ? { isPengganti: false } : name === "checklistDokumen" ? { statusItem: "kosong", filePindaian: null }
            : name === "konfirmasiJadwalSidang" ? { status: "menunggu", catatan: null } : name === "beritaAcara" ? { hasil: null, keputusanPenguji1: null, statusRevisi: null }
              : name === "revisiDokumen" ? { status: "menunggu_persetujuan" } : name === "penilaianSidang" ? { status: "draft", nilaiAkhir: "0", izinSusulan: false }
                : name === "pengumuman" ? { deletedAt: null, notifikasiDikirimAt: null } : name === "permohonanSidang" ? { status: "menunggu" } : {};
      const r = { id: ++sequence, ...defaults, ...clone(data) };
      tables[name].push(r);
      return clone(r);
    };
    db[name] = { findUnique: unique, findFirst: unique, findUniqueOrThrow: async (a: Row) => { const r = await unique(a); assert.ok(r, name); return r; },
      findMany: async (args: Row = {}) => find(args).map((r) => clone(hydrate(name, r))), count: async (a: Row) => find(a).length, create,
      createMany: async (a: { data: Row[] }) => { for (const data of a.data) await create({ data }); return { count: a.data.length }; },
      update: async (a: Row) => { const r = find(a)[0]; assert.ok(r, `Missing ${name}`); return update(r, row(a.data)); },
      updateMany: async (a: Row) => { const found = find(a); for (const r of found) update(r, row(a.data)); return { count: found.length }; },
      upsert: async (a: Row) => { const r = find(a)[0]; return r ? update(r, row(a.update)) : create({ data: row(a.create) }); },
    };
  }
  db.$queryRaw = async () => [];
  db.$transaction = async (work: (tx: unknown) => Promise<unknown>) => {
    let release!: () => void;
    const previous = queue;
    queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const before = clone(tables);
    try { return await work(db); } catch (error) { for (const name of names) tables[name] = before[name]; throw error; } finally { release(); }
  };
  return { db: db as unknown as PrismaClient, tables, users };
}
