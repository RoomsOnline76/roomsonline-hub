import { AlertTriangle, AlertCircle, ExternalLink } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useHelp } from "@/contexts/HelpContext";
import { cn } from "@/lib/utils";

interface ImpactWarningProps {
  table: string;
  field: string;
  level?: "critical" | "warning";
  className?: string;
}

export function ImpactWarning({
  table,
  field,
  level = "warning",
  className,
}: ImpactWarningProps) {
  const { getArticlesByContext, openHelp } = useHelp();

  const articles = getArticlesByContext(table, field);
  const criticalArticle = articles.find((a) => a.impact_level === "critical");
  const warningArticle = articles.find((a) => a.impact_level === "warning");
  const relevantArticle = criticalArticle || warningArticle;

  if (!relevantArticle) return null;

  const actualLevel = criticalArticle ? "critical" : level;
  const Icon = actualLevel === "critical" ? AlertTriangle : AlertCircle;

  const messages = {
    critical: "Changing this setting can break your booking flow.",
    warning: "This setting affects live bookings.",
  };

  return (
    <Alert
      variant={actualLevel === "critical" ? "destructive" : "default"}
      className={cn(
        "py-2 px-3",
        actualLevel === "warning" && "border-yellow-500/50 bg-yellow-500/5",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon
            className={cn(
              "h-4 w-4 flex-shrink-0",
              actualLevel === "critical"
                ? "text-destructive"
                : "text-yellow-600"
            )}
          />
          <AlertDescription className="text-sm">
            {messages[actualLevel]}
          </AlertDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1 flex-shrink-0"
          onClick={(e) => {
            e.preventDefault();
            openHelp(relevantArticle.slug);
          }}
          type="button"
        >
          Learn more
          <ExternalLink className="h-3 w-3" />
        </Button>
      </div>
    </Alert>
  );
}
