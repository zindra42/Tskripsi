import { MAPPING_VERSION, canonical, digest, sealSnapshot, type Cell, type Row, type Snapshot } from "../../src/lib/migration/contract";
import { sourceCatalog, foreignKeys, tableOrder, sourceColumnType, type SourceColumn } from "../../src/lib/migration/catalog";

export const SYNTHETIC_PASSWORD = "$2y$12$" + "A".repeat(53);
function value(column: SourceColumn): Cell {
  if (column.nullable) return null;
  const definition = column.definition ?? "";
  const defaultValue = /->default\(([^)]*)\)/.exec(definition)?.[1];
  if (defaultValue) {
    if (defaultValue === "false" || defaultValue === "true") return defaultValue === "true";
    if (defaultValue.startsWith("'")) return defaultValue.slice(1, -1);
    if (/^\d+$/.test(defaultValue)) return Number(defaultValue);
  }
  if (column.type === "enum") return /\[\s*'([^']+)'/.exec(definition)![1];
  if (["id", "foreignId", "unsignedBigInteger", "bigInteger"].includes(column.type)) return "9007199254740993";
  if (/integer/i.test(column.type)) return 1;
  if (column.type === "boolean") return false;
  if (column.type === "json") return { $json: "{}" };
  if (column.type === "date") return "2026-10-20";
  if (["timestamp", "dateTime"].includes(column.type)) return "2026-10-20 08:01:02";
  if (column.type === "time") return "08:00:00";
  if (column.type === "year") return "2026";
  if (column.type === "decimal") return "80.01";
  return "synth";
}
// All rows and credentials in this generator are synthetic. No captured user data.
export function syntheticSnapshot(): Snapshot {
  const rows: Record<string, Row[]> = {};
  let next = 9007199254740993n;
  for (const [table, spec] of Object.entries(sourceCatalog.tables)) {
    const row: Row = Object.fromEntries(Object.entries(spec.columns).map(([c, t]) => [c, value(t)]));
    if (spec.columns.id) row.id = spec.columns.id.type === "uuid" ? "12345678-1234-4234-8234-123456789abc" : spec.columns.id.type === "id" ? String(next++) : "synthetic-session";
    rows[table] = [row];
  }
  for (const table of tableOrder()) for (const fk of foreignKeys(table)) {
    if (rows[table][0][fk.column] !== null) rows[table][0][fk.column] = rows[fk.table][0][fk.target];
  }
  const user = rows.pengguna[0]; user.password = SYNTHETIC_PASSWORD; user.email = "synthetic@example.test";
  user.created_at = "2026-10-20 08:01:02";
  rows.mahasiswa[0].nim = "211000001"; rows.dosen[0].nidn = "0000000001";
  for (const table of ["mahasiswa", "dosen", "admin_keuangan"]) rows[table][0].pengguna_id = user.id;
  rows.dosen_keahlian[0].dosen_id = user.id;
  rows.notifications[0].notifiable_type = "App\\Models\\Pengguna";
  rows.notifications[0].data = '{"url":"https://legacy.example.test/mahasiswa/status-sempro","id":9007199254740993}';
  rows.pendaftaran_sempro[0].dispensasi_id = rows.dispensasi_kehadiran_sempro[0].id;
  rows.dispensasi_kehadiran_sempro[0].pendaftaran_sempro_id = rows.pendaftaran_sempro[0].id;
  rows.dispensasi_kehadiran_sempro[0].mahasiswa_id = user.id;
  rows.berita_acara[0].hasil = "lulus_revisi"; rows.berita_acara[0].nilai = "79.99";
  rows.berita_acara[0].id_jadwal = rows.jadwal_sempro[0].id;
  rows.berita_acara[0].status_persetujuan = "menunggu_nilai_lengkap";
  rows.dokumen_verifikasi[0].token = "MiXeD" + "a".repeat(43);
  rows.dokumen_verifikasi[0].jenis_dokumen = "acc";
  rows.dokumen_verifikasi[0].snapshot_json = { $json: '{"file_acc_lama":"synth.pdf","id":9007199254740993}' };
  rows.dokumen_verifikasi[0].status = "digantikan";
  rows.dokumen_verifikasi[0].digantikan_oleh_id = "9007199254741999";
  rows.dokumen_verifikasi.push({ ...structuredClone(rows.dokumen_verifikasi[0]), id: "9007199254741999", token: "TokenSecond" + "B".repeat(37), status: "sah", versi: 2, digantikan_oleh_id: null });
  rows.pengajuan_judul[0].file_proposal = "synth.pdf"; rows.revisi_dokumen[0].file_draft = "synth.pdf";
  rows.revisi_dokumen[0].versi = 3;
  rows.pendaftaran_sidang[0].ipk = "3.99";
  rows.penilaian_sidang[0].nilai_akhir = "80.01";
  rows.penugasan_penguji[0].id_sidang_daftar = rows.pendaftaran_sidang[0].id;
  rows.checklist_dokumen[0].id_sidang_daftar = rows.pendaftaran_sidang[0].id;
  const deleted: Row = { ...user, id: "9007199254742999", deleted_at: "2026-10-05 12:00:00", email: "synthetic@example.test.deleted.1791160000", email_arsip: "synthetic@example.test", status_akun: "nonaktif" };
  rows.pengguna.push(deleted);
  rows.mahasiswa.push({ ...rows.mahasiswa[0], pengguna_id: deleted.id, nim: "211000001_DEL_1791160000", nim_arsip: "211000001" });
  return sealSnapshot({ format: "sias-controlled-export-v1", id: "synthetic-rehearsal", mappingVersion: MAPPING_VERSION,
    source: { driver: "mysql", sourceRevision: "synthetic-fixture-v1", exportedAt: "2026-11-08T08:00:00+08:00", timezone: "Asia/Makassar", timezoneEvidence: "Synthetic fixture explicitly uses WITA; not production evidence",
      migrations: sourceCatalog.migrations.map((m) => ({ name: m.name, sha256: m.sha256, batch: 1 })),
      schema: Object.fromEntries(Object.entries(sourceCatalog.tables).map(([t, s]) => [t, { columns: Object.keys(s.columns), primaryKey: s.primaryKey, unique: s.unique, columnTypes: Object.fromEntries(Object.entries(s.columns).map(([c, spec]) => [c, { type: sourceColumnType(spec), nullable: spec.nullable }])), foreignKeys: s.foreignKeys.map(({ column, table, target }) => ({ column, table, target })) }])),
      storageInventoryComplete: { private: true, public: true }, qrOrigins: ["https://legacy.example.test"] },
    tables: Object.fromEntries(Object.entries(rows).map(([t, r]) => [t, { rows: r, count: String(r.length), checksum: digest(r) }])), files: [],
  });
}
export function reseal(snapshot: Snapshot) {
  for (const table of Object.values(snapshot.tables)) { table.count = String(table.rows.length); table.checksum = digest(table.rows); }
  const { checksum: _checksum, ...input } = snapshot;
  void _checksum;
  return sealSnapshot(input);
}
export function rowKey(table: string, row: Row) { return canonical(sourceCatalog.tables[table].primaryKey.map((c) => row[c])); }
