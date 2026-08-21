import { Badge } from "@/components/ui/badge";
import type { ReportRunStatus } from "@/hooks/useReportRuns";

const LABELS: Record<ReportRunStatus, string> = {
  draft: "Draft",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

const VARIANTS: Record<ReportRunStatus, "secondary" | "outline" | "default" | "destructive"> = {
  draft: "outline",
  processing: "secondary",
  ready: "default",
  failed: "destructive",
};

export function RunStatusPill({ status }: { status: ReportRunStatus }) {
  return (
    <Badge variant={VARIANTS[status]} className="font-normal">
      {LABELS[status]}
    </Badge>
  );
}
