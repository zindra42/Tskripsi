import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { audit, ensure, jsonValue, type Tx } from "@/lib/accounts/store";
import { canManage } from "@/lib/accounts/policy";
import { currentTitle, isAssigned } from "./policy";
import {
  createIdempotentMutation,
  type MutationContext,
  type Uploads,
  type Input,
} from "@/lib/db/mutation";

export type Context = MutationContext;
export type { Uploads, Input };
export const academicMutation = createIdempotentMutation;

export function requireManager(context: Context, kaprodiOnly = false) {
  ensure(canManage(context.actor, context.role, kaprodiOnly ? "settings" : "manage"), "Kewenangan pengelola diperlukan. Periksa mode peran Anda.");
}
export function requireStudent(context: Context) {
  ensure(context.actor.role === "mahasiswa" && context.actor.mahasiswa, "Hanya mahasiswa aktif yang dapat melakukan tindakan ini.");
  return context.actor.mahasiswa;
}
export function requireFinance(context: Context) {
  ensure(context.actor.role === "superadmin" || context.actor.role === "admin_keuangan", "Hanya Admin Keuangan aktif atau superadmin yang dapat memverifikasi administrasi.");
}

export async function titleRecord(tx: Tx, id: bigint) {
  const title = await tx.pengajuanJudul.findUnique({ where: { id }, include: { bimbingan: true, mahasiswa: { select: { id: true, nama: true, statusAkun: true, deletedAt: true, role: true, mahasiswa: true } } } });
  ensure(title, "Pengajuan tidak ditemukan.");
  return title;
}

export async function guidanceRecord(context: Context, id: bigint, writable = true) {
  const b = await context.tx.bimbingan.findUnique({ where: { id }, include: { pengajuan: { include: { mahasiswa: { select: { id: true, nama: true, statusAkun: true, deletedAt: true, role: true, mahasiswa: true } } } } } });
  ensure(b, "Bimbingan tidak ditemukan.");
  if (writable) ensure(currentTitle(b.pengajuan) && b.pengajuan.status === "disetujui"
    && b.pengajuan.mahasiswa.role === "mahasiswa" && b.pengajuan.mahasiswa.statusAkun === "aktif" && !b.pengajuan.mahasiswa.deletedAt,
    "Bimbingan telah diarsipkan atau akun mahasiswa tidak aktif.");
  return b;
}

export function requireSupervisor(context: Context, b: { idDosenPembimbing: bigint | null; idDosenPembimbing2: bigint | null }) {
  ensure(context.actor.dosen && ["dosen", "kaprodi", "sekpro"].includes(context.actor.role) && isAssigned(context.actor.id, b), "Anda bukan pembimbing yang ditetapkan.");
}

export async function notify(tx: Tx, ids: (bigint | null)[], jenis: string, pesan: string, url: string) {
  for (const id of new Set(ids.filter((id): id is bigint => id !== null))) {
    await tx.notification.create({ data: { type: "App\\Notifications\\SemproNotification", notifiableType: "App\\Models\\Pengguna",
      notifiableId: id, data: JSON.stringify({ title: "Pembaruan akademik SIAS", message: pesan, url, type: jenis }),
      createdAt: new Date(), updatedAt: new Date(),
    } });
  }
}

export async function managers(tx: Tx) {
  const users = await tx.pengguna.findMany({ where: { statusAkun: "aktif", deletedAt: null,
    OR: [{ role: { in: ["kaprodi", "sekpro", "superadmin"] } }, { role: "dosen", dosen: { OR: [{ isKaprodi: true }, { isSekpro: true }] } }],
  }, select: { id: true } });
  return users.map((user) => user.id);
}

export async function event(context: Context, name: string, entity: string, before: unknown, after: unknown, recipients: (bigint | null)[], message: string, url: string) {
  await audit(context.tx, context.actor.id, name, entity, { before, after, snapshotVersion: "sias-ts-academic-v1" });
  await notify(context.tx, recipients, name, message, url);
}

export const activeGuidanceWhere = {
  pengajuan: { deletedAt: null, isDiarsipkan: false, status: { in: ["diajukan", "disetujui", "direvisi"] },
    mahasiswa: { statusAkun: "aktif", deletedAt: null, role: "mahasiswa" },
  },
} satisfies Prisma.BimbinganWhereInput;

export async function supervisorLoad(tx: Tx, id: bigint, except?: bigint) {
  return tx.bimbingan.count({ where: { ...activeGuidanceWhere, ...(except ? { id: { not: except } } : {}),
    OR: [{ idDosenPembimbing: id }, { idDosenPembimbing2: id }],
  } });
}

export async function revokeAcc(context: Context, id: bigint, reason: string, signer?: bigint) {
  await context.tx.dokumenVerifikasi.updateMany({ where: { idBimbingan: id, status: "sah", jenisDokumen: { in: ["acc", "acc_sidang"] },
    ...(signer ? { penandatanganUserId: signer } : {}),
  }, data: { status: "dicabut", dicabutAt: new Date(), dicabutOlehId: context.actor.id, alasanPencabutan: reason, updatedAt: new Date() } });
}

export async function cancelSupervisor(context: Context, id: bigint, slot: 1 | 2, reason: string, cause: "manual" | "archive" | "renewal" = "manual") {
  const archiving = cause === "archive";
  if (cause === "renewal") requireFinance(context); else requireManager(context);
  if (archiving) ensure(context.actor.role === "superadmin", "Pengarsipan bisnis memerlukan superadmin.");
  const b = await guidanceRecord(context, id, !archiving);
  const oldId = slot === 1 ? b.idDosenPembimbing : b.idDosenPembimbing2;
  ensure(oldId, "Slot pembimbing sudah kosong.");
  const old = await context.tx.pengguna.findUniqueOrThrow({ where: { id: oldId }, select: { nama: true } });
  const cancellation = jsonValue({ alasan: reason, dibatalkan_at: new Date().toISOString(), dibatalkan_oleh_id: context.actor.id, id_dosen_lama: oldId, nama_dosen_lama: old.nama });
  await context.tx.bimbingan.update({ where: { id }, data: slot === 1
    ? { idDosenPembimbing: null, pembatalanP1: cancellation, updatedAt: new Date() }
    : { idDosenPembimbing2: null, pembatalanP2: cancellation, updatedAt: new Date() } });
  // Retain cancellation history required by the rebuild, including legacy logs without a lecturer.
  await context.tx.logbookBimbingan.updateMany({ where: { idBimbingan: id, isDibatalkan: false, OR: [{ idDosen: oldId }, { idDosen: null }] },
    data: { isDibatalkan: true, dibatalkanAt: new Date(), dibatalkanOlehId: context.actor.id, alasanPembatalan: reason, updatedAt: new Date() } });
  await context.tx.jadwalBimbingan.updateMany({ where: { bimbinganId: id, dosenId: oldId, status: { in: ["diajukan", "dikonfirmasi_mahasiswa", "reschedule_diminta"] } }, data: { status: "dibatalkan", updatedAt: new Date() } });
  await revokeAcc(context, id, reason, oldId);
  // Approvals are tied to the actual assignment, so an in-flight change must restart.
  await context.tx.pengajuanPerubahanJudul.updateMany({ where: { bimbinganId: id, status: { in: ["menunggu_dospem", "menunggu_kaprodi"] } },
    data: { status: "ditolak_kaprodi", catatanKaprodi: reason, penyetujuId: context.actor.id, keputusanAt: new Date(), updatedAt: new Date() } });
  await event(context, "batal_penetapan_pembimbing", `bimbingan:${id}`, b, { slot, cancellation }, [b.pengajuan.idMahasiswa, oldId], reason, `/bimbingan/${id}`);
}
