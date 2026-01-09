import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Circle, ExternalLink, User, Phone, Mail, Info } from "lucide-react";
import { PMSTrackerStatus as TrackerType, getProgressCount } from "@/lib/pmsTrackerConfig";
import { StatusIndicator } from "@/components/ui/status-indicator";

interface PMSTrackerStatusProps {
  tracker: TrackerType | null;
  compact?: boolean;
}

// Map PMS status strings to StatusIndicator status types
const getStatusType = (status: string): "healthy" | "warning" | "error" | "stale" | "syncing" => {
  const normalized = status?.toLowerCase() || '';
  if (normalized === 'complete') return 'healthy';
  if (normalized.includes('wait') || normalized.includes('access')) return 'warning';
  if (normalized === 'in progress') return 'syncing';
  if (normalized === 'register' || normalized === 'review') return 'warning';
  return 'stale';
};

const PMSTrackerStatusDisplay = ({ tracker, compact = false }: PMSTrackerStatusProps) => {
  if (!tracker) {
    return (
      <div className="text-sm text-muted-foreground italic">
        No tracker data available
      </div>
    );
  }

  const progress = getProgressCount(tracker);

  const progressItems = [
    // Setup phase
    { key: 'account', label: 'Account', value: tracker.has_account },
    { key: 'docs', label: 'Docs', value: tracker.has_docs },
    { key: 'edge', label: 'Edge', value: tracker.has_edge },
    // Integration phase
    { key: 'health', label: 'Health', value: tracker.has_health },
    { key: 'get', label: 'GET', value: tracker.has_get },
    { key: 'post', label: 'POST', value: tracker.has_post },
    { key: 'test', label: 'Test', value: tracker.has_soft_test },
    { key: 'prod', label: 'Live', value: tracker.is_production },
  ];

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <StatusIndicator 
          status={getStatusType(tracker.status)} 
          label={tracker.status} 
          size="sm" 
        />
        <span className="text-xs text-muted-foreground">
          {progress.current}/{progress.total}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Status Indicator */}
      <div className="flex items-center gap-2 flex-wrap">
        <StatusIndicator 
          status={getStatusType(tracker.status)} 
          label={tracker.status} 
          size="md" 
        />
        <span className="text-xs text-muted-foreground">
          Progress: {progress.current}/{progress.total}
        </span>
      </div>

      {/* Progress Indicators */}
      <TooltipProvider>
        <div className="flex items-center gap-1 flex-wrap">
          {progressItems.map((item) => (
            <Tooltip key={item.key}>
              <TooltipTrigger asChild>
                <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                  item.value 
                    ? 'bg-status-healthy/20 text-status-healthy' 
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {item.value ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                  {item.label}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{item.label}: {item.value ? 'Complete' : 'Pending'}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

      {/* Contact Person (read-only display) */}
      {tracker.contact_person && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="h-3 w-3" />
          <span>Contact: {tracker.contact_person}</span>
        </div>
      )}

      {/* Additional Info */}
      {tracker.additional_info && Object.keys(tracker.additional_info).length > 0 && (
        <div className="text-xs space-y-1 pt-1 border-t border-border/50">
          {tracker.additional_info.url && (
            <a 
              href={tracker.additional_info.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Registration Link
            </a>
          )}
          {tracker.additional_info.email && (
            <a 
              href={`mailto:${tracker.additional_info.email}`}
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <Mail className="h-3 w-3" />
              {tracker.additional_info.email}
            </a>
          )}
          {tracker.additional_info.agent_code && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Info className="h-3 w-3" />
              Agent Code: <span className="font-mono">{tracker.additional_info.agent_code}</span>
            </div>
          )}
          {tracker.additional_info.user && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <User className="h-3 w-3" />
              User: {tracker.additional_info.user}
            </div>
          )}
          {tracker.additional_info.test_account && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Info className="h-3 w-3" />
              Test: {tracker.additional_info.test_account}
            </div>
          )}
          {tracker.additional_info.notes && (
            <div className="text-amber-600 dark:text-amber-400">
              ⓘ {tracker.additional_info.notes}
            </div>
          )}
          {tracker.additional_info.meeting && (
            <div className="text-amber-600 dark:text-amber-400">
              📅 {tracker.additional_info.meeting}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PMSTrackerStatusDisplay;
