import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ImpactBadgeProps {
  level: "critical" | "warning" | "info";
  className?: string;
}

export function ImpactBadge({ level, className }: ImpactBadgeProps) {
  const config = {
    critical: {
      icon: AlertTriangle,
      label: "Critical",
      className: "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20",
    },
    warning: {
      icon: AlertCircle,
      label: "Warning",
      className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 hover:bg-yellow-500/20",
    },
    info: {
      icon: Info,
      label: "Info",
      className: "bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20",
    },
  };

  const { icon: Icon, label, className: badgeClassName } = config[level];

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 text-xs font-medium", badgeClassName, className)}
    >
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
