import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Check, AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

interface SyncStatusIndicatorProps {
  status: SyncStatus;
  lastSyncAt?: string | null;
  onSync?: () => Promise<void>;
  className?: string;
  showButton?: boolean;
  compact?: boolean;
}

export function SyncStatusIndicator({
  status,
  lastSyncAt,
  onSync,
  className,
  showButton = true,
  compact = false,
}: SyncStatusIndicatorProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSync = async () => {
    if (!onSync || isLoading) return;
    setIsLoading(true);
    try {
      await onSync();
    } finally {
      setIsLoading(false);
    }
  };

  const currentStatus = isLoading ? 'syncing' : status;

  const formatLastSync = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  const getStatusIcon = () => {
    switch (currentStatus) {
      case 'syncing':
        return <RefreshCw className="h-4 w-4 animate-spin text-primary" />;
      case 'success':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusText = () => {
    switch (currentStatus) {
      case 'syncing':
        return 'Syncing...';
      case 'success':
        return 'Synced';
      case 'error':
        return 'Sync failed';
      default:
        return lastSyncAt ? `Last sync: ${formatLastSync(lastSyncAt)}` : 'Never synced';
    }
  };

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {getStatusIcon()}
        {showButton && onSync && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleSync}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {getStatusIcon()}
        <span>{getStatusText()}</span>
      </div>
      {showButton && onSync && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          {isLoading ? 'Syncing...' : 'Sync Now'}
        </Button>
      )}
    </div>
  );
}
