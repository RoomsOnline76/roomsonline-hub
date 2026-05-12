import { LucideIcon, KeyRound, HeartPulse, Download, RefreshCw, Upload, Rocket } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Milestone status: false = not started, 'pending' = implemented but not tested, true = complete
export type MilestoneValue = boolean | 'pending';

export interface MilestoneStatus {
  auth: MilestoneValue;
  healthCheck: MilestoneValue;
  pullAvailability: MilestoneValue;
  syncIn: MilestoneValue;
  pushBooking: MilestoneValue;
  liveMonitor: MilestoneValue;
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
  // ══════════════════════════════════════════════════════════════════════════
  // PROTECTED INTEGRATION - DO NOT MODIFY
  // Benson API integration is FULLY FUNCTIONAL and PRODUCTION-READY.
  // This integration must NOT be altered when implementing other PMS API types.
  // All edge functions, data models, and sync logic for Benson are complete.
  // ══════════════════════════════════════════════════════════════════════════
  benson: {
    // ✅ HTTP Basic Auth working - successful API calls with credentials
    auth: true,
    // ✅ Connectivity confirmed - API returns 200 responses
    healthCheck: true,
    // ✅ fetchAvailability working - room types, rates, availability returned
    pullAvailability: true,
    // ✅ Data caching working - pms_availability_cache populated
    syncIn: true,
    // ✅ createReservation/postBill tested and working
    pushBooking: true,
    // ✅ FULLY OPERATIONAL - Production ready
    liveMonitor: true,
  },
  nightsbridge: {
    // NightsBridge integration uses URL redirect - external booking, no direct API needed
    // Booking redirect: https://nightsbridge.co.za/bridge/book?bbid=######&source=AGENT_CODE&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD
    // All milestones marked true as this is an external redirect integration that always works
    auth: true,
    healthCheck: true,
    pullAvailability: true,
    syncIn: true,
    pushBooking: true,
    liveMonitor: true,
  },
  checkfront: {
    // 🟠 Token pair + OAuth2 auth implemented in checkfront-api edge function
    auth: 'pending',
    // 🟠 Health check action implemented - PENDING: credentials to test
    healthCheck: 'pending',
    // 🟠 getItems, getItemAvailability, getRatedItem implemented - PENDING: credentials
    pullAvailability: 'pending',
    // 🟠 Availability caching to pms_availability_cache implemented - PENDING: credentials
    syncIn: 'pending',
    // 🟠 startSession, createBooking, storeBookingLocally implemented - PENDING: credentials
    pushBooking: 'pending',
    // ❌ Not yet live
    liveMonitor: false,
  },
  semper: {
    auth: false,
    healthCheck: false,
    pullAvailability: false,
    syncIn: false,
    pushBooking: false,
    liveMonitor: false,
  },
  siteminder: {
    auth: false,
    healthCheck: false,
    pullAvailability: false,
    syncIn: false,
    pushBooking: false,
    liveMonitor: false,
  },
  mews: {
    auth: false,
    healthCheck: false,
    pullAvailability: false,
    syncIn: false,
    pushBooking: false,
    liveMonitor: false,
  },
  opera: {
    auth: false,
    healthCheck: false,
    pullAvailability: false,
    syncIn: false,
    pushBooking: false,
    liveMonitor: false,
  },
  profitroom: {
    auth: false,
    healthCheck: false,
    pullAvailability: false,
    syncIn: false,
    pushBooking: false,
    liveMonitor: false,
  },
  hyperguest: {
    // 🟠 Bearer-token auth implemented in hyperguest-api edge function
    // ❌ NO CREDENTIALS PROVISIONED — no api_keys row exists for system_type='hyperguest'
    auth: 'pending',
    // 🟠 health_check action implemented (GET /health) — PENDING: credentials to test
    healthCheck: 'pending',
    // 🟠 fetch_static_data, live_availability, rate_plans, room_types, restrictions implemented — PENDING: credentials
    pullAvailability: 'pending',
    // 🟠 Static data sync to pms_room_types_cache / pms_rate_types_cache implemented — PENDING: credentials
    syncIn: 'pending',
    // 🟠 prebook, create_reservation, modify_reservation, cancel_reservation implemented — PENDING: credentials
    pushBooking: 'pending',
    // ❌ Not yet live — awaiting HyperGuest account provisioning
    liveMonitor: false,
  },
};

// Get count of completed milestones for a PMS
export const getCompletedMilestoneCount = (systemType: string): number => {
  const status = pmsIntegrationStatus[systemType];
  if (!status) return 0;
  return Object.values(status).filter(v => v === true).length;
};

// Get count of pending (implemented but not tested) milestones
export const getPendingMilestoneCount = (systemType: string): number => {
  const status = pmsIntegrationStatus[systemType];
  if (!status) return 0;
  return Object.values(status).filter(v => v === 'pending').length;
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
    pushBooking: false,
    liveMonitor: false,
  };

  const completedCount = Object.values(status).filter(v => v === true).length;
  const pendingCount = Object.values(status).filter(v => v === 'pending').length;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Implementation Progress
        </span>
        <span className="text-xs text-muted-foreground">
          {completedCount}/{milestones.length} complete
          {pendingCount > 0 && ` • ${pendingCount} pending`}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {milestones.map((milestone) => {
          const Icon = milestone.icon;
          const value = status[milestone.key];
          const isComplete = value === true;
          const isPending = value === 'pending';

          return (
            <Tooltip key={milestone.key}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "p-1.5 rounded-md transition-colors cursor-help",
                    isComplete
                      ? "bg-status-healthy/20 text-status-healthy"
                      : isPending
                      ? "bg-status-warning/20 text-status-warning"
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
                    ) : isPending ? (
                      <span className="text-orange-500">◐</span>
                    ) : (
                      <span className="text-muted-foreground">○</span>
                    )}
                    {milestone.label}
                    {isPending && <span className="text-xs text-orange-500 font-normal">(pending test)</span>}
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
