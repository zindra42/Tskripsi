import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { WorkspaceShell } from "@/components/workspace-shell";
import { isRole, roleLabels } from "@/lib/auth/policy";
import { requireArea } from "@/lib/auth/session";
import { getCachedDashboardIndicators } from "@/lib/support/dashboard";
import { DashboardOverview } from "@/components/dashboard-overview";
import { DashboardOverviewSkeleton } from "@/components/skeleton";
import { FacultyMonitoring } from "@/components/faculty-monitoring";

export const dynamic = "force-dynamic";
export default async function RoleDashboard({ params, searchParams }: { params: Promise<{ role: string }>; searchParams: Promise<{ fakultasId?: string; programStudiId?: string }> }) {
  const { role } = await params;
  if (!isRole(role)) notFound();
  const session = await requireArea(role);
  if (role === "dekan") return <WorkspaceShell session={session}><h1 className="mb-4 text-3xl font-bold">Dashboard Dekan</h1><p className="mb-6 text-slate-600">Monitoring akademik dan tata kelola fakultas Anda. <Link href="/organisasi" className="underline">Kelola prodi dan pimpinan</Link></p><Suspense fallback={<DashboardOverviewSkeleton />}><FacultyMonitoring session={session} filters={await searchParams} /></Suspense></WorkspaceShell>;
  const indicators = await getCachedDashboardIndicators(session);
  return <WorkspaceShell session={session}>
    <p className="mb-2 text-sm text-slate-500">Area {roleLabels[role]}</p>
    <h1 className="mb-6 text-3xl font-bold">Dashboard {roleLabels[role]}</h1>
    <section className="panel mb-6 border-t-4! border-t-[#fca311]!">
      <h2 className="text-xl font-semibold">Selamat datang, {session.user.nama}</h2>
      <p className="mt-3 text-slate-600">Berikut ringkasan proses dan tindakan dalam area Anda.</p>
      {role === "admin_keuangan" && <p className="mt-3 text-sm text-slate-600">Akun keuangan hasil cleanup 5 November 2026 tetap nonaktif. Akun yang diaktifkan pengelola dapat memverifikasi administrasi awal.</p>}
    </section>
    <section aria-label="Indikator tugas" className="grid gap-4 sm:grid-cols-2">
      {indicators.map((item) => <Link className="panel block hover:border-sky-700" key={item.label} href={item.href}>
        <span className="mb-3 block text-3xl font-bold">{item.count}</span><h2 className="font-semibold">{item.label}</h2>
      </Link>)}
    </section>
    <Suspense fallback={<DashboardOverviewSkeleton />}>
      <DashboardOverview session={session} />
    </Suspense>
  </WorkspaceShell>;
}
