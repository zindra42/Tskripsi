import { z } from "zod";
import { officialResult } from "./policy";

const sourceId = z.string().regex(/^[1-9]\d*$/).refine((v) => BigInt(v) <= 9223372036854775807n, "ID melebihi BIGINT PostgreSQL");
export type LegacyLink = { id: string; id_sidang_daftar: string | null };
export type LegacyInvitation = { id: string; jenis_dokumen: string; id_jadwal: string | null;
  id_jadwal_sidang: string | null; status: string; snapshot_json: unknown };
export type ReconciliationIssue = { table: string; id: string; code: string; reference: string | null };

// Offline preflight only. It neither queries a database nor mutates source records.
export function reconcileSidang(input: { registrations: { id: string; id_pengajuan: string; siklus_ke: string }[];
  assignments: LegacyLink[]; checklist: LegacyLink[]; schedules: { id: string; id_sidang: string; status: string; versi: number }[];
  invitations: LegacyInvitation[] }) {
  const issues: ReconciliationIssue[] = [];
  for (const [table, rows] of [["pendaftaran_sidang", input.registrations], ["jadwal_sidang", input.schedules],
    ["penugasan_penguji", input.assignments], ["checklist_dokumen", input.checklist], ["dokumen_verifikasi", input.invitations]] as const) {
    const seen = new Set<string>();
    for (const row of rows) {
      const id = sourceId.parse(row.id);
      if (seen.has(id)) issues.push({ table, id, code: "duplicate-primary-key", reference: id });
      seen.add(id);
    }
  }
  const ids = new Set(input.registrations.map((row) => sourceId.parse(row.id)));
  const schedules = new Map(input.schedules.map((row) => [sourceId.parse(row.id), row]));
  const tuples = new Set<string>();
  for (const row of input.registrations) {
    z.string().regex(/^[1-9]\d*$/).refine((v) => BigInt(v) <= 32767n, "Siklus melebihi SMALLINT PostgreSQL").parse(row.siklus_ke);
    const tuple = `${sourceId.parse(row.id_pengajuan)}:${row.siklus_ke}`;
    if (tuples.has(tuple)) issues.push({ table: "pendaftaran_sidang", id: row.id, code: "duplicate-title-cycle", reference: tuple });
    tuples.add(tuple);
  }
  for (const [table, links] of [["penugasan_penguji", input.assignments], ["checklist_dokumen", input.checklist]] as const) {
    for (const row of links) {
      sourceId.parse(row.id);
      if (row.id_sidang_daftar !== null && !ids.has(sourceId.parse(row.id_sidang_daftar)))
        issues.push({ table, id: row.id, code: "orphan-sidang-fk", reference: row.id_sidang_daftar });
    }
  }
  for (const row of input.schedules) {
    z.number().int().positive().max(2147483647).parse(row.versi);
    if (!ids.has(sourceId.parse(row.id_sidang))) issues.push({ table: "jadwal_sidang", id: row.id, code: "orphan-registration", reference: row.id_sidang });
  }
  const active = new Set<string>();
  for (const doc of input.invitations.filter((d) => d.jenis_dokumen === "undangan_sidang")) {
    const j = doc.id_jadwal_sidang ? schedules.get(sourceId.parse(doc.id_jadwal_sidang)) : undefined;
    if (!j || doc.id_jadwal !== null) issues.push({ table: "dokumen_verifikasi", id: doc.id,
      code: "ambiguous-sidang-invitation-fk", reference: doc.id_jadwal_sidang ?? doc.id_jadwal });
    const snapshot = doc.snapshot_json as { versiJadwal?: number; tanggal?: string } | null;
    if (doc.status === "sah") {
      // Legacy revocation used id_jadwal. Do not assume a retained 'sah' means the invitation is still current.
      if (!j || j.status !== "final" || !snapshot || snapshot.versiJadwal !== j.versi)
        issues.push({ table: "dokumen_verifikasi", id: doc.id, code: "ambiguous-historical-invitation-status", reference: doc.id_jadwal_sidang });
      if (doc.id_jadwal_sidang && active.has(doc.id_jadwal_sidang)) issues.push({ table: "dokumen_verifikasi", id: doc.id,
        code: "multiple-active-invitations", reference: doc.id_jadwal_sidang });
      if (doc.id_jadwal_sidang) active.add(doc.id_jadwal_sidang);
    }
  }
  return { valid: issues.length === 0, issues };
}
export function preserveLegacyDecision(source: { hasil: string | null; status_persetujuan: string | null;
  disetujui_kaprodi_at: string | null; ditetapkan_at?: string | null; updated_at?: string | null }) {
  return { sourceHasil: source.hasil, sourceStatusPersetujuan: source.status_persetujuan,
    // Keep the source columns unchanged. Compatibility is evaluated rather than silently backfilling.
    hasil: source.hasil, statusPersetujuan: source.status_persetujuan,
    transformProvenance: { rule: "berita-acara-official-predicate-v1", sourceApprovalAt: source.disetujui_kaprodi_at,
      sourceDecisionAt: source.ditetapkan_at ?? null, sourceUpdatedAt: source.updated_at ?? null,
      official: officialResult({ hasil: source.hasil, statusPersetujuan: source.status_persetujuan,
        disetujuiKaprodiAt: source.disetujui_kaprodi_at ? new Date(source.disetujui_kaprodi_at) : null }), sourceUnchanged: true } };
}
