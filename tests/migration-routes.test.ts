import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { sha256, type ManifestEntry } from "../src/lib/migration/contract";
import type { NextRequest } from "next/server";

test("legacy endpoints enforce document ownership, lifecycle, exact bytes and sidang ID fallback", async (t) => {
  const bytes = Buffer.from("%PDF-1.4 original synthetic PHP document");
  let actor = { id: 1n, role: "mahasiswa", statusAkun: "aktif", wajibGantiPassword: false, dosen: null as null | object };
  let signedIn = true, reads = 0, renders = 0, docLookup: unknown;
  const doc = { id: 81n, versi: 2, status: "sah", jenisDokumen: "undangan", token: "MiXeD" + "A".repeat(43), idPengajuan: 11n, idSidang: null,
    idJadwalSidang: null, penandatanganUserId: 2n, jadwalSempro: null };
  let entries: ManifestEntry[] = [{ table: "dokumen_verifikasi", pk: '["81"]', pointer: "/cached_pdf", disk: "public", path: "synthetic.pdf",
    bytes: String(bytes.length), mime: "application/pdf", fileSha256: sha256(bytes), version: "2", status: "sah", urls: [], purpose: "pdf-cache", ownershipEvidence: "Synthetic attestation" }];
  const tx = {
    authSession: { findUniqueOrThrow: async () => ({ activeRole: actor.role }) },
    pengguna: { findUnique: async () => actor },
    pengajuanJudul: { findUnique: async ({ where }: { where: { id: bigint } }) => where.id === 11n ? { id: 11n, idMahasiswa: 1n, bimbingan: { idDosenPembimbing: 2n } } : null },
    pendaftaranSidang: { findUnique: async () => ({ id: 12n, idPengajuan: 11n }) },
    dokumenVerifikasi: { findUnique: async () => doc, findFirst: async (args: unknown) => { docLookup = args; return doc; } },
    legacyImportRow: { findUnique: async () => ({ binding: "synthetic-binding" }) },
    legacyImportFile: { findMany: async () => entries.map((descriptor) => ({ descriptor, path: descriptor.path })) },
  };
  const mocks = [
    mock.module("../src/lib/auth/session", { exports: { getSession: async () => signedIn ? { user: actor, tokenHash: "synthetic-session" } : null,
      requireSession: async () => ({ user: actor, tokenHash: "synthetic-session" }) } }),
    mock.module("../src/lib/accounts/store", { exports: { accountTransaction: async (work: (tx: unknown) => unknown) => work(tx), checkedActor: async () => actor } }),
    mock.module("../src/lib/academic/files", { exports: { readStoredFile: async (_path: string, disks: string[]) => { reads++; assert.deepEqual(disks, ["public"]); return bytes; } } }),
    mock.module("../src/lib/sempro/documents", { exports: { renderSuratUndanganPdf: () => { renders++; return Buffer.from("new"); }, renderBeritaAcaraPdf: () => { renders++; return Buffer.from("new"); } } }),
    mock.module("../src/lib/sidang/documents", { exports: { renderSidangPdf: () => { renders++; return Buffer.from("new"); } } }),
    mock.module("../src/lib/sidang/store", { exports: { sidangRecord: () => { throw new Error("unexpected sidang lookup"); }, canRead: () => false } }),
    mock.module("../src/lib/db", { exports: { database: () => tx } }),
  ];
  t.after(() => mocks.forEach((m) => m.restore()));
  const sempro = await import("../src/app/api/sempro/dokumen/[token]/route");
  const sidang = await import("../src/app/api/sidang/dokumen/[token]/route");
  const legacy = await import("../src/app/[...legacy]/route");
  const sidangAlias = await import("../src/app/sidang/dokumen-terbit/[id]/route");
  const request = new Request("http://sias.invalid/synthetic") as NextRequest;
  const token = () => ({ params: Promise.resolve({ token: doc.token }) });
  const result = await sempro.GET(request, token());
  assert.equal(result.status, 200); assert.equal(await result.text(), bytes.toString()); assert.equal(renders, 0);
  assert.equal(result.headers.get("Cache-Control"), "private, no-store");
  actor = { ...actor, id: 9n }; const before = reads;
  assert.equal((await sempro.GET(request, token())).status, 404); assert.equal(reads, before);
  actor = { ...actor, id: 1n };
  doc.status = "dicabut"; assert.equal((await sempro.GET(request, token())).status, 410); assert.equal(reads, before);
  doc.status = "sah"; entries = []; assert.equal((await sempro.GET(request, token())).status, 409); assert.equal(renders, 0);
  doc.jenisDokumen = "acc_sidang"; assert.equal((await sidang.GET(request, token())).status, 409); assert.equal(renders, 0);
  const response = await legacy.GET(request, { params: Promise.resolve({ legacy: ["sidang", "dokumen-terbit", "12"] }) });
  assert.equal(response.status, 307); assert.ok(response.headers.get("location")?.endsWith(doc.token));
  assert.equal((docLookup as { where: { idPengajuan: bigint } }).where.idPengajuan, 11n);
  assert.equal((await sidangAlias.GET(request, { params: Promise.resolve({ id: "12" }) })).status, 409);
  assert.equal((docLookup as { where: { idPengajuan: bigint } }).where.idPengajuan, 11n);
  signedIn = false;
  assert.equal((await legacy.GET(request, { params: Promise.resolve({ legacy: ["proposal", "download", "11"] }) })).status, 401);
  assert.equal(reads, before);
});
