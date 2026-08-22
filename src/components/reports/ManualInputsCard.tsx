import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useReportAdditionalInputs } from "@/hooks/usePropertyReportSettings";
import { monthLabel } from "@/lib/historicalBaseline";
import { getAdapter } from "@/lib/report-adapters";

const money = (value: number): string =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value || 0);

type Draft = Record<string, { dinner: string; room0: string; comp: string }>;

interface Props {
  runId: string;
  /** Drives which monthly columns exist — OPERA has no Dinner / Room 0. */
  sourceType?: string | null;
  months: string[];
  otbRevenue: Record<string, number>;
  onSaved?: () => void | Promise<void>;
  onReprocess?: () => void | Promise<void>;
  isProcessing?: boolean;
}

/** Adapter-driven monthly extras (Dinner / Room 0 / comp nights) and narrative notes. */
export function ManualInputsCard({
  runId,
  sourceType,
  months,
  otbRevenue,
  onSaved,
  onReprocess,
  isProcessing = false,
}: Props) {
  const monthlyKeys = useMemo(
    () =>
      new Set(
        getAdapter(sourceType)
          .getDefaultAdditionalFields()
          .monthly.map((field) => field.key),
      ),
    [sourceType],
  );
  const showDinner = monthlyKeys.has("dinner_by_month");
  const showRoom0 = monthlyKeys.has("room0_by_month");
  const showComp = monthlyKeys.has("comp_rns_by_month");
  const showAdditional = showDinner || showRoom0;
  const gridCols = [
    "6rem",
    showDinner ? "1fr" : null,
    showRoom0 ? "1fr" : null,
    showComp ? "1fr" : null,
    showAdditional ? "7rem" : null,
    "8rem",
  ]
    .filter(Boolean)
    .join("_");
  const gridClass = `grid grid-cols-[${gridCols}] gap-2`;

  const { inputs, save } = useReportAdditionalInputs(runId);
  const [draft, setDraft] = useState<Draft>({});
  const [minStay, setMinStay] = useState("");
  const [promotions, setPromotions] = useState("");
  const [rateOverrides, setRateOverrides] = useState("");
  const [commentary, setCommentary] = useState("");

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
    setMinStay(inputs?.minStayNotes ?? "");
    setPromotions(inputs?.promotionsNotes ?? "");
    setRateOverrides(inputs?.rateOverrideNotes ?? "");
    setCommentary(inputs?.freeCommentary ?? "");
  }, [inputs, months]);

  const update = (key: string, field: keyof Draft[string], value: string) =>
    setDraft((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));

  const totals = useMemo(() => {
    let additional = 0;
    let otb = 0;
    let comp = 0;
    const perMonth: Record<string, { additional: number; combined: number }> = {};
    for (const key of months) {
      const row = draft[key];
      const extra =
        (showDinner ? Number(row?.dinner) || 0 : 0) + (showRoom0 ? Number(row?.room0) || 0 : 0);
      const base = otbRevenue[key] ?? 0;
      perMonth[key] = { additional: extra, combined: base + extra };
      additional += extra;
      otb += base;
      comp += Number(row?.comp) || 0;
    }
    return { additional, otb, comp, combined: otb + additional, perMonth };
  }, [draft, months, otbRevenue, showDinner, showRoom0]);

  const handleSave = async () => {
    const dinnerByMonth: Record<string, number> = {};
    const room0ByMonth: Record<string, number> = {};
    const compRnsByMonth: Record<string, number> = {};
    for (const key of months) {
      const row = draft[key];
      if (!row) continue;
      if (showDinner && row.dinner.trim()) dinnerByMonth[key] = Number(row.dinner) || 0;
      if (showRoom0 && row.room0.trim()) room0ByMonth[key] = Number(row.room0) || 0;
      if (showComp && row.comp.trim()) compRnsByMonth[key] = Number(row.comp) || 0;
    }
    try {
      await save.mutateAsync({
        dinnerByMonth,
        room0ByMonth,
        compRnsByMonth,
        minStayNotes: minStay.trim() || null,
        promotionsNotes: promotions.trim() || null,
        rateOverrideNotes: rateOverrides.trim() || null,
        freeCommentary: commentary.trim() || null,
      });
      toast.success("Additional inputs saved", {
        description: "Re-process to fold them into the snapshot and workbook.",
      });
      await onSaved?.();
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
        <CardTitle className="text-base font-medium">Additional revenue &amp; notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="overflow-x-auto">
          <div className="min-w-[40rem] space-y-2">
            <div className={`${gridClass} text-xs uppercase tracking-wide text-muted-foreground`}>
              <span>Month</span>
              {showDinner && <span>Dinner</span>}
              {showRoom0 && <span>Room 0</span>}
              {showComp && <span>Comp RNs</span>}
              {showAdditional && <span className="text-right">Additional</span>}
              <span className="text-right">{showAdditional ? "Combined" : "OTB revenue"}</span>
            </div>
            {months.map((key) => (
              <div key={key} className={`${gridClass} items-center`}>
                <span className="text-sm font-medium">{monthLabel(key)}</span>
                {showDinner && (
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={draft[key]?.dinner ?? ""}
                    onChange={(e) => update(key, "dinner", e.target.value)}
                    aria-label={`Dinner revenue for ${monthLabel(key)}`}
                  />
                )}
                {showRoom0 && (
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={draft[key]?.room0 ?? ""}
                    onChange={(e) => update(key, "room0", e.target.value)}
                    aria-label={`Room 0 revenue for ${monthLabel(key)}`}
                  />
                )}
                {showComp && (
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={draft[key]?.comp ?? ""}
                    onChange={(e) => update(key, "comp", e.target.value)}
                    aria-label={`Complimentary room nights for ${monthLabel(key)}`}
                  />
                )}
                {showAdditional && (
                  <span className="text-sm text-right tabular-nums text-muted-foreground">
                    {money(totals.perMonth[key]?.additional ?? 0)}
                  </span>
                )}
                <span className="text-sm text-right tabular-nums font-medium">
                  {money(totals.perMonth[key]?.combined ?? 0)}
                </span>
              </div>
            ))}
            <div className={`${gridClass} items-center border-t pt-2 text-sm font-medium`}>
              <span>Total</span>
              {showDinner && (
                <span className="text-muted-foreground font-normal">OTB {money(totals.otb)}</span>
              )}
              {showRoom0 && <span />}
              {showComp && (
                <span className="text-muted-foreground font-normal tabular-nums">
                  {totals.comp} comp RN(s)
                </span>
              )}
              {showAdditional && (
                <span className="text-right tabular-nums">{money(totals.additional)}</span>
              )}
              <span className="text-right tabular-nums">{money(totals.combined)}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="min-stay-notes">Minimum stay</Label>
            <Textarea
              id="min-stay-notes"
              value={minStay}
              onChange={(e) => setMinStay(e.target.value)}
              rows={3}
              placeholder="e.g. 2 nights over long weekends"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="promotions-notes">Promotions</Label>
            <Textarea
              id="promotions-notes"
              value={promotions}
              onChange={(e) => setPromotions(e.target.value)}
              rows={3}
              placeholder="Active specials and campaigns"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rate-override-notes">Rate overrides</Label>
            <Textarea
              id="rate-override-notes"
              value={rateOverrides}
              onChange={(e) => setRateOverrides(e.target.value)}
              rows={3}
              placeholder="Manual rate decisions for the period"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="free-commentary">Commentary</Label>
          <Textarea
            id="free-commentary"
            value={commentary}
            onChange={(e) => setCommentary(e.target.value)}
            rows={4}
            placeholder="Anything the owner should read alongside the numbers"
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => void handleSave()} disabled={save.isPending} variant="outline">
            {save.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save inputs
          </Button>
          {onReprocess && (
            <Button
              onClick={async () => {
                await handleSave();
                await onReprocess();
              }}
              disabled={isProcessing || save.isPending}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Save &amp; re-process
            </Button>
          )}

        </div>
      </CardContent>
    </Card>
  );
}
