import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useReportAdditionalInputs } from "@/hooks/usePropertyReportSettings";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const monthLabel = (key: string): string => {
  const [year, month] = key.split("-").map(Number);
  return `${MONTHS[month - 1] ?? key} ${`${year}`.slice(2)}`;
};

type Draft = Record<string, { dinner: string; room0: string; comp: string }>;

interface Props {
  runId: string;
  months: string[];
}

/** Dinner / Room 0 / complimentary room nights supplied by the reviewer. */
export function ManualInputsCard({ runId, months }: Props) {
  const { inputs, save } = useReportAdditionalInputs(runId);
  const [draft, setDraft] = useState<Draft>({});

  useEffect(() => {
    const next: Draft = {};
    for (const key of months) {
      next[key] = {
        dinner: String(inputs?.dinnerByMonth?.[key] ?? ""),
        room0: String(inputs?.room0ByMonth?.[key] ?? ""),
        comp: String(inputs?.compRnsByMonth?.[key] ?? ""),
      };
    }
    setDraft(next);
  }, [inputs, months]);

  const update = (key: string, field: keyof Draft[string], value: string) =>
    setDraft((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));

  const handleSave = async () => {
    const dinnerByMonth: Record<string, number> = {};
    const room0ByMonth: Record<string, number> = {};
    const compRnsByMonth: Record<string, number> = {};
    for (const key of months) {
      const row = draft[key];
      if (!row) continue;
      if (row.dinner.trim()) dinnerByMonth[key] = Number(row.dinner) || 0;
      if (row.room0.trim()) room0ByMonth[key] = Number(row.room0) || 0;
      if (row.comp.trim()) compRnsByMonth[key] = Number(row.comp) || 0;
    }
    try {
      await save.mutateAsync({
        dinnerByMonth,
        room0ByMonth,
        compRnsByMonth,
        freeCommentary: inputs?.freeCommentary ?? null,
      });
      toast.success("Additional inputs saved", {
        description: "Re-process or regenerate the workbook to include them.",
      });
    } catch (error) {
      toast.error("Could not save inputs", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  if (months.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Additional revenue inputs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[6rem_1fr_1fr_1fr] gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <span>Month</span>
          <span>Dinner</span>
          <span>Room 0</span>
          <span>Comp RNs</span>
        </div>
        {months.map((key) => (
          <div key={key} className="grid grid-cols-[6rem_1fr_1fr_1fr] items-center gap-2">
            <span className="text-sm font-medium">{monthLabel(key)}</span>
            <Input
              type="number"
              inputMode="decimal"
              value={draft[key]?.dinner ?? ""}
              onChange={(e) => update(key, "dinner", e.target.value)}
              aria-label={`Dinner revenue for ${monthLabel(key)}`}
            />
            <Input
              type="number"
              inputMode="decimal"
              value={draft[key]?.room0 ?? ""}
              onChange={(e) => update(key, "room0", e.target.value)}
              aria-label={`Room 0 revenue for ${monthLabel(key)}`}
            />
            <Input
              type="number"
              inputMode="numeric"
              value={draft[key]?.comp ?? ""}
              onChange={(e) => update(key, "comp", e.target.value)}
              aria-label={`Complimentary room nights for ${monthLabel(key)}`}
            />
          </div>
        ))}
        <div className="flex justify-end">
          <Button onClick={() => void handleSave()} disabled={save.isPending} variant="outline">
            {save.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save inputs
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
