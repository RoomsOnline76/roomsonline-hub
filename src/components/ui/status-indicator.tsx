import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type StatusType = "healthy" | "warning" | "error" | "stale" | "syncing";

interface StatusIndicatorProps {
  status: StatusType;
  label?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  tooltip?: string;
  className?: string;
}

const statusConfig: Record<StatusType, { color: string; bgColor: string; animation?: string; defaultLabel: string }> = {
  healthy: {
    color: "bg-status-healthy",
    bgColor: "bg-status-healthy/20",
    defaultLabel: "Connected",
  },
  warning: {
    color: "bg-status-warning",
    bgColor: "bg-status-warning/20",
    defaultLabel: "Warning",
  },
  error: {
    color: "bg-status-error",
    bgColor: "bg-status-error/20",
    defaultLabel: "Error",
  },
  stale: {
    color: "bg-status-stale",
    bgColor: "bg-status-stale/20",
    defaultLabel: "Stale",
  },
  syncing: {
    color: "bg-status-syncing",
    bgColor: "bg-status-syncing/20",
    animation: "animate-pulse-glow",
    defaultLabel: "Syncing",
  },
};

const sizeConfig = {
  sm: { dot: "h-1.5 w-1.5", ring: "h-3 w-3", text: "text-[10px]", gap: "gap-1" },
  md: { dot: "h-2 w-2", ring: "h-4 w-4", text: "text-xs", gap: "gap-1.5" },
  lg: { dot: "h-2.5 w-2.5", ring: "h-5 w-5", text: "text-sm", gap: "gap-2" },
};

export function StatusIndicator({
  status,
  label,
  size = "md",
  showLabel = true,
  tooltip,
  className,
}: StatusIndicatorProps) {
  const config = statusConfig[status];
  const sizes = sizeConfig[size];
  const displayLabel = label || config.defaultLabel;

  const indicator = (
    <div className={cn("flex items-center", sizes.gap, className)}>
      <div
        className={cn(
          "rounded-full flex items-center justify-center",
          config.bgColor,
          sizes.ring
        )}
      >
        <div
          className={cn(
            "rounded-full",
            config.color,
            sizes.dot,
            config.animation
          )}
        />
      </div>
      {showLabel && (
        <span className={cn("font-medium text-muted-foreground", sizes.text)}>
          {displayLabel}
        </span>
      )}
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{indicator}</TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return indicator;
}
