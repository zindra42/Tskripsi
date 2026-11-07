import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { landingPath } from "@/lib/auth/policy";

export const dynamic = "force-dynamic";

export default async function DashboardEntry() {
  const session = await requireSession();
  redirect(landingPath(session.user, session.activeRole));
}
