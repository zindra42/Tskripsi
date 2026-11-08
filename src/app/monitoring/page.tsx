import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireSession } from "@/lib/auth/session";
import { WorkspaceShell } from "@/components/workspace-shell";
import { FacultyMonitoring } from "@/components/faculty-monitoring";
import { DashboardOverviewSkeleton } from "@/components/skeleton";

export const dynamic = "force-dynamic";
export default async function MonitoringPage({ searchParams }: { searchParams: Promise<{ fakultasId?: string; programStudiId?: string }> }) {
  const session = await requireSession();
  if (!["dekan", "superadmin"].includes(session.user.role)) notFound();
  const filters = await searchParams;
  return <WorkspaceShell session={session}><h1 className="mb-6 text-3xl font-bold">Monitoring akademik fakultas</h1><Suspense fallback={<DashboardOverviewSkeleton />}><FacultyMonitoring session={session} filters={filters} /></Suspense></WorkspaceShell>;
}
