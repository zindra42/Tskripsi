import React from "react";

export function Skeleton({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`skeleton-shimmer rounded-md ${className}`}
      aria-hidden="true"
      {...props}
    />
  );
}

export function StatCardSkeleton() {
  return (
    <div className="panel space-y-3">
      <Skeleton className="h-9 w-16" />
      <Skeleton className="h-5 w-40" />
    </div>
  );
}

export function DashboardOverviewSkeleton() {
  return (
    <div className="mt-6 space-y-6" aria-label="Memuat ringkasan dashboard" aria-busy="true">
      <section className="panel space-y-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-72" />
      </section>

      <section className="panel space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded border border-slate-200 p-3 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-3/4" />
          </div>
          <div className="rounded border border-slate-200 p-3 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        </div>
        <Skeleton className="mt-4 h-5 w-36" />
        <Skeleton className="h-4 w-60" />
      </section>

      <section className="panel space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-2/3" />
      </section>

      <section className="panel space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </section>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Memuat dashboard">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-64" />
      </div>

      <div className="panel border-t-4 border-t-[#fca311] space-y-3">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="panel space-y-3">
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="panel space-y-3">
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-5 w-44" />
        </div>
      </div>

      <DashboardOverviewSkeleton />
    </div>
  );
}

export function WorkspaceShellSkeleton({ children }: { children?: React.ReactNode }) {
  return (
    <div className="min-h-screen" aria-busy="true" aria-label="Memuat antarmuka">
      {/* Header bar skeleton */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5 sm:px-10">
        <div className="space-y-1">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="flex items-center gap-5">
          <div className="space-y-1 text-right">
            <Skeleton className="h-4 w-28 ml-auto" />
            <Skeleton className="h-3 w-20 ml-auto" />
          </div>
          <Skeleton className="h-9 w-20 rounded-lg" />
        </div>
      </header>

      {/* Main layout grid skeleton */}
      <div className="mx-auto grid max-w-7xl gap-7 p-5 sm:p-10 lg:grid-cols-[240px_1fr]">
        {/* Sidebar skeleton */}
        <aside className="space-y-7">
          <div className="panel space-y-4 p-5!">
            <Skeleton className="h-4 w-24" />
            <div className="space-y-3 pt-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-30" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </aside>

        {/* Content skeleton */}
        <main className="min-w-0">{children ?? <DashboardSkeleton />}</main>
      </div>
    </div>
  );
}

export function GlobalShellSkeleton() {
  return <WorkspaceShellSkeleton />;
}
