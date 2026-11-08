import assert from "node:assert/strict";
import type { PrismaClient } from "../../src/generated/prisma/client";
import type { Account } from "../../src/lib/accounts/store";
import type { AuthenticatedSession } from "../../src/lib/auth/session";
import { tokenHash } from "../../src/lib/auth/tokens";
import { availableRoles } from "../../src/lib/auth/policy";
import { affiliation, program } from "./organization";
type Row = Record<string, unknown>;
const clone = <T>(value: T): T => structuredClone(value);
const asRow = (value: unknown) => value as Row;

export function fixture(id: bigint, role: Account["role"] = "mahasiswa", flags = { isKaprodi: false, isSekpro: false }): Account {
  const lecturer = ["dosen", "kaprodi", "sekpro"].includes(role);
  return {
    id, nama: `Pengguna ${id}`, email: `user${id}@example.invalid`, emailArsip: null,
    role, statusAkun: "aktif", catatanPenolakan: null, wajibGantiPassword: false,
    fakultasId: null, fakultas: null, authVersion: 0, deletedAt: null, dibuatOlehSuperAdmin: false,
    mahasiswa: role === "mahasiswa" ? { penggunaId: id, nim: `2200${id}`, nimArsip: null, semester: 9, ...affiliation(), prodi: "Informatika", noHp: null, createdAt: null, updatedAt: null } : null,
    dosen: lecturer ? { penggunaId: id, nidn: `9911${id}`, nidnArsip: null, noHp: null, ...affiliation(), prodi: "Informatika",
      kuotaBimbingan: 8, ...flags, keahlian: [], createdAt: null, updatedAt: null } : null,
  };
}

export function session(user: Account, activeRole = availableRoles(user)[0]): AuthenticatedSession {
  return {
    tokenHash: tokenHash(`session-${user.id}`), publicId: "763e46a1-d3be-4da6-ab98-0439ce709a43",
    penggunaId: user.id, authVersion: user.authVersion, activeRole, remember: false,
    createdAt: new Date(), lastActivity: new Date(), expiresAt: new Date(Date.now() + 300000),
    user, pengguna: user,
  };
}

// Synthetic delegates implement only operations used by these services. No network or PostgreSQL driver is opened.
export function syntheticDatabase(users: Account[], sessions: AuthenticatedSession[]) {
  const tables: Record<string, Row[]> = Object.fromEntries([
    "fakultas", "programStudi", "pengguna", "mahasiswa", "dosen", "dosenKeahlian", "bidangKeahlian", "adminKeuangan", "authSession",
    "passwordResetRequest", "biodataChangeRequest", "keahlianChangeRequest", "logAktivitas", "logSuperAdmin", "pengaturanSistem",
  ].map((name) => [name, []]));
  for (const user of users) {
    tables.pengguna.push(asRow(clone(user)));
    if (user.mahasiswa) tables.mahasiswa.push(asRow(clone(user.mahasiswa)));
    if (user.dosen) tables.dosen.push(asRow(clone(user.dosen)));
  }
  tables.fakultas = [program().fakultas, program(2n, 2n).fakultas];
  tables.programStudi = [program(), program(2n, 2n), program(3n, 1n)];
  tables.authSession = sessions.map((value) => asRow(clone(value)));
  tables.bidangKeahlian = [{ id: 1n, namaBidang: "Jaringan" }, { id: 2n, namaBidang: "Data" }, { id: 3n, namaBidang: "Web" }];
  const queries: string[] = [];
  let queue = Promise.resolve();
  let sequence = 100n;

  function hydrate(name: string, row: Row): Row {
    if (name === "fakultas") return { ...row, pengguna: tables.pengguna.filter((u) => u.fakultasId === row.id && u.role === "dekan" && !u.deletedAt) };
    if (name === "programStudi") return { ...row, fakultas: tables.fakultas.find((f) => f.id === row.fakultasId), dosen: tables.dosen.filter((d) => d.programStudiId === row.id) };
    if (name === "pengguna") {
      const dosen = tables.dosen.find((value) => value.penggunaId === row.id);
      const student = tables.mahasiswa.find((value) => value.penggunaId === row.id);
      const mapped = (profile: Row) => ({ ...profile, programStudi: tables.programStudi.find((p) => p.id === profile.programStudiId) ? hydrate("programStudi", tables.programStudi.find((p) => p.id === profile.programStudiId)!) : null });
      return { ...row, fakultas: tables.fakultas.find((f) => f.id === row.fakultasId) ?? null, mahasiswa: student ? mapped(student) : null,
        dosen: dosen ? { ...mapped(dosen), keahlian: tables.dosenKeahlian.filter((value) => value.dosenId === row.id) } : null };
    }
    if (["mahasiswa", "dosen"].includes(name)) {
      const user = tables.pengguna.find((value) => value.id === row.penggunaId);
      return { ...row, pengguna: user ? hydrate("pengguna", user) : null };
    }
    return row;
  }

  function matches(row: Row, where: Row = {}): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (value === undefined) return true;
      if (key === "AND") return (Array.isArray(value) ? value as Row[] : [value as Row]).every((part) => matches(row, part));
      if (key === "OR") return (value as Row[]).some((part) => matches(row, part));
      const actual = row[key];
      if (value && typeof value === "object" && !(value instanceof Date)) {
        const filter = asRow(value);
        if ("isNot" in filter) return filter.isNot === null ? actual != null : !matches(asRow(actual), asRow(filter.isNot));
        if ("is" in filter) return filter.is === null ? actual === null : actual != null && matches(asRow(actual), asRow(filter.is));
        if ("not" in filter) return actual !== filter.not;
        if ("in" in filter) return (filter.in as unknown[]).includes(actual);
        if ("lte" in filter) return actual instanceof Date && actual <= (filter.lte as Date);
        if ("gt" in filter) return actual instanceof Date && actual > (filter.gt as Date);
        return actual !== null && actual !== undefined && matches(asRow(actual), filter);
      }
      return actual === value;
    });
  }

  function update(row: Row, data: Row) {
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      row[key] = value && typeof value === "object" && "increment" in value
        ? Number(row[key]) + Number(asRow(value).increment) : value;
    }
    return clone(row);
  }

  const db: Row = {};
  for (const name of Object.keys(tables)) {
    const find = (args: Row = {}) => tables[name].filter((row) => matches(hydrate(name, row), args.where as Row));
    db[name] = {
      findUnique: async (args: Row) => { const row = find(args)[0]; return row ? clone(hydrate(name, row)) : null; },
      findUniqueOrThrow: async (args: Row) => { const row = find(args)[0]; assert.ok(row, `Missing ${name}`); return clone(hydrate(name, row)); },
      findFirst: async (args: Row) => { const row = find(args)[0]; return row ? clone(hydrate(name, row)) : null; },
      findMany: async (args: Row = {}) => find(args).map((row) => clone(hydrate(name, row))),
      count: async (args: Row) => find(args).length,
      create: async ({ data }: { data: Row }) => {
        const defaults = name === "pengguna" ? { ...fixture(++sequence, data.role as Account["role"]), mahasiswa: null, dosen: null }
          : name === "passwordResetRequest" ? { status: "menunggu", token: null, tokenHash: null, authVersion: null, expiresAt: null }
            : ["biodataChangeRequest", "keahlianChangeRequest"].includes(name) ? { status: "pending" } : {};
        const row = { id: ++sequence, ...defaults, ...data };
        tables[name].push(row);
        return clone(row);
      },
      update: async (args: Row) => {
        const row = find(args)[0];
        assert.ok(row, `Missing synthetic ${name} row`);
        return update(row, args.data as Row);
      },
      updateMany: async (args: Row) => {
        const rows = find(args);
        rows.forEach((row) => update(row, args.data as Row));
        return { count: rows.length };
      },
      deleteMany: async (args: Row) => {
        const rows = find(args);
        tables[name] = tables[name].filter((row) => !rows.includes(row));
        return { count: rows.length };
      },
      createMany: async ({ data }: { data: Row[] }) => { tables[name].push(...clone(data)); return { count: data.length }; },
      upsert: async (args: Row) => {
        const row = find(args)[0];
        if (row) return update(row, args.update as Row);
        const created = { id: ++sequence, ...(args.create as Row) };
        tables[name].push(created);
        return clone(created);
      },
    };
  }
  db.$transaction = async (work: (tx: unknown) => Promise<unknown>) => {
    let release: (() => void) | undefined;
    let snapshot: typeof tables | undefined;
    const tx = { ...db, $queryRaw: async (parts: TemplateStringsArray) => {
      queries.push(parts.join("?"));
      if (parts[0].includes("pg_advisory_xact_lock")) {
        const previous = queue;
        queue = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        snapshot = clone(tables);
      }
      return [];
    } };
    try { return await work(tx); }
    catch (error) {
      if (snapshot) for (const name of Object.keys(tables)) tables[name] = snapshot[name];
      throw error;
    } finally { release?.(); }
  };
  return { db: db as unknown as PrismaClient, tables, queries };
}
