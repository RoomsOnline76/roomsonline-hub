import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { PMSBrandProvider } from "@/contexts/PMSBrandContext";
import { PMSLayout } from "./PMSLayout";
import { Skeleton } from "@/components/ui/skeleton";

/** Content-area-only loading skeleton — sidebar stays visible */
function PMSContentFallback() {
  return (
    <div className="space-y-4 animate-fade-in">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
      </div>
      <Skeleton className="h-[300px] w-full rounded-lg mt-4" />
    </div>
  );
}

/**
 * Persistent shell for all /pms/* routes.
 * Keeps PMSBrandProvider, sidebar, and help context mounted across navigations.
 * Only the <Outlet /> (page content) swaps on route change.
 */
export function PMSShell() {
  return (
    <PMSBrandProvider>
      <PMSLayout>
        <Suspense fallback={<PMSContentFallback />}>
          <Outlet />
        </Suspense>
      </PMSLayout>
    </PMSBrandProvider>
  );
}
