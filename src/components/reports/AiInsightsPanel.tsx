import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, ListTree, Loader2, Orbit, Pencil, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CRYSTAL_BALL_LABEL, ReplyBlock } from "@/components/reports/insights/ReplyBlock";
import {
  effectivePlacement,
  placementLabel,
  type InsightPlacement,
} from "@/lib/reports/insightPlacement";
import {
  experimentalKey,
  useReportInsights,
  type InsightSelection,
  type InsightSeverity,
  type SuggestionField,
} from "@/hooks/useReportInsights";

const FIELD_LABELS: Record<SuggestionField, string> = {
  min_stay_notes: "Minimum stay",
  promotions_notes: "Promotions",
  rate_override_notes: "Rate overrides",
  free_commentary: "General commentary",
};

const SEVERITY_STYLES: Record<InsightSeverity, { dot: string; label: string }> = {
  high: { dot: "bg-destructive", label: "Needs attention" },
  medium: { dot: "bg-primary", label: "Worth noting" },
  low: { dot: "bg-muted-foreground", label: "Context" },
};

const monthLabel = (key: string | null): string => {
  if (!key) return "Overall";
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString("en-ZA", { month: "short", year: "numeric" });
};

interface Props {
  runId: string;
  /** Months in the run's report window — drives the placement picker. */
  months?: string[];
}

/** Section heading with optional bulk tick controls. */
function SectionHeading({
  title,
  actions,
}: {
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </div>
  );
}

/** TOBI's written read on the run: narrative, flags and suggested commentary. */
export function AiInsightsPanel({ runId, months = [] }: Props) {
  const { insights, isLoading, generate, isGenerating, acceptSuggestion, saveReview } =
    useReportInsights(runId);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [narrativeDraft, setNarrativeDraft] = useState<string>("");
  const [editingNarrative, setEditingNarrative] = useState(false);

  const narrativeText = insights?.narrativeFinal ?? insights?.narrative ?? "";

  useEffect(() => {
    setNarrativeDraft(narrativeText);
  }, [narrativeText]);

  const selections = insights?.selections ?? {};

  const patchSelections = useCallback(
    (next: Record<string, InsightSelection>) => {
      saveReview.mutate({ selections: next });
    },
    [saveReview],
  );

  const toggleSelection = useCallback(
    (key: string, fallbackText: string, include: boolean) => {
      patchSelections({
        ...selections,
        [key]: {
          include,
          text: selections[key]?.text ?? fallbackText,
          edited: selections[key]?.edited === true,
          placement: selections[key]?.placement,
        },
      });
    },
    [selections, patchSelections],
  );

  /** Ticks or clears a whole batch of keys in a single save. */
  const bulkToggle = useCallback(
    (entries: { key: string; text: string }[], include: boolean) => {
      const next: Record<string, InsightSelection> = { ...selections };
      for (const entry of entries) {
        next[entry.key] = {
          include,
          text: next[entry.key]?.text ?? entry.text,
          edited: next[entry.key]?.edited === true,
          placement: next[entry.key]?.placement,
        };
      }
      patchSelections(next);
    },
    [selections, patchSelections],
  );

  const editSelection = useCallback(
    (key: string, text: string, include: boolean) => {
      patchSelections({
        ...selections,
        [key]: { include, text, edited: true, placement: selections[key]?.placement },
      });
      toast.success("Wording saved — it will be reused on the next generation");
    },
    [selections, patchSelections],
  );

  const setPlacement = useCallback(
    (key: string, fallbackText: string, placement: InsightPlacement) => {
      patchSelections({
        ...selections,
        [key]: {
          include: selections[key]?.include === true,
          text: selections[key]?.text ?? fallbackText,
          edited: selections[key]?.edited === true,
          placement,
        },
      });
    },
    [selections, patchSelections],
  );

  /** Drops the reviewer's wording so TOBI's own text shows again. */
  const revertSelection = useCallback(
    (key: string) => {
      const next = { ...selections } as Record<string, InsightSelection>;
      const include = next[key]?.include === true;
      const placement = next[key]?.placement;
      delete next[key];
      if (include) next[key] = { include: true, text: "", placement };
      patchSelections(next);
    },
    [selections, patchSelections],
  );

  const handleGenerate = useCallback(async () => {
    setError(null);
    const result = await generate();
    if (!result.ok) {
      setError(result.message ?? "TOBI could not build the insights.");
      toast.error(result.message ?? "TOBI could not build the insights.");
      return;
    }
    toast.success("Insights ready");
  }, [generate]);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  }, []);

  const handleAccept = useCallback(
    async (field: SuggestionField, text: string) => {
      try {
        await acceptSuggestion.mutateAsync({ field, text });
        setAccepted((prev) => ({ ...prev, [field]: true }));
        toast.success(`${FIELD_LABELS[field]} commentary saved`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save the commentary");
      }
    },
    [acceptSuggestion],
  );

  const suggestionRows = useMemo(
    () =>
      (Object.keys(FIELD_LABELS) as SuggestionField[])
        .map((field) => ({
          field,
          text: insights?.suggestions?.[field] ?? "",
          crystal: insights?.experimental?.suggestions?.[field] ?? "",
        }))
        .filter((row) => row.text.trim().length > 0 || row.crystal.trim().length > 0),
    [insights],
  );

  const paragraphs = useMemo(
    () =>
      (insights?.narrativeFinal ?? insights?.narrative ?? "")
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean),
    [insights],
  );

  /** Every ticked comment grouped by the destination it will print in. */
  const placementSummary = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const entry of Object.values(selections)) {
      const text = String(entry?.text ?? "").trim();
      if (entry?.include !== true || !text) continue;
      const key = placementLabel(effectivePlacement(entry.placement, text, months));
      groups.set(key, [...(groups.get(key) ?? []), text]);
    }
    const total = [...groups.values()].reduce((sum, lines) => sum + lines.length, 0);
    return { groups: [...groups.entries()], total };
  }, [selections, months]);

  const flagEntries = useMemo(() => {
    const conservative: { key: string; text: string }[] = [];
    const crystal: { key: string; text: string }[] = [];
    for (const flag of insights?.flags ?? []) {
      conservative.push({ key: flag.id, text: flag.factText });
      const note = insights?.experimental?.flagNotes?.[flag.id];
      if (note) crystal.push({ key: experimentalKey(flag.id), text: note });
    }
    return { conservative, crystal };
  }, [insights]);

  const suggestionEntries = useMemo(() => {
    const conservative: { key: string; text: string }[] = [];
    const crystal: { key: string; text: string }[] = [];
    for (const row of suggestionRows) {
      if (row.text.trim()) conservative.push({ key: row.field, text: row.text });
      if (row.crystal.trim()) crystal.push({ key: experimentalKey(row.field), text: row.crystal });
    }
    return { conservative, crystal };
  }, [suggestionRows]);

  const bulkButtons = (entries: { conservative: { key: string; text: string }[]; crystal: { key: string; text: string }[] }) => (
    <>
      {entries.conservative.length > 0 && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          onClick={() => bulkToggle(entries.conservative, true)}
        >
          Tick all conservative
        </Button>
      )}
      {entries.crystal.length > 0 && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          onClick={() => bulkToggle(entries.crystal, true)}
        >
          Tick all Crystal Ball
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-[11px]"
        onClick={() => bulkToggle([...entries.conservative, ...entries.crystal], false)}
      >
        Clear
      </Button>
    </>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
          <div className="space-y-1">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              TOBI insights
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {insights?.generatedAt
                ? `Last generated ${new Date(insights.generatedAt).toLocaleString("en-ZA")}`
                : "Written commentary and anomaly flags for this outlook."}
            </p>
            {insights?.generatedAt && (
              <p className="text-xs text-muted-foreground">
                {insights.slidesConsidered.count > 0
                  ? `Read ${insights.slidesConsidered.count} pasted slide${
                      insights.slidesConsidered.count === 1 ? "" : "s"
                    }${
                      insights.slidesConsidered.titles.length > 0
                        ? `: ${insights.slidesConsidered.titles.join(", ")}`
                        : ""
                    }`
                  : "No pasted slides were read — regenerate after adding screenshots."}
              </p>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => void handleGenerate()} disabled={isGenerating}>
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {insights ? "Regenerate" : "Generate"}
          </Button>
        </CardHeader>

        <CardContent className="space-y-5">
          {error && (
            <p className="text-sm text-destructive flex items-start gap-2">
              <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          {isLoading && !insights && (
            <p className="text-sm text-muted-foreground">Loading saved insights…</p>
          )}

          {!isLoading && !insights && !error && (
            <p className="text-sm text-muted-foreground">
              No insights yet for this run. Generate them once the figures look right — every number
              quoted comes straight from the aggregated results above.
            </p>
          )}

          {/* Selection summary: what prints, and where. */}
          {insights && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {placementSummary.total === 0
                  ? "No comments ticked yet — nothing extra will print."
                  : `${placementSummary.total} comment${placementSummary.total === 1 ? "" : "s"} will print across ${placementSummary.groups.length} destination${placementSummary.groups.length === 1 ? "" : "s"}.`}
              </p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                    <ListTree className="h-3.5 w-3.5 mr-1.5" />
                    Preview placement
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 max-h-96 overflow-auto space-y-3">
                  {placementSummary.groups.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Tick a comment below and its destination shows up here.
                    </p>
                  ) : (
                    placementSummary.groups.map(([destination, lines]) => (
                      <div key={destination} className="space-y-1">
                        <p className="text-xs font-medium">{destination}</p>
                        <ul className="space-y-1 pl-3">
                          {lines.map((line, index) => (
                            <li key={index} className="text-xs text-muted-foreground list-disc">
                              {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  )}
                </PopoverContent>
              </Popover>
            </div>
          )}

          {narrativeText.trim().length > 0 && (
            <div className="space-y-3">
              <SectionHeading title="Review" />
              <div className="space-y-3 rounded-lg border border-border p-3">
                <label className="flex items-start gap-2">
                  <Checkbox
                    checked={insights?.includeNarrative !== false}
                    onCheckedChange={(checked) =>
                      saveReview.mutate({ includeNarrative: checked === true })
                    }
                    className="mt-0.5"
                  />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Include this review in the report
                  </span>
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Prints as the written review ahead of the commentary cards.
                </p>

                {editingNarrative ? (
                  <div className="space-y-2">
                    <Textarea
                      value={narrativeDraft}
                      onChange={(event) => setNarrativeDraft(event.target.value)}
                      rows={Math.min(20, Math.max(6, narrativeDraft.split("\n").length + 1))}
                      className="text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 px-3 text-xs"
                        disabled={saveReview.isPending}
                        onClick={() => {
                          saveReview.mutate({ narrativeFinal: narrativeDraft });
                          setEditingNarrative(false);
                          toast.success("Review saved");
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-3 text-xs"
                        onClick={() => {
                          setNarrativeDraft(narrativeText);
                          setEditingNarrative(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {paragraphs.map((text, index) => (
                        <p key={index} className="text-sm leading-relaxed text-foreground whitespace-pre-line">
                          {text}
                        </p>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setEditingNarrative(true)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        Edit wording
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => void copy(narrativeText)}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copy
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {insights?.experimental?.headline && (
            <>
              <Separator />
              <p className="text-sm flex items-start gap-2">
                <Orbit className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="font-medium">{CRYSTAL_BALL_LABEL} — opening read: </span>
                  <span className="text-muted-foreground">{insights.experimental.headline}</span>
                </span>
              </p>
            </>
          )}

          {insights?.generatedAt && insights.experimental?.error && (
            <p className="text-xs text-muted-foreground">
              {CRYSTAL_BALL_LABEL} unavailable for this generation — {insights.experimental.error}
            </p>
          )}

          {(insights?.flags?.length ?? 0) > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <SectionHeading title="Flags" actions={bulkButtons(flagEntries)} />
                <ul className="space-y-4">
                  {insights!.flags.map((flag) => {
                    const crystalText = insights!.experimental.flagNotes[flag.id];
                    const expKey = experimentalKey(flag.id);
                    return (
                      <li key={flag.id} className="flex gap-3">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_STYLES[flag.severity]?.dot ?? "bg-muted-foreground"}`}
                          aria-hidden
                        />
                        <div className="flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-[10px] font-normal">
                              {monthLabel(flag.month)}
                            </Badge>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {SEVERITY_STYLES[flag.severity]?.label}
                            </span>
                          </div>

                          <div className="grid gap-2 lg:grid-cols-2">
                            <ReplyBlock
                              index={1}
                              tone="conservative"
                              text={selections[flag.id]?.text?.trim() || flag.factText}
                              note={flag.note ?? null}
                              editable
                              months={months}
                              placement={selections[flag.id]?.placement}
                              edited={selections[flag.id]?.edited === true}
                              onRevert={() => revertSelection(flag.id)}
                              checked={selections[flag.id]?.include === true}
                              onToggle={(next) => toggleSelection(flag.id, flag.factText, next)}
                              onEdit={(value) =>
                                editSelection(flag.id, value, selections[flag.id]?.include === true)
                              }
                              onPlacement={(next) => setPlacement(flag.id, flag.factText, next)}
                              onCopy={copy}
                            />

                            {crystalText ? (
                              <ReplyBlock
                                index={2}
                                tone="crystal"
                                text={selections[expKey]?.text?.trim() || crystalText}
                                note={null}
                                editable
                                months={months}
                                placement={selections[expKey]?.placement}
                                edited={selections[expKey]?.edited === true}
                                onRevert={() => revertSelection(expKey)}
                                checked={selections[expKey]?.include === true}
                                onToggle={(next) => toggleSelection(expKey, crystalText, next)}
                                onEdit={(value) =>
                                  editSelection(expKey, value, selections[expKey]?.include === true)
                                }
                                onPlacement={(next) => setPlacement(expKey, crystalText, next)}
                                onCopy={copy}
                              />
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}

          {suggestionRows.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <SectionHeading title="Suggested commentary" actions={bulkButtons(suggestionEntries)} />
                {suggestionRows.map(({ field, text, crystal }) => {
                  const expKey = experimentalKey(field);
                  return (
                    <div key={field} className="rounded-lg border border-border p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{FIELD_LABELS[field]}</span>
                        {text.trim().length > 0 && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 px-2 text-xs"
                            disabled={acceptSuggestion.isPending}
                            onClick={() => void handleAccept(field, selections[field]?.text ?? text)}
                          >
                            {accepted[field] ? <Check className="h-3.5 w-3.5 mr-1.5" /> : null}
                            {accepted[field] ? "Saved" : `Accept into ${FIELD_LABELS[field].toLowerCase()} notes`}
                          </Button>
                        )}
                      </div>

                      <div className="grid gap-2 lg:grid-cols-2">
                        {text.trim().length > 0 && (
                          <ReplyBlock
                            index={1}
                            tone="conservative"
                            text={selections[field]?.text?.trim() || text}
                            note={null}
                            editable
                            months={months}
                            placement={selections[field]?.placement}
                            edited={selections[field]?.edited === true}
                            onRevert={() => revertSelection(field)}
                            checked={selections[field]?.include === true}
                            onToggle={(next) => toggleSelection(field, text, next)}
                            onEdit={(value) =>
                              editSelection(field, value, selections[field]?.include === true)
                            }
                            onPlacement={(next) => setPlacement(field, text, next)}
                            onCopy={copy}
                          />
                        )}

                        {crystal.trim().length > 0 && (
                          <ReplyBlock
                            index={2}
                            tone="crystal"
                            text={selections[expKey]?.text?.trim() || crystal}
                            note={null}
                            editable
                            months={months}
                            placement={selections[expKey]?.placement}
                            edited={selections[expKey]?.edited === true}
                            onRevert={() => revertSelection(expKey)}
                            checked={selections[expKey]?.include === true}
                            onToggle={(next) => toggleSelection(expKey, crystal, next)}
                            onEdit={(value) =>
                              editSelection(expKey, value, selections[expKey]?.include === true)
                            }
                            onPlacement={(next) => setPlacement(expKey, crystal, next)}
                            onCopy={copy}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {insights?.chartRecommendation && (
            <>
              <Separator />
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Chart to lead with: </span>
                {insights.chartRecommendation}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
