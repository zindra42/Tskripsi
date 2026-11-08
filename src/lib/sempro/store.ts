import "server-only";
import { audit, ensure, type Tx } from "@/lib/accounts/store";
import { canManage } from "@/lib/accounts/policy";
import {
  createIdempotentMutation,
  type MutationContext,
  type Uploads,
  type Input,
} from "@/lib/db/mutation";

export type SemproContext = MutationContext;
export type { Uploads, Input };
export const semproMutation = createIdempotentMutation;

export function requireManager(context: SemproContext, kaprodiOnly = false) {
  ensure(
    canManage(context.actor, context.role, kaprodiOnly ? "settings" : "manage"),
    "Kewenangan pengelola prodi (Kaprodi/Sekpro) diperlukan. Periksa mode peran Anda.",
  );
}

export function requireStudent(context: SemproContext) {
  ensure(
    context.actor.role === "mahasiswa" && context.actor.mahasiswa,
    "Hanya mahasiswa aktif yang dapat melakukan tindakan ini.",
  );
  return context.actor.mahasiswa!;
}

export function requireLecturer(context: SemproContext) {
  ensure(
    context.actor.dosen && ["dosen", "kaprodi", "sekpro"].includes(context.actor.role),
    "Hanya dosen yang dapat melakukan tindakan ini.",
  );
  return context.actor.dosen!;
}

export async function managers(tx: Tx) {
  const users = await tx.pengguna.findMany({
    where: {
      statusAkun: "aktif",
      deletedAt: null,
      OR: [
        { role: { in: ["kaprodi", "sekpro", "superadmin"] } },
        {
          role: "dosen",
          dosen: { OR: [{ isKaprodi: true }, { isSekpro: true }] },
        },
      ],
    },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

export async function notify(
  tx: Tx,
  ids: (bigint | null)[],
  jenis: string,
  pesan: string,
  url: string,
) {
  for (const id of new Set(ids.filter((id): id is bigint => id !== null))) {
    await tx.notification.create({
      data: {
        type: "App\\Notifications\\SemproNotification",
        notifiableType: "App\\Models\\Pengguna",
        notifiableId: id,
        data: JSON.stringify({
          title: "Pemberitahuan Seminar Proposal SIAS",
          message: pesan,
          url,
          type: jenis,
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
}

export async function semproEvent(
  context: SemproContext,
  name: string,
  entity: string,
  before: unknown,
  after: unknown,
  recipients: (bigint | null)[],
  message: string,
  url: string,
) {
  await audit(context.tx, context.actor.id, name, entity, {
    before,
    after,
    snapshotVersion: "sias-ts-sempro-v1",
  });
  await notify(context.tx, recipients, name, message, url);
}
