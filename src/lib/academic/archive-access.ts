import "server-only";
import type { AuthenticatedSession } from "@/lib/auth/session";
import { accountTransaction, checkedActor, type Account, type Tx } from "@/lib/accounts/store";
import { canManage } from "@/lib/accounts/policy";

export function canExportTitles(actor: Account, manager: boolean) {
  return manager && ["superadmin", "kaprodi", "sekpro"].includes(actor.role);
}

export async function checkedArchiveActor(tx: Tx, session: AuthenticatedSession) {
  const actor = await checkedActor(tx, session);
  const live = await tx.authSession.findUniqueOrThrow({ where: { tokenHash: session.tokenHash } });
  const manager = canManage(actor, live.activeRole);
  return { actor, manager, canExport: canExportTitles(actor, manager) };
}

export async function archiveListActor(session: AuthenticatedSession) {
  return accountTransaction((tx) => checkedArchiveActor(tx, session));
}
