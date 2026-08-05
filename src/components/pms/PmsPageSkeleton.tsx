import { Skeleton } from "@/components/ui/skeleton";

interface PmsPageSkeletonProps {
  /** Number of placeholder blocks below the header. */
  rows?: number;
  /** Render a stat-tile strip (dashboard-style pages). */
  tiles?: number;
}

/**
 * Shell-first placeholder for ROL'OS pages.
 *
 * PMS pages depend on a property resolution round-trip before any real data can
 * be requested. Rendering this skeleton instead of a "Loading property…" line
 * means the page frame, spacing and card rhythm paint immediately and the real
 * content swaps in without a layout jump.
 */
export function PmsPageSkeleton({ rows = 3, tiles = 0 }: PmsPageSkeletonProps) {
  return (
    <div className="space-y-4 animate-fade-in" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>

      {tiles > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: tiles }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      )}

      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
