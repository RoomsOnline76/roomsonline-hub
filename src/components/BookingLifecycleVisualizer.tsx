import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type BookingState = "pending" | "confirmed" | "checked_in" | "completed" | "cancelled";

interface BookingLifecycleVisualizerProps {
  currentState: BookingState;
  timestamps?: {
    pending?: string;
    confirmed?: string;
    checked_in?: string;
    completed?: string;
    cancelled?: string;
  };
  compact?: boolean;
  className?: string;
}

const STATES: { key: BookingState; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "checked_in", label: "Checked In" },
  { key: "completed", label: "Completed" },
];

const STATE_ORDER: Record<BookingState, number> = {
  pending: 0,
  confirmed: 1,
  checked_in: 2,
  completed: 3,
  cancelled: -1,
};

export function BookingLifecycleVisualizer({
  currentState,
  timestamps,
  compact = false,
  className,
}: BookingLifecycleVisualizerProps) {
  const currentIndex = STATE_ORDER[currentState];
  const isCancelled = currentState === "cancelled";

  if (isCancelled) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="h-3 w-3 rounded-full bg-destructive" />
        <span className="text-sm text-destructive font-medium">Cancelled</span>
        {timestamps?.cancelled && (
          <span className="text-xs text-muted-foreground">
            {new Date(timestamps.cancelled).toLocaleDateString()}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center", compact ? "gap-1" : "gap-2", className)}>
      {STATES.map((state, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isFuture = index > currentIndex;
        const timestamp = timestamps?.[state.key];

        const dot = (
          <div
            className={cn(
              "rounded-full flex items-center justify-center transition-all",
              compact ? "h-2.5 w-2.5" : "h-4 w-4",
              isCompleted && "bg-status-healthy",
              isCurrent && "bg-primary ring-2 ring-primary/20",
              isFuture && "bg-muted border border-border"
            )}
          >
            {isCompleted && !compact && (
              <Check className="h-2.5 w-2.5 text-white" />
            )}
          </div>
        );

        const connector = index < STATES.length - 1 && (
          <div
            className={cn(
              "h-0.5 transition-all",
              compact ? "w-4" : "w-8",
              index < currentIndex ? "bg-status-healthy" : "bg-muted"
            )}
          />
        );

        return (
          <div key={state.key} className="flex items-center">
            {timestamp ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="cursor-help">{dot}</div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <p className="font-medium">{state.label}</p>
                  <p className="text-muted-foreground">
                    {new Date(timestamp).toLocaleString()}
                  </p>
                </TooltipContent>
              </Tooltip>
            ) : (
              dot
            )}
            {connector}
          </div>
        );
      })}
      
      {!compact && (
        <span className="ml-2 text-sm font-medium text-foreground">
          {STATES.find(s => s.key === currentState)?.label || currentState}
        </span>
      )}
    </div>
  );
}
