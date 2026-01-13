import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface ROLKPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  isLoading?: boolean;
  className?: string;
  valueClassName?: string;
}

export function ROLKPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  isLoading,
  className,
  valueClassName,
}: ROLKPICardProps) {
  if (isLoading) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="p-4">
          <Skeleton className="h-3 w-20 mb-2" />
          <Skeleton className="h-7 w-28 mb-1" />
          <Skeleton className="h-3 w-16" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("", className)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {title}
          </span>
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="flex items-baseline gap-2">
          <span className={cn("text-2xl font-bold", valueClassName)}>
            {value}
          </span>
          {trend && (
            <span
              className={cn(
                "text-xs font-medium",
                trend.isPositive ? "text-green-600" : "text-red-600"
              )}
            >
              {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
            </span>
          )}
        </div>
        {subtitle && (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        )}
      </CardContent>
    </Card>
  );
}
