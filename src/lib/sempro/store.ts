import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { AuthenticatedSession } from "@/lib/auth/session";
import {
  accountTransaction,
  audit,
  checkedActor,
  ensure,
  jsonValue,
  type Account,
  type Tx,
} from "@/lib/accounts/store";
import { canManage } from "@/lib/accounts/policy";
import type { Role } from "@/generated/prisma/enums";
import type { Upload } from "@/lib/academic/files";

export type SemproContext = { tx: Tx; actor: Account; role: Role };
export type Uploads = Record<string, Upload | null>;
export type Input = Record<string, unknown>;

export async function semproMutation(
  session: AuthenticatedSession,
  key: string,
  command: string,
  input: Input,
  uploads: Uploads,
  work: (context: SemproContext) => Promise<unknown>,
) {
  z.uuid().parse(key);
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify(
        jsonValue({
          input,
          uploads: Object.fromEntries(
            Object.entries(uploads).map(([name, file]) => [
              name,
              file && createHash("sha256").update(file.bytes).digest("hex"),
            ]),
          ),
        }),
      ),
    )
    .digest("hex");

  return accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session);
    const live = await tx.authSession.findUniqueOrThrow({
      where: { tokenHash: session.tokenHash },
    });
    const receipt = await tx.academicReceipt.findUnique({ where: { key } });
    if (receipt) {
      ensure(
        receipt.actorId === actor.id &&
          receipt.command === command &&
          receipt.fingerprint === fingerprint,
        "Kunci permintaan sudah digunakan. Muat ulang formulir.",
      );
      return receipt.result;
    }

    const result = await work({ tx, actor, role: live.activeRole });
    await tx.academicReceipt.create({
      data: {
        key,
        actorId: actor.id,
        command,
        fingerprint,
        ...(result === undefined ? {} : { result: jsonValue(result) }),
      },
    });
    return result;
  });
}

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
