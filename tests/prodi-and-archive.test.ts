import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, exportArchiveCsv, importArchiveCsv } from "../src/lib/academic/archive-csv";
import { canDecideAccount, isSameProdi } from "../src/lib/accounts/policy";
import type { AccountIdentity } from "../src/lib/accounts/policy";
import type { Tx } from "../src/lib/academic/archive-csv";

test("CSV parser handles quotes, commas, multiline and escaped quotes", () => {
  const csv = [
    'judul,nama_penulis,tahun,nim,prodi',
    '"Sistem IoT, GPS dan Whatsapp","MULANA BELLA",2025,211001028,Informatika',
    '"Metode ""MFEP"" Dalam SPK","CITRA",2025,211001049,"Sistem Informasi"',
  ].join("\n");

  const rows = parseCsv(csv);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ["judul", "nama_penulis", "tahun", "nim", "prodi"]);
  assert.equal(rows[1][0], "Sistem IoT, GPS dan Whatsapp");
  assert.equal(rows[1][1], "MULANA BELLA");
  assert.equal(rows[1][4], "Informatika");
  assert.equal(rows[2][0], 'Metode "MFEP" Dalam SPK');
  assert.equal(rows[2][4], "Sistem Informasi");
});

test("CSV export and import round-trip with preprocessing keywords", async () => {
  type ArchiveEntry = {
    id: bigint;
    judul: string;
    namaPenulis: string | null;
    tahun: string | null;
    nim: string | null;
    prodi: string | null;
    keywords: unknown;
    createdAt?: Date;
    updatedAt?: Date;
  };
  const archiveRows: ArchiveEntry[] = [];

  let seq = 1n;
  const mockTx = {
    arsipJudulSkripsi: {
      findMany: async () => archiveRows,
      deleteMany: async () => {
        const count = archiveRows.length;
        archiveRows.length = 0;
        return { count };
      },
      createMany: async ({ data }: { data: Omit<ArchiveEntry, "id">[] }) => {
        for (const item of data) {
          archiveRows.push({ id: seq++, ...item });
        }
        return { count: data.length };
      },
    },
  } as unknown as Tx;

  const csvData = [
    'judul,nama_penulis,tahun,nim,prodi',
    '"Rancang Bangun Sistem Informasi Berbasis Web","Bayu Ibrahim",2025,211001062,Informatika',
    '"Analisis Keamanan Jaringan Wireless","Taruna Fitrah",2025,211001058,Informatika',
  ].join("\n");

  const importResult = await importArchiveCsv(mockTx, csvData, "replace");
  assert.equal(importResult.imported, 2);
  assert.equal(importResult.skipped, 0);
  assert.equal(archiveRows.length, 2);
  assert.ok(Array.isArray(archiveRows[0].keywords));
  assert.ok((archiveRows[0].keywords as string[]).includes("rancang"));

  const exported = await exportArchiveCsv(mockTx);
  assert.ok(exported.includes("Rancang Bangun Sistem Informasi Berbasis Web"));
  assert.ok(exported.includes("Analisis Keamanan Jaringan Wireless"));
  assert.ok(exported.includes("Informatika"));
});

test("isSameProdi and prodi scoping for Kaprodi/Sekpro", () => {
  assert.equal(isSameProdi("Informatika", "Informatika"), true);
  assert.equal(isSameProdi("informatika", "INFORMATIKA"), true);
  assert.equal(isSameProdi("Informatika", "Sistem Informasi"), false);
  assert.equal(isSameProdi(null, "Informatika"), true);

  const kaprodiIF: AccountIdentity = {
    id: 10n,
    role: "kaprodi",
    statusAkun: "aktif",
    deletedAt: null,
    wajibGantiPassword: false,
    dosen: { isKaprodi: true, isSekpro: false, prodi: "Informatika" },
  };

  const mhsIF: AccountIdentity = {
    id: 20n,
    role: "mahasiswa",
    statusAkun: "menunggu_persetujuan",
    deletedAt: null,
    wajibGantiPassword: false,
    dosen: null,
    mahasiswa: { prodi: "Informatika" },
  };

  const mhsSI: AccountIdentity = {
    id: 30n,
    role: "mahasiswa",
    statusAkun: "menunggu_persetujuan",
    deletedAt: null,
    wajibGantiPassword: false,
    dosen: null,
    mahasiswa: { prodi: "Sistem Informasi" },
  };

  const dosenIF: AccountIdentity = {
    id: 40n,
    role: "dosen",
    statusAkun: "menunggu_persetujuan",
    deletedAt: null,
    wajibGantiPassword: false,
    dosen: { isKaprodi: false, isSekpro: false, prodi: "Informatika" },
  };

  const dosenSI: AccountIdentity = {
    id: 50n,
    role: "dosen",
    statusAkun: "menunggu_persetujuan",
    deletedAt: null,
    wajibGantiPassword: false,
    dosen: { isKaprodi: false, isSekpro: false, prodi: "Sistem Informasi" },
  };

  // Kaprodi IF can manage mahasiswa and dosen from Informatika
  assert.equal(canDecideAccount(kaprodiIF, mhsIF), true);
  assert.equal(canDecideAccount(kaprodiIF, dosenIF), true);

  // Kaprodi IF CANNOT manage mahasiswa or dosen from Sistem Informasi
  assert.equal(canDecideAccount(kaprodiIF, mhsSI), false);
  assert.equal(canDecideAccount(kaprodiIF, dosenSI), false);

  // Superadmin can manage any prodi
  const superadmin: AccountIdentity = {
    id: 1n,
    role: "superadmin",
    statusAkun: "aktif",
    deletedAt: null,
    wajibGantiPassword: false,
    dosen: null,
  };
  assert.equal(canDecideAccount(superadmin, mhsSI), true);
  assert.equal(canDecideAccount(superadmin, dosenSI), true);
});

test("assertSingleKaprodi allows distinct Kaprodi in different prodi", async (t) => {
  const navigation = mock.module("next/navigation", {
    exports: {
      redirect: () => { throw Error("Unexpected redirect"); },
      notFound: () => { throw Error("Unexpected notFound"); },
    },
  });
  t.after(() => navigation.restore());
  const { assertSingleKaprodi } = await import("../src/lib/accounts/store");

  type KaprodiUser = {
    id: bigint;
    role: string;
    statusAkun: string;
    deletedAt: Date | null;
    dosen: { isKaprodi: boolean; prodi: string };
  };
  const users: KaprodiUser[] = [
    {
      id: 10n,
      role: "kaprodi",
      statusAkun: "aktif",
      deletedAt: null,
      dosen: { isKaprodi: true, prodi: "Informatika" },
    },
  ];

  type FindFirstArgs = {
    where: {
      deletedAt?: Date | null;
      statusAkun?: string;
      id?: { not?: bigint };
      dosen?: { prodi?: string };
    };
  };

  const mockTx = {
    pengguna: {
      findFirst: async ({ where }: FindFirstArgs) => {
        return users.find((u) => {
          if (where.deletedAt !== u.deletedAt) return false;
          if (where.statusAkun !== u.statusAkun) return false;
          if (where.id?.not && where.id.not === u.id) return false;
          if (where.dosen?.prodi && u.dosen.prodi !== where.dosen.prodi) return false;
          return true;
        }) ?? null;
      },
    },
  } as unknown as Parameters<typeof assertSingleKaprodi>[0];

  // Another Kaprodi for Informatika should be rejected
  await assert.rejects(
    assertSingleKaprodi(mockTx, undefined, "Informatika"),
    /Sudah ada Kaprodi aktif untuk program studi Informatika/,
  );

  // But a Kaprodi for Sistem Informasi should be allowed!
  await assert.doesNotReject(
    assertSingleKaprodi(mockTx, undefined, "Sistem Informasi"),
  );
});
