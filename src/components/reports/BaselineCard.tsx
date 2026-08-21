import { useMemo } from "react";
import { History, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useReportBaseline, type ReportRunDetail } from "@/hooks/useReportRuns";

const NONE = "__none__";

const formatDate = (iso: string): string =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

interface Props {
  run: ReportRunDetail;
  onChanged: () => void | Promise<void>;
}

/** Which earlier run supplies the "OTB @ previous date" column. */
export function BaselineCard({ run, onChanged }: Props) {
  const { candidates, setBaseline, clearLock } = useReportBaseline(run);

  const current = useMemo(
    () => candidates.find((candidate) => candidate.id === run.previousRunId) ?? null,
    [candidates, run.previousRunId],
  );

  const handleChange = async (value: string) => {
    try {
      await setBaseline.mutateAsync(value === NONE ? null : value);
      toast.success("Comparison run updated", {
        description: "Re-process the run to refresh the variance columns.",
      });
      await onChanged();
    } catch (error) {
      toast.error("Could not update the comparison run", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleAuto = async () => {
    try {
      await clearLock.mutateAsync();
      toast.success("Back to automatic selection", {
        description: "The most recent earlier run will be used on the next process.",
      });
      await onChanged();
    } catch (error) {
      toast.error("Could not reset the comparison run", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Comparison baseline
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {run.previousRunId && current
            ? `Comparing against “${current.title ?? "Untitled run"}” (as-of ${formatDate(current.asOfDate)}).`
            : run.previousRunId
              ? "Comparing against an earlier run for this property."
              : candidates.length === 0
                ? "This is the first run for this property — the previous-OTB columns stay empty."
                : "No comparison run selected; previous-OTB columns will stay empty."}
          {run.baselineLocked ? " Chosen manually." : " Chosen automatically."}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={run.previousRunId ?? NONE}
            onValueChange={(value) => void handleChange(value)}
            disabled={setBaseline.isPending}
          >
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue placeholder="Select a comparison run" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No comparison run</SelectItem>
              {candidates.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.title ?? "Untitled run"} · {formatDate(candidate.asOfDate)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {run.baselineLocked && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleAuto()}
              disabled={clearLock.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Use automatic
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
