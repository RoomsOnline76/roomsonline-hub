import { cn } from "@/lib/utils";
import { buildLabel, buildStamp, displayedBuild, versionLabel } from "@/lib/appVersion";

interface VersionBadgeProps {
  /** Collapsed sidebars show only the build number. */
  collapsed?: boolean;
  className?: string;
}

/**
 * Version / build stamp. Always renders the modulo-69 build number computed in
 * `@/lib/appVersion` — the internal sequential build is never surfaced.
 */
export function VersionBadge({ collapsed = false, className }: VersionBadgeProps) {
  return (
    <p
      className={cn(
        "text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 text-center",
        className,
      )}
      title={buildStamp()}
    >
      {collapsed ? `${versionLabel()}·${displayedBuild()}` : buildLabel()}
    </p>
  );
}
