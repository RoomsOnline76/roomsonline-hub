import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export type PMSSyncStatus = 'active' | 'syncing' | 'delayed' | 'error' | 'disconnected';

interface ExternalSourceBadgeProps {
  systemType: string;
  status?: PMSSyncStatus;
  lastSyncAt?: string | null;
  className?: string;
  showTooltip?: boolean;
}

const statusConfig: Record<PMSSyncStatus, { color: string; label: string }> = {
  active: { color: 'text-green-500', label: 'Active and syncing' },
  syncing: { color: 'text-blue-500 animate-pulse', label: 'Syncing...' },
  delayed: { color: 'text-yellow-500', label: 'Sync delayed' },
  error: { color: 'text-red-500', label: 'Connection error' },
  disconnected: { color: 'text-muted-foreground', label: 'Disconnected' },
};

const systemNames: Record<string, string> = {
  hostfully: 'Hostfully',
  benson: 'Benson',
  nightsbridge: 'NightsBridge',
  checkfront: 'Checkfront',
  cloudbeds: 'Cloudbeds',
  littlehotelier: 'Little Hotelier',
  siteminder: 'SiteMinder',
  roomsonline: 'RoomsOnline',
};

export function ExternalSourceBadge({
  systemType,
  status = 'active',
  lastSyncAt,
  className,
  showTooltip = true,
}: ExternalSourceBadgeProps) {
  const displayName = systemNames[systemType.toLowerCase()] || systemType;
  const statusInfo = statusConfig[status];

  const formatLastSync = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const badge = (
    <Badge 
      variant="outline" 
      className={cn(
        "gap-1.5 font-normal",
        className
      )}
    >
      <Link className="h-3 w-3" />
      <span>{displayName}</span>
      <Circle className={cn("h-2 w-2 fill-current", statusInfo.color)} />
    </Badge>
  );

  if (!showTooltip) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <p className="font-medium">{statusInfo.label}</p>
            {lastSyncAt && (
              <p className="text-muted-foreground">
                Last sync: {formatLastSync(lastSyncAt)}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
