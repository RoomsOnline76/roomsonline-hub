import { Check, CircleDashed } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface ReadinessItem {
  label: string;
  done: boolean;
  hint?: string;
}

interface ReportReadinessChecklistProps {
  items: ReadinessItem[];
}

/**
 * Shows, at a glance, whether a property is configured well enough for its
 * revenue reports to render correctly (capacity, branding, baselines).
 */
export function ReportReadinessChecklist({ items }: ReportReadinessChecklistProps) {
  const done = items.filter((item) => item.done).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">
          Report readiness{" "}
          <span className="font-normal text-muted-foreground">
            ({done}/{items.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li key={item.label} className="flex items-start gap-2.5 text-sm">
              {item.done ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              ) : (
                <CircleDashed
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              )}
              <div className="min-w-0">
                <p className={item.done ? "" : "font-medium"}>{item.label}</p>
                {!item.done && item.hint && (
                  <p className="text-xs text-muted-foreground">{item.hint}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
