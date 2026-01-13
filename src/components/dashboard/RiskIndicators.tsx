import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, XCircle, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface RiskIndicatorsProps {
  cancellationRate: number;
  syncFailureCount: number;
  lowPerformingProperties: number;
  isLoading?: boolean;
}

interface RiskItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  severity: "low" | "medium" | "high";
}

function RiskItem({ icon, label, value, severity }: RiskItemProps) {
  const severityColors = {
    low: "text-green-600 bg-green-50 dark:bg-green-950/30",
    medium: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30",
    high: "text-red-600 bg-red-50 dark:bg-red-950/30",
  };

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <div className={cn("p-1.5 rounded", severityColors[severity])}>
          {icon}
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

export function RiskIndicators({
  cancellationRate,
  syncFailureCount,
  lowPerformingProperties,
  isLoading,
}: RiskIndicatorsProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Risk Indicators</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getCancellationSeverity = (rate: number): "low" | "medium" | "high" => {
    if (rate <= 5) return "low";
    if (rate <= 15) return "medium";
    return "high";
  };

  const getSyncSeverity = (count: number): "low" | "medium" | "high" => {
    if (count === 0) return "low";
    if (count <= 5) return "medium";
    return "high";
  };

  const getLowPerformerSeverity = (count: number): "low" | "medium" | "high" => {
    if (count === 0) return "low";
    if (count <= 3) return "medium";
    return "high";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Risk Indicators</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-border">
          <RiskItem
            icon={<XCircle className="h-3.5 w-3.5" />}
            label="Cancellation Rate"
            value={`${cancellationRate.toFixed(1)}%`}
            severity={getCancellationSeverity(cancellationRate)}
          />
          <RiskItem
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            label="Sync Failures"
            value={String(syncFailureCount)}
            severity={getSyncSeverity(syncFailureCount)}
          />
          <RiskItem
            icon={<TrendingDown className="h-3.5 w-3.5" />}
            label="Low Performers"
            value={`${lowPerformingProperties} props`}
            severity={getLowPerformerSeverity(lowPerformingProperties)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
