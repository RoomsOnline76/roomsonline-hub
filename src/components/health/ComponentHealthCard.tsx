import { useState, lazy, Suspense } from "react";
import { ChevronDown, ChevronUp, RefreshCw, AlertTriangle, Clock, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { HealthStatusBadge } from "./HealthStatusBadge";
/* Trend chart only renders in the expanded detail view. */
const HealthTrendChart = lazy(() => import("./HealthTrendChart").then((m) => ({ default: m.HealthTrendChart })));
import { cn } from "@/lib/utils";

interface HealthCheck {
  id: string;
  status: string;
  latency_ms: number;
  error_code?: string;
  error_message?: string;
  checked_at: string;
}

interface ComponentHealthCardProps {
  componentKey: string;
  componentName: string;
  componentType: string;
  isCritical: boolean;
  isActive?: boolean;
  expectedLatency: number;
  lastStatus: string;
  lastChecked: string;
  avgLatency: number;
  uptimePercentage: number;
  failureCount24h: number;
  recentChecks: HealthCheck[];
  onTestComponent?: () => void;
  isTestingComponent?: boolean;
}

export function ComponentHealthCard({
  componentName,
  componentType,
  isCritical,
  isActive = true,
  expectedLatency,
  lastStatus,
  lastChecked,
  avgLatency,
  uptimePercentage,
  failureCount24h,
  recentChecks,
  onTestComponent,
  isTestingComponent,
}: ComponentHealthCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getTypeIcon = () => {
    switch (componentType) {
      case 'pms':
        return '🔌';
      case 'internal':
        return '⚙️';
      case 'external':
        return '🌐';
      case 'infrastructure':
        return '🏗️';
      default:
        return '📦';
    }
  };

  const chartData = recentChecks.slice(0, 48).reverse().map(check => ({
    time: new Date(check.checked_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
    latency: check.latency_ms || 0,
    status: check.status,
  }));

  const lastError = recentChecks.find(c => c.status === 'failed');
  /* Unverifiable checks (e.g. browser-restricted API keys) carry an explanation, not an error. */
  const latestCheck = recentChecks[0];
  const notVerifiedNote =
    latestCheck && latestCheck.status === 'unknown' ? latestCheck.error_message : undefined;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card className={cn(
        "transition-all duration-200",
        !isActive && "opacity-50 grayscale",
        lastStatus === 'failed' && isActive && "border-red-500/50 bg-red-500/5",
        lastStatus === 'degraded' && isActive && "border-yellow-500/50 bg-yellow-500/5",
        isExpanded && "ring-2 ring-primary/20"
      )}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-lg">{getTypeIcon()}</span>
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {componentName}
                    {!isActive && (
                      <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-normal">
                        Inactive
                      </span>
                    )}
                    {isCritical && isActive && (
                      <span className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded font-normal">
                        Critical
                      </span>
                    )}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                    {componentType.replace('_', ' ')}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="hidden sm:flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Zap className="h-3.5 w-3.5" />
                    <span>{avgLatency}ms</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{lastChecked}</span>
                  </div>
                  {failureCount24h > 0 && (
                    <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>{failureCount24h} failures</span>
                    </div>
                  )}
                </div>
                <HealthStatusBadge status={lastStatus} size="sm" />
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Uptime (24h)</p>
                <p className={cn(
                  "text-lg font-semibold",
                  uptimePercentage >= 99 ? "text-green-600 dark:text-green-400" :
                  uptimePercentage >= 95 ? "text-yellow-600 dark:text-yellow-400" :
                  "text-red-600 dark:text-red-400"
                )}>
                  {uptimePercentage.toFixed(1)}%
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Avg Latency</p>
                <p className={cn(
                  "text-lg font-semibold",
                  avgLatency <= expectedLatency ? "text-green-600 dark:text-green-400" :
                  avgLatency <= expectedLatency * 1.5 ? "text-yellow-600 dark:text-yellow-400" :
                  "text-red-600 dark:text-red-400"
                )}>
                  {avgLatency}ms
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Expected</p>
                <p className="text-lg font-semibold text-muted-foreground">
                  {expectedLatency}ms
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Failures (24h)</p>
                <p className={cn(
                  "text-lg font-semibold",
                  failureCount24h === 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                )}>
                  {failureCount24h}
                </p>
              </div>
            </div>

            {/* Latency Chart */}
            <div>
              <h4 className="text-sm font-medium mb-2">Latency Trend (Last 24h)</h4>
              <div className="bg-muted/30 rounded-lg p-2">
                <Suspense fallback={<div className="h-[160px] w-full animate-pulse rounded bg-muted/50" aria-hidden />}>
                <HealthTrendChart 
                  data={chartData} 
                  expectedLatency={expectedLatency}
                  height={100}
                />
                </Suspense>
              </div>
            </div>

            {/* Not verifiable note */}
            {notVerifiedNote && (
              <div className="bg-muted/50 border border-border rounded-lg p-3">
                <h4 className="text-sm font-medium mb-1">Monitoring note</h4>
                <p className="text-sm text-muted-foreground">{notVerifiedNote}</p>
              </div>
            )}

            {/* Last Error */}
            {lastError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">
                  Last Error
                </h4>
                <p className="text-sm text-red-600 dark:text-red-300">
                  {lastError.error_message || 'Unknown error'}
                </p>
                <p className="text-xs text-red-500/70 mt-1">
                  {new Date(lastError.checked_at).toLocaleString('en-ZA')}
                </p>
              </div>
            )}

            {/* Recent Checks */}
            <div>
              <h4 className="text-sm font-medium mb-2">Recent Checks</h4>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {recentChecks.slice(0, 10).map((check) => (
                  <div 
                    key={check.id}
                    className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <HealthStatusBadge status={check.status} size="sm" showLabel={false} />
                      <span className="text-muted-foreground">
                        {new Date(check.checked_at).toLocaleTimeString('en-ZA', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                    </div>
                    <span className={cn(
                      check.latency_ms > expectedLatency && "text-yellow-600 dark:text-yellow-400"
                    )}>
                      {check.latency_ms}ms
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Test Button */}
            {onTestComponent && (
              <Button
                variant="outline"
                size="sm"
                onClick={onTestComponent}
                disabled={isTestingComponent}
                className="w-full"
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", isTestingComponent && "animate-spin")} />
                {isTestingComponent ? 'Testing...' : 'Test Component'}
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
