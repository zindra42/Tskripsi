import "server-only";
import { z } from "zod";
import { ensure, audit, jsonValue } from "@/lib/accounts/store";
import { idSchema } from "@/lib/accounts/validation";
import { localDateTime } from "@/lib/academic/validation";
import { requireManager, notify, type Context, type Input, type Uploads } from "@/lib/academic/store";
import { storePrivateUpload } from "@/lib/academic/files";
import { announcementVisible } from "@/lib/sidang/policy";

const rolesSchema = z.array(z.enum(["mahasiswa", "dosen", "kaprodi", "sekpro", "admin_keuangan", "superadmin"])).min(1).max(6)
  .refine((values) => new Set(values).size === values.length);
const optionalDate = (input: unknown) => input === "" || input == null ? null : localDateTime.parse(input);

export async function fanout(context: Context, id: bigint, force = false) {
  const row = await context.tx.pengumuman.findUniqueOrThrow({ where: { id } });
  if (row.notifikasiDikirimAt && !force || !announcementVisible({ ...row, isPublik: true })) return;
  // Legacy JSON may still use sekprodi; preserve stored targets while addressing the target enum.
  const roles = rolesSchema.parse(Array.isArray(row.targetPeran)
    ? [...new Set(row.targetPeran.map((role) => role === "sekprodi" ? "sekpro" : role))] : row.targetPeran);
  // Process recipient batches inside the same locked transaction as the delivery marker.
  let cursor: bigint | undefined;
  while (true) {
    const users = await context.tx.pengguna.findMany({ where: { statusAkun: "aktif", deletedAt: null, role: { in: roles } },
      select: { id: true }, take: 100, orderBy: { id: "asc" }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!users.length) break;
    await notify(context.tx, users.map((u) => u.id), "pengumuman_terbit", `Pengumuman: ${row.judul}`, "/pengumuman");
    cursor = users[users.length - 1].id;
  }
  await context.tx.pengumuman.update({ where: { id }, data: { notifikasiDikirimAt: new Date(), updatedAt: new Date() } });
}

export async function saveAnnouncement(context: Context, input: Input, uploads: Uploads) {
  requireManager(context);
  const previous = input.id ? await context.tx.pengumuman.findUnique({ where: { id: idSchema.parse(input.id) } }) : null;
  ensure(!input.id || previous && !previous.deletedAt, "Pengumuman tidak ditemukan.");
  const targetPeran = rolesSchema.parse(input.targetPeran);
  const tampilMulai = optionalDate(input.mulai), tampilSelesai = optionalDate(input.selesai);
  ensure(!tampilMulai || !tampilSelesai || tampilMulai <= tampilSelesai, "Akhir tampil tidak boleh sebelum mulai tampil.");
  const status = z.enum(["draft", "terbit", "diarsipkan"]).parse(input.status);
  const data = { judul: z.string().trim().min(3).max(150).parse(input.judul), isi: z.string().trim().min(3).max(20000).parse(input.isi),
    kategori: z.enum(["umum", "akademik", "jadwal", "keuangan", "penting"]).parse(input.kategori), targetPeran: jsonValue(targetPeran),
    isPublik: input.publik === "true", status, disematkan: input.disematkan === "true", tampilMulai, tampilSelesai,
    ...(uploads.file ? { lampiranPath: await storePrivateUpload(uploads.file, "pengumuman/lampiran"), lampiranNama: `Lampiran.${uploads.file.extension}` }
      : input.hapusLampiran === "true" ? { lampiranPath: null, lampiranNama: null } : {}),
    terbitAt: status === "terbit" ? previous?.terbitAt ?? new Date() : previous?.terbitAt,
    diubahOleh: context.actor.id, updatedAt: new Date() };
  const row = previous ? await context.tx.pengumuman.update({ where: { id: previous.id }, data })
    : await context.tx.pengumuman.create({ data: { ...data, dibuatOleh: context.actor.id, createdAt: new Date() } });
  await audit(context.tx, context.actor.id, "pengumuman_disimpan", `pengumuman:${row.id}`, { before: previous, after: row });
  if (input.kirimNotifikasi !== "false") await fanout(context, row.id, input.kirimUlang === "true");
}
export async function archiveAnnouncement(context: Context, input: Input) {
  requireManager(context);
  const row = await context.tx.pengumuman.findUnique({ where: { id: idSchema.parse(input.id) } });
  ensure(row && !row.deletedAt, "Pengumuman tidak ditemukan.");
  const data = input.hapus === "true" ? { deletedAt: new Date(), updatedAt: new Date() } : { status: "diarsipkan", updatedAt: new Date() };
  await context.tx.pengumuman.update({ where: { id: row.id }, data });
  await audit(context.tx, context.actor.id, "pengumuman_diarsipkan", `pengumuman:${row.id}`, { before: row, after: data });
}
export async function readAnnouncement(context: Context, input: Input) {
  const row = await context.tx.pengumuman.findUnique({ where: { id: idSchema.parse(input.id) } });
  ensure(row && announcementVisible(row, context.actor.role), "Pengumuman tidak tersedia untuk Anda.");
  await context.tx.pengumumanDibaca.upsert({ where: { pengumumanId_penggunaId: { pengumumanId: row.id, penggunaId: context.actor.id } },
    create: { pengumumanId: row.id, penggunaId: context.actor.id, dibacaAt: new Date(), createdAt: new Date() }, update: {} });
}
export async function processScheduled(context: Context) {
  requireManager(context);
  const now = new Date();
  const rows = await context.tx.pengumuman.findMany({ where: { deletedAt: null, status: { in: ["draft", "terbit"] },
    tampilMulai: { lte: now }, OR: [{ tampilSelesai: null }, { tampilSelesai: { gte: now } }], notifikasiDikirimAt: null } });
  for (const row of rows) {
    await context.tx.pengumuman.update({ where: { id: row.id }, data: { status: "terbit", terbitAt: row.terbitAt ?? now, updatedAt: now } });
    await fanout(context, row.id);
  }
  await audit(context.tx, context.actor.id, "pengumuman_terjadwal_diproses", "pengumuman:jadwal", { ids: rows.map((r) => String(r.id)) });
}
