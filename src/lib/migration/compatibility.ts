import { primaryKey, type Snapshot, type Issue } from "./contract";
import { sourceCatalog } from "./catalog";
import { notificationUrl } from "../support/notifications";
import { compatiblePage, legacyRequest } from "./urls";

// Release gaps are separate from import integrity. No offline check can approve a hostname,
// recover ACCs discarded before this snapshot, or certify an authenticated production smoke.
export function releaseCompatibility(snapshot: Snapshot): Issue[] {
  const gaps: Issue[] = [{ code: "real-export-and-postgresql-rehearsal-required" }, { code: "authenticated-role-smoke-required" },
    { code: "printed-qr-hostname-cutover-approval-required" }, { code: "pre-acc-backfill-loss-evidence-required" }];
  if (!snapshot.source.qrOrigins.length) gaps.push({ code: "printed-qr-origins-unverified" });
  for (const doc of snapshot.tables.dokumen_verifikasi?.rows ?? []) {
    const pk = primaryKey(doc, ["id"]);
    if (doc.status === "sah" && !snapshot.files.some((f) => f.table === "dokumen_verifikasi" && f.pk === pk && f.version === String(doc.versi) && f.status === doc.status
      && (f.purpose === "pdf-cache" || f.purpose === "reference" && f.pointer === "/snapshot_json/file_acc_lama"))) gaps.push({ code: "issued-document-bytes-unverified", table: "dokumen_verifikasi", pk });
  }
  for (const row of snapshot.tables.notifications?.rows ?? []) {
    const pk = primaryKey(row, sourceCatalog.tables.notifications.primaryKey);
    try {
      const data: unknown = JSON.parse(String(row.data));
      if (!data || typeof data !== "object" || !("url" in data) || data.url === "#" || data.url === null) continue;
      const url = notificationUrl(data.url), pathname = url && new URL(url, "https://sias.invalid").pathname;
      if (!pathname || !compatiblePage(pathname) && !legacyRequest(pathname)) gaps.push({ code: "notification-url-unmapped", table: "notifications", pk });
    } catch { gaps.push({ code: "notification-json-invalid", table: "notifications", pk }); }
  }
  for (const file of snapshot.files.filter((f) => f.purpose === "unreferenced")) gaps.push({ code: "unreferenced-storage-owner-review-required", table: "storage_inventory", pk: file.path });
  return gaps;
}
