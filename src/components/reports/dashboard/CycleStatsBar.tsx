import { AlertTriangle, CheckCircle2, Clock, Building2, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CycleStats } from "@/hooks/useReportPortfolio";

/** Which tile the reviewer has pinned; `all` shows the whole portfolio. */
export type CycleFilter = "all" | "published" | "in_progress" | "attention" | "overdue";

const TILES: {
  key: CycleFilter;
  label: string;
  icon: typeof Building2;
  read: (s: CycleStats) => number;
}[] = [
  { key: "all", label: "Reporting properties", icon: Building2, read: (s) => s.properties },
  { key: "published", label: "Published", icon: CheckCircle2, read: (s) => s.published },
  { key: "in_progress", label: "In progress", icon: Clock, read: (s) => s.inProgress },
  { key: "attention", label: "Needs attention", icon: AlertTriangle, read: (s) => s.attention },
  { key: "overdue", label: "Overdue", icon: CalendarClock, read: (s) => s.overdue },
];

export function CycleStatsBar({
  stats,
  active,
  onSelect,
}: {
  stats: CycleStats;
  active: CycleFilter;
  onSelect: (key: CycleFilter) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {TILES.map((tile) => {
        const isActive = active === tile.key;
        return (
          <button
            key={tile.key}
            type="button"
            onClick={() => onSelect(isActive && tile.key !== "all" ? "all" : tile.key)}
            aria-pressed={isActive}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-left transition-colors",
              isActive ? "border-primary bg-muted" : "hover:bg-muted/50",
            )}
          >
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <tile.icon className="h-3.5 w-3.5" />
              {tile.label}
            </span>
            <span className="mt-1 block text-2xl font-semibold tabular-nums leading-none">
              {tile.read(stats)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default CycleStatsBar;
