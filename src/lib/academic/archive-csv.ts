import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { preprocess } from "./similarity";

export type Tx = Prisma.TransactionClient;

/**
 * Standard RFC-4180 compliant CSV parser that handles:
 * - Quoted fields with commas and embedded newlines
 * - Escaped double quotes ("")
 * - Trailing newlines
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (insideQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        i++;
        continue;
      } else if (char === ",") {
        currentRow.push(currentField);
        currentField = "";
        i++;
        continue;
      } else if (char === "\r") {
        if (i + 1 < text.length && text[i + 1] === "\n") {
          i++;
        }
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        continue;
      } else if (char === "\n") {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

function escapeCsvField(value: string | null | undefined, identifier = false): string {
  if (value == null) return "";
  // Apostrophe is a reversible spreadsheet text marker. Escape existing markers too.
  const str = (/^['=+@\-\t\r\n]/.test(value) || /^\s+[=+@\-]/.test(value) || identifier && /^\d+$/.test(value)) ? `'${value}` : value;
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

function importedCsvField(value: string, identifier = false) {
  if (value.startsWith("'") && (/^['=+@\-\t\r\n]/.test(value.slice(1))
    || /^\s+[=+@\-]/.test(value.slice(1)) || identifier && /^\d+$/.test(value.slice(1)))) return value.slice(1);
  return value;
}

export const archiveCsvHeader = "judul,nama_penulis,tahun,nim,prodi";
export function archiveCsvRow(row: { judul: string; namaPenulis: string | null; tahun: string | null; nim: string | null; prodi: string | null }) {
  return [escapeCsvField(row.judul), escapeCsvField(row.namaPenulis), escapeCsvField(row.tahun),
    escapeCsvField(row.nim, true), escapeCsvField(row.prodi)].join(",");
}

/**
 * Export all titles in arsip_judul_skripsi to CSV string.
 * Columns: judul,nama_penulis,tahun,nim,prodi
 */
export async function exportArchiveCsv(tx: Tx): Promise<string> {
  const rows = await tx.arsipJudulSkripsi.findMany({
    orderBy: { id: "asc" },
  });

  const header = archiveCsvHeader;
  const lines = [header];

  for (const row of rows) {
    const line = archiveCsvRow(row);
    lines.push(line);
  }

  return lines.join("\r\n");
}

/**
 * Import historical thesis titles from CSV into arsip_judul_skripsi.
 * Preprocesses each title to generate keyword tokens for similarity checks.
 */
export async function importArchiveCsv(
  tx: Tx,
  csvContent: string,
  mode: "append" | "replace" = "append",
): Promise<{ imported: number; skipped: number }> {
  if (mode === "replace") {
    await tx.arsipJudulSkripsi.deleteMany({});
  }

  const rawRows = parseCsv(csvContent);
  let imported = 0;
  let skipped = 0;
  const batchSize = 100;
  let batch: {
    judul: string;
    namaPenulis: string | null;
    tahun: string | null;
    nim: string | null;
    prodi: string | null;
    keywords: object;
    createdAt: Date;
    updatedAt: Date;
  }[] = [];

  const now = new Date();

  for (let idx = 0; idx < rawRows.length; idx++) {
    const data = rawRows[idx]?.map((value, column) => importedCsvField(value, column === 3));
    if (!data || data.length === 0 || (data.length === 1 && !data[0]?.trim())) {
      continue;
    }

    // Skip header row if present
    const firstCol = (data[0] ?? "").trim().toLowerCase();
    if (idx === 0 && (firstCol === "judul" || firstCol === "title")) {
      continue;
    }

    const judul = (data[0] ?? "").trim();
    const namaPenulis = (data[1] ?? "").trim() || null;
    const tahun = (data[2] ?? "").trim() || null;
    const nim = (data[3] ?? "").trim() || null;

    // Support flexible 5 or 6 column structure as in Laravel's clean CSV
    let prodi = (data[4] ?? "").trim();
    if (data.length >= 6 && !prodi && (data[5] ?? "").trim()) {
      prodi = (data[5] ?? "").trim();
    }
    if (!prodi) {
      prodi = "Informatika";
    }

    // Validation: judul is mandatory and must not be a dash or placeholder
    if (!judul || judul === "-" || judul.length < 3) {
      skipped++;
      continue;
    }

    const keywords = preprocess(judul, true);

    batch.push({
      judul,
      namaPenulis,
      tahun,
      nim,
      prodi,
      keywords: keywords as unknown as object,
      createdAt: now,
      updatedAt: now,
    });

    imported++;

    if (batch.length >= batchSize) {
      await tx.arsipJudulSkripsi.createMany({ data: batch });
      batch = [];
    }
  }

  if (batch.length > 0) {
    await tx.arsipJudulSkripsi.createMany({ data: batch });
  }

  return { imported, skipped };
}
