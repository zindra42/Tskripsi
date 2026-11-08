import { DashboardSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl p-5 sm:p-10">
      <DashboardSkeleton />
    </div>
  );
}
