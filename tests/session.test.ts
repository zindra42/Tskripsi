import { affiliation } from "./helpers/organization";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { mock } from "node:test";
import type { Prisma, PrismaClient } from "../src/generated/prisma/client";
import type { publicUserSelect } from "../src/lib/auth/session";
import { newSessionToken, sessionExpiry, tokenHash } from "../src/lib/auth/tokens";

const requireForTest = createRequire(import.meta.url);
const nextHeaders = requireForTest("next/headers") as typeof import("next/headers");
type SessionRecord = Prisma.AuthSessionGetPayload<{
  include: { pengguna: { select: typeof publicUserSelect } };
}>;

const sessionA = "e5ba0827-de8c-4155-b3a7-cff50b9501ab";
const sessionB = "7d1fd9a9-4224-4459-81c0-e20455eaa3c7";

function sessionRecord(token: string, publicId: string, remember = false): SessionRecord {
  const now = new Date();
  return {
    tokenHash: tokenHash(token), publicId, penggunaId: 1n, authVersion: 0,
    activeRole: "kaprodi", remember, createdAt: now, lastActivity: now,
    expiresAt: sessionExpiry(now, remember),
    pengguna: {
      id: 1n, nama: "Pengguna sintetis", email: null, role: "dosen", statusAkun: "aktif",
      catatanPenolakan: null, wajibGantiPassword: false, authVersion: 0, deletedAt: null, fakultasId: null, fakultas: null,
      dosen: { ...affiliation(), isKaprodi: true, isSekpro: false, prodi: "Informatika" },
      mahasiswa: null,
    },
  };
}

function request(method: string, sessionId: string | null = sessionA) {
  const headers = new Headers();
  if (sessionId !== null) headers.set("X-SIAS-Session", sessionId);
  return new Request("http://localhost:3100/api/session", { method, headers });
}

test("regresi aktivitas sesi menggunakan cookie dan database sintetis", async (t) => {
  // Next normally selects these server exports during bundling. Node's test runner needs a module mock.
  const navigationMock = mock.module("next/navigation", {
    exports: {
      redirect: () => { throw new Error("Unexpected redirect in session unit test"); },
      notFound: () => { throw new Error("Unexpected notFound in session unit test"); },
    },
  });
  t.after(() => navigationMock.restore());
  const { getSession, sessionCookieName } = await import("../src/lib/auth/session");
  const { DELETE, POST } = await import("../src/app/api/session/route");
  const databaseGlobal = globalThis as unknown as { siasDatabase?: PrismaClient };
  const previousDatabase = databaseGlobal.siasDatabase;
  const previousOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "http://localhost:3100";
  let origin = process.env.APP_ORIGIN;
  let browserToken = newSessionToken();
  const rows = new Map<string, SessionRecord>();
  const cookieWrites = mock.fn();
  const cookieStore = {
    get: () => ({ name: sessionCookieName(), value: browserToken }),
    set: cookieWrites,
  };
  const cookieMock = mock.method(nextHeaders, "cookies", async () => (
    cookieStore as unknown as Awaited<ReturnType<typeof nextHeaders.cookies>>
  ));
  const headersMock = mock.method(nextHeaders, "headers", async () => (
    new Headers({ origin }) as Awaited<ReturnType<typeof nextHeaders.headers>>
  ));
  const db = {
    authSession: {
      findUnique: mock.fn(async ({ where }: Prisma.AuthSessionFindUniqueArgs) => {
        const row = rows.get(String(where.tokenHash));
        return row ? structuredClone(row) : null;
      }),
      updateMany: mock.fn(async ({ where, data }: Prisma.AuthSessionUpdateManyArgs) => {
        const row = rows.get(String(where?.tokenHash));
        if (!row || row.expiresAt <= new Date() || row.authVersion !== where?.authVersion) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      deleteMany: mock.fn(async ({ where }: Prisma.AuthSessionDeleteManyArgs) => {
        const row = rows.get(String(where?.tokenHash));
        if (!row || (where?.publicId !== undefined && row.publicId !== where.publicId)
            || (where?.remember !== undefined && row.remember !== where.remember)) return { count: 0 };
        rows.delete(row.tokenHash);
        return { count: 1 };
      }),
    },
  };
  databaseGlobal.siasDatabase = db as unknown as PrismaClient;
  t.after(() => {
    cookieMock.mock.restore();
    headersMock.mock.restore();
    databaseGlobal.siasDatabase = previousDatabase;
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
  });

  await t.test("heartbeat lama tidak menimpa switch role yang sudah selesai", async () => {
    const row = sessionRecord(browserToken, sessionA);
    rows.set(row.tokenHash, row);
    db.authSession.findUnique.mock.mockImplementationOnce(async () => {
      const heartbeatSnapshot = structuredClone(row);
      // The role switch commits after the heartbeat read, before its activity update.
      row.activeRole = "dosen";
      return heartbeatSnapshot;
    });
    assert.ok(await getSession());
    assert.equal(row.activeRole, "dosen");
    assert.equal(Object.hasOwn(db.authSession.updateMany.mock.calls.at(-1)!.arguments[0].data, "activeRole"), false);
  });

  await t.test("refresh yang kehilangan sesi tidak menghidupkannya kembali", async () => {
    const row = sessionRecord(browserToken, sessionA);
    rows.set(row.tokenHash, row);
    db.authSession.findUnique.mock.mockImplementationOnce(async () => {
      const snapshot = structuredClone(row);
      rows.delete(row.tokenHash);
      return snapshot;
    });
    assert.equal(await getSession(), null);
    assert.equal(rows.has(row.tokenHash), false);
  });

  for (const remember of [false, true]) {
    await t.test(`timer tab A mempertahankan sesi baru tab B dengan remember=${remember}`, async () => {
      browserToken = newSessionToken();
      const row = sessionRecord(browserToken, sessionB, remember);
      rows.set(row.tokenHash, row);
      const response = await DELETE(request("DELETE", sessionA));
      assert.equal(response.status, 409);
      assert.equal(rows.get(row.tokenHash), row);
      assert.equal(cookieWrites.mock.callCount(), 0);
      const heartbeat = await POST(request("POST", sessionA));
      assert.equal(heartbeat.status, 409);
    });
  }

  await t.test("timeout tidak mencabut sesi remember meskipun identifier cocok", async () => {
    const response = await DELETE(request("DELETE", sessionB));
    assert.equal(response.status, 409);
    assert.equal(rows.get(tokenHash(browserToken))?.remember, true);
    assert.equal(cookieWrites.mock.callCount(), 0);
  });

  await t.test("timeout mencabut sesi biasa yang cocok tanpa respons penghapus cookie", async () => {
    browserToken = newSessionToken();
    const row = sessionRecord(browserToken, sessionA);
    rows.set(row.tokenHash, row);
    assert.equal((await POST(request("POST"))).status, 200);
    const response = await DELETE(request("DELETE"));
    assert.equal(response.status, 204);
    assert.equal(rows.has(row.tokenHash), false);
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(cookieWrites.mock.callCount(), 0);
  });

  await t.test("identifier timeout hilang atau rusak ditolak sebelum database", async () => {
    const before = db.authSession.deleteMany.mock.callCount();
    for (const sessionId of [null, "bukan-uuid"]) {
      assert.equal((await DELETE(request("DELETE", sessionId))).status, 400);
    }
    assert.equal(db.authSession.deleteMany.mock.callCount(), before);
  });

  await t.test("mutasi dari Origin lain ditolak", async () => {
    origin = "http://untrusted.invalid";
    assert.equal((await DELETE(request("DELETE"))).status, 403);
    assert.equal((await POST(request("POST"))).status, 403);
  });
});

test("cookie produksi mempertahankan prefix Host dan Origin HTTPS tanpa melemahkan mode lokal", async (t) => {
  const navigationMock = mock.module("next/navigation", { exports: {
    redirect: () => { throw new Error("Unexpected redirect"); },
    notFound: () => { throw new Error("Unexpected notFound"); },
  } });
  const previousMode = process.env.NODE_ENV;
  const previousOrigin = process.env.APP_ORIGIN;
  const writes: { name: string; value: string; options: Record<string, unknown> }[] = [];
  let origin: string | undefined = "https://sias.example.invalid";
  const cookieMock = mock.method(nextHeaders, "cookies", async () => ({
    set: (name: string, value: string, options: Record<string, unknown>) => { writes.push({ name, value, options }); },
  }) as unknown as Awaited<ReturnType<typeof nextHeaders.cookies>>);
  const headersMock = mock.method(nextHeaders, "headers", async () => new Headers(origin ? { origin } : {}));
  t.after(() => {
    navigationMock.restore(); cookieMock.mock.restore(); headersMock.mock.restore();
    if (previousMode === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: previousMode });
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
  });
  const { setSessionCookie, clearSessionCookie } = await import("../src/lib/auth/session");
  const { hasTrustedOrigin } = await import("../src/lib/auth/origin");
  Object.assign(process.env, { NODE_ENV: "production", APP_ORIGIN: origin });
  assert.equal(await hasTrustedOrigin(), true);
  const expires = new Date(Date.now() + 604800000);
  await setSessionCookie("synthetic-token", false, expires);
  await setSessionCookie("synthetic-token", true, expires);
  await clearSessionCookie();
  for (const write of writes) {
    assert.equal(write.name, "__Host-sias_session");
    assert.equal(write.options.secure, true);
    assert.equal(write.options.httpOnly, true);
    assert.equal(write.options.sameSite, "lax");
    assert.equal(write.options.path, "/");
    assert.equal(Object.hasOwn(write.options, "domain"), false);
  }
  assert.equal(Object.hasOwn(writes[0].options, "expires"), false);
  assert.equal(writes[1].options.expires, expires);
  assert.equal(writes[2].options.maxAge, 0);
  assert.equal((writes[2].options.expires as Date).getTime(), 0);
  for (const untrusted of [undefined, "http://sias.example.invalid", "https://foreign.invalid", "https://sias.example.invalid:444", "invalid"]) {
    origin = untrusted;
    assert.equal(await hasTrustedOrigin(), false);
  }
  origin = "http://127.0.0.1:3102";
  process.env.APP_ORIGIN = origin;
  assert.equal(await hasTrustedOrigin(), false);
  Object.assign(process.env, { NODE_ENV: "development" });
  assert.equal(await hasTrustedOrigin(), true);
  await setSessionCookie("synthetic-token", false, expires);
  assert.equal(writes.at(-1)?.name, "sias_session");
  assert.equal(writes.at(-1)?.options.secure, false);
});
