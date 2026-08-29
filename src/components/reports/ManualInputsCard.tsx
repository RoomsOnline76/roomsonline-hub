import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, RotateCcw, Save } from "lucide-react";
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

type DraftField = "dinner" | "room0" | "comp";
type Draft = Record<string, Record<DraftField, string>>;
type OverrideSet = Record<DraftField, Record<string, boolean>>;

/** Figures the parser calculated from the export, before any reviewer override. */
export interface DerivedMonthlyInputs {
  dinner_by_month?: Record<string, number> | null;
  room0_by_month?: Record<string, number> | null;
  comp_rns_by_month?: Record<string, number> | null;
}

const FIELD_TO_COLUMN: Record<DraftField, keyof DerivedMonthlyInputs> = {
  dinner: "dinner_by_month",
  room0: "room0_by_month",
  comp: "comp_rns_by_month",
};

const EMPTY_OVERRIDES: OverrideSet = { dinner: {}, room0: {}, comp: {} };

interface Props {
  runId: string;
  /** Drives which monthly columns exist — OPERA has no Dinner / Room 0. */
  sourceType?: string | null;
  months: string[];
  otbRevenue: Record<string, number>;
  /** Calculated Dinner / Room 0 / Comp RN figures from the latest parse. */
  derivedInputs?: DerivedMonthlyInputs | null;
  /** Which half of the card to show: monthly figures, narrative notes, or both. */
  sections?: "all" | "monthly" | "narrative";
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
  derivedInputs,
  sections = "all",
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
  // Runtime column set — inline style, since Tailwind cannot generate arbitrary
  // grid templates from a dynamic string.
  const gridStyle = {
    gridTemplateColumns: [
      "6rem",
      showDinner ? "1fr" : null,
      showRoom0 ? "1fr" : null,
      showComp ? "1fr" : null,
      showAdditional ? "7rem" : null,
      "8rem",
      "2.5rem",
    ]
      .filter(Boolean)
      .join(" "),
  };

  const showMonthly = sections !== "narrative";
  const showNarrative = sections !== "monthly";

  const { inputs, save } = useReportAdditionalInputs(runId);
  const [draft, setDraft] = useState<Draft>({});
  const [overrides, setOverrides] = useState<OverrideSet>(EMPTY_OVERRIDES);
  const [minStay, setMinStay] = useState("");
  const [promotions, setPromotions] = useState("");
  const [rateOverrides, setRateOverrides] = useState("");
  const [commentary, setCommentary] = useState("");

  /** The parser's figure for a month, empty when it calculated nothing. */
  const calculated = (field: DraftField, key: string): string => {
    const value = derivedInputs?.[FIELD_TO_COLUMN[field]]?.[key];
    return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  };

  useEffect(() => {
    const nextOverrides: OverrideSet = {
      dinner: { ...(inputs?.overrides?.dinner_by_month ?? {}) },
      room0: { ...(inputs?.overrides?.room0_by_month ?? {}) },
      comp: { ...(inputs?.overrides?.comp_rns_by_month ?? {}) },
    };
    const stored: Record<DraftField, Record<string, number>> = {
      dinner: inputs?.dinnerByMonth ?? {},
      room0: inputs?.room0ByMonth ?? {},
      comp: inputs?.compRnsByMonth ?? {},
    };
    // Legacy runs kept reviewer values without any flags: honour every stored
    // value for such a field and mark it so a re-process cannot wipe it.
    const legacyField: Record<DraftField, boolean> = {
      dinner: Object.keys(nextOverrides.dinner).length === 0,
      room0: Object.keys(nextOverrides.room0).length === 0,
      comp: Object.keys(nextOverrides.comp).length === 0,
    };
    const next: Draft = {};
    for (const key of months) {
      const row = {} as Record<DraftField, string>;
      for (const field of ["dinner", "room0", "comp"] as DraftField[]) {
        const derived = calculated(field, key);
        const typed = stored[field]?.[key];
        const hasTyped = typeof typed === "number" && Number.isFinite(typed);
        if (hasTyped && (nextOverrides[field][key] || legacyField[field])) {
          nextOverrides[field][key] = true;
          row[field] = String(typed);
        } else {
          row[field] = derived;
        }
      }
      next[key] = row;
    }
    setDraft(next);
    setOverrides(nextOverrides);
    setMinStay(inputs?.minStayNotes ?? "");
    setPromotions(inputs?.promotionsNotes ?? "");
    setRateOverrides(inputs?.rateOverrideNotes ?? "");
    setCommentary(inputs?.freeCommentary ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, months, derivedInputs]);

  const update = (key: string, field: DraftField, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
    setOverrides((prev) => ({ ...prev, [field]: { ...prev[field], [key]: true } }));
  };

  /** Drop the reviewer's figure and fall back to what the export produced. */
  const revert = (key: string) => {
    setDraft((prev) => ({
      ...prev,
      [key]: {
        dinner: calculated("dinner", key),
        room0: calculated("room0", key),
        comp: calculated("comp", key),
      },
    }));
    setOverrides((prev) => {
      const next: OverrideSet = { dinner: { ...prev.dinner }, room0: { ...prev.room0 }, comp: { ...prev.comp } };
      delete next.dinner[key];
      delete next.room0[key];
      delete next.comp[key];
      return next;
    });
  };

  const isOverridden = (key: string): boolean =>
    Boolean(overrides.dinner[key] || overrides.room0[key] || overrides.comp[key]);

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
        overrides: {
          dinner_by_month: overrides.dinner,
          room0_by_month: overrides.room0,
          comp_rns_by_month: overrides.comp,
        },
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
        <CardTitle className="text-base font-medium">
          {sections === "monthly"
            ? "Additional revenue"
            : sections === "narrative"
              ? "Notes for the report"
              : "Additional revenue & notes"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {showMonthly && (
        <div className="overflow-x-auto">
          <div className="min-w-[42rem] space-y-2">
            <p className="text-xs text-muted-foreground">
              Figures are calculated from the uploaded export. Type over any month to
              override it — overridden months survive a re-process, and the arrow puts
              the calculated figure back.
            </p>
            <div
              className="grid gap-2 text-xs uppercase tracking-wide text-muted-foreground"
              style={gridStyle}
            >
              <span>Month</span>
              {showDinner && <span>Dinner</span>}
              {showRoom0 && <span>Room 0</span>}
              {showComp && <span>Comp RNs</span>}
              {showAdditional && <span className="text-right">Additional</span>}
              <span className="text-right">{showAdditional ? "Combined" : "OTB revenue"}</span>
              <span className="sr-only">Revert</span>
            </div>
            {months.map((key) => (
              <div key={key} className="grid items-center gap-2" style={gridStyle}>
                <span className="text-sm font-medium">
                  {monthLabel(key)}
                  {isOverridden(key) && (
                    <span className="block text-[0.65rem] font-normal uppercase tracking-wide text-primary">
                      Overridden
                    </span>
                  )}
                </span>
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
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={!isOverridden(key)}
                  onClick={() => revert(key)}
                  aria-label={`Use the calculated figures for ${monthLabel(key)}`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}

            <div
              className="grid items-center gap-2 border-t pt-2 text-sm font-medium"
              style={gridStyle}
            >
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
              <span />

            </div>
          </div>
        </div>
        )}

        {showNarrative && (
        <>
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
        </>
        )}

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
