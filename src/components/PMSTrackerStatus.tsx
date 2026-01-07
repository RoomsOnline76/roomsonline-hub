import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Circle, ExternalLink, User } from "lucide-react";
import { PMSTrackerStatus as TrackerType, getStatusColor, getProgressCount } from "@/lib/pmsTrackerConfig";

interface PMSTrackerStatusProps {
  tracker: TrackerType | null;
  compact?: boolean;
}

const PMSTrackerStatusDisplay = ({ tracker, compact = false }: PMSTrackerStatusProps) => {
  if (!tracker) {
    return (
      <div className="text-sm text-muted-foreground italic">
        No tracker data available
      </div>
    );
  }

  const statusColors = getStatusColor(tracker.status);
  const progress = getProgressCount(tracker);

  const progressItems = [
    { key: 'access', label: 'Access', value: tracker.has_access },
    { key: 'docs', label: 'Docs', value: tracker.has_docs },
    { key: 'edge', label: 'Edge', value: tracker.has_edge },
    { key: 'get', label: 'GET', value: tracker.has_get },
    { key: 'post', label: 'POST', value: tracker.has_post },
    { key: 'prod', label: 'Prod', value: tracker.is_production },
  ];

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Badge className={`${statusColors.bg} ${statusColors.text} border-0 text-xs`}>
          {tracker.status}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {progress.current}/{progress.total}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 bg-muted/30 rounded-lg border border-border/50">
      {/* Status and Contact Row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Badge className={`${statusColors.bg} ${statusColors.text} border-0`}>
          {tracker.status}
        </Badge>
        
        {tracker.contact_person && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <User className="h-3 w-3" />
            <span>{tracker.contact_person}</span>
          </div>
        )}
      </div>

      {/* Progress Indicators */}
      <TooltipProvider>
        <div className="flex items-center gap-1 flex-wrap">
          {progressItems.map((item) => (
            <Tooltip key={item.key}>
              <TooltipTrigger asChild>
                <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                  item.value 
                    ? 'bg-green-500/20 text-green-700 dark:text-green-400' 
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

      {/* Additional Info */}
      {tracker.additional_info && (
        <div className="text-xs text-muted-foreground space-y-1">
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
          {tracker.additional_info.meeting && (
            <p className="text-amber-600 dark:text-amber-400">
              📅 {tracker.additional_info.meeting}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default PMSTrackerStatusDisplay;
