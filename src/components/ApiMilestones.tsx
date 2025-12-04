import { LucideIcon, KeyRound, HeartPulse, Download, RefreshCw, CalendarDays, Upload, Rocket } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface MilestoneStatus {
  auth: boolean;
  healthCheck: boolean;
  pullAvailability: boolean;
  syncIn: boolean;
  pullBookings: boolean;
  pushBooking: boolean;
  liveMonitor: boolean;
}

interface Milestone {
  key: keyof MilestoneStatus;
  icon: LucideIcon;
  label: string;
  description: string;
}

const milestones: Milestone[] = [
  {
    key: "auth",
    icon: KeyRound,
    label: "Auth & Credentials",
    description: "Implement correct authentication (Basic / Bearer / OAuth2) + reusable typed API client",
  },
  {
    key: "healthCheck",
    icon: HeartPulse,
    label: "Health Check",
    description: "Call a simple endpoint (e.g. /account, /status, /company) to confirm connectivity works",
  },
  {
    key: "pullAvailability",
    icon: Download,
    label: "Pull Availability & Rates",
    description: "Fetch room types, daily availability, restrictions and rates (including per-person logic)",
  },
  {
    key: "syncIn",
    icon: RefreshCw,
    label: "Sync In (Import)",
    description: "Build cron/edge function to pull availability + rates → property_availability & property_rates tables",
  },
  {
    key: "pullBookings",
    icon: CalendarDays,
    label: "Pull Bookings",
    description: "Import existing and future reservations from the PMS into your bookings table",
  },
  {
    key: "pushBooking",
    icon: Upload,
    label: "Push Booking",
    description: "Send new bookings, modifications and cancellations from your platform → PMS",
  },
  {
    key: "liveMonitor",
    icon: Rocket,
    label: "Live & Monitor",
    description: "Go live with real properties, Health monitor. Schedule credential rotation, version monitoring, and quarterly health check",
  },
];

// Define milestone status for each PMS system
// Update these as implementation progresses
export const pmsIntegrationStatus: Record<string, MilestoneStatus> = {
  benson: {
    auth: false,
    healthCheck: false,
    pullAvailability: false,
    syncIn: false,
    pullBookings: false,
    pushBooking: false,
    liveMonitor: false,
  },
  nightsbridge: {
    auth: false,
    healthCheck: false,
    pullAvailability: false,
    syncIn: false,
    pullBookings: false,
    pushBooking: false,
    liveMonitor: false,
  },
  checkfront: {
    auth: false,
    healthCheck: false,
    pullAvailability: false,
    syncIn: false,
    pullBookings: false,
    pushBooking: false,
    liveMonitor: false,
  },
  semper: {
    auth: false,
    healthCheck: false,
    pullAvailability: false,
    syncIn: false,
    pullBookings: false,
    pushBooking: false,
    liveMonitor: false,
  },
  siteminder: {
    auth: false,
    healthCheck: false,
    pullAvailability: false,
    syncIn: false,
    pullBookings: false,
    pushBooking: false,
    liveMonitor: false,
  },
  mews: {
    auth: false,
    healthCheck: false,
    pullAvailability: false,
    syncIn: false,
    pullBookings: false,
    pushBooking: false,
    liveMonitor: false,
  },
  opera: {
    auth: false,
    healthCheck: false,
    pullAvailability: false,
    syncIn: false,
    pullBookings: false,
    pushBooking: false,
    liveMonitor: false,
  },
};

// Get count of completed milestones for a PMS
export const getCompletedMilestoneCount = (systemType: string): number => {
  const status = pmsIntegrationStatus[systemType];
  if (!status) return 0;
  return Object.values(status).filter(Boolean).length;
};

// Get total milestone count
export const getTotalMilestoneCount = (): number => milestones.length;

// Check if any milestone has failed (for health indicator)
export const hasFailedMilestones = (systemType: string): boolean => {
  // For now, return false as no APIs are commissioned
  // In future, this would check actual health status
  return false;
};

interface ApiMilestonesProps {
  systemType: string;
  className?: string;
}

export function ApiMilestones({ systemType, className }: ApiMilestonesProps) {
  const status = pmsIntegrationStatus[systemType] || {
    auth: false,
    healthCheck: false,
    pullAvailability: false,
    syncIn: false,
    pullBookings: false,
    pushBooking: false,
    liveMonitor: false,
  };

  const completedCount = Object.values(status).filter(Boolean).length;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Implementation Progress
        </span>
        <span className="text-xs text-muted-foreground">
          {completedCount}/{milestones.length}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {milestones.map((milestone) => {
          const Icon = milestone.icon;
          const isComplete = status[milestone.key];

          return (
            <Tooltip key={milestone.key}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "p-1.5 rounded-md transition-colors cursor-help",
                    isComplete
                      ? "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="space-y-1">
                  <p className="font-medium flex items-center gap-1.5">
                    {isComplete ? (
                      <span className="text-green-500">✓</span>
                    ) : (
                      <span className="text-muted-foreground">○</span>
                    )}
                    {milestone.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {milestone.description}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
