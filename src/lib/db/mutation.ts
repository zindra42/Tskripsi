import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { AuthenticatedSession } from "@/lib/auth/session";
import {
  accountTransaction,
  checkedActor,
  ensure,
  jsonValue,
  type Account,
  type Tx,
} from "@/lib/accounts/store";
import type { Role } from "@/generated/prisma/enums";
import type { Upload } from "@/lib/academic/files";

export type MutationContext = { tx: Tx; actor: Account; role: Role };
export type Uploads = Record<string, Upload | null>;
export type Input = Record<string, unknown>;

export async function createIdempotentMutation<T = unknown>(
  session: AuthenticatedSession,
  key: string,
  command: string,
  input: Input,
  uploads: Uploads,
  work: (context: MutationContext) => Promise<T>,
): Promise<T> {
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
      return receipt.result as T;
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
