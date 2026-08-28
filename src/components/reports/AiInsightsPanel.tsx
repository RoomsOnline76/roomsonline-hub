import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, Pencil, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  experimentalKey,
  useReportInsights,
  type InsightSelection,
  type InsightSeverity,
  type SuggestionField,
} from "@/hooks/useReportInsights";

/** One labelled opinion inside a flag or commentary topic. */
interface ReplyBlockProps {
  index: 1 | 2;
  tone: "conservative" | "experimental";
  text: string;
  note: string | null;
  editable?: boolean;
  /** True when the shown text is the reviewer's own wording. */
  edited?: boolean;
  checked: boolean;
  onToggle: (next: boolean) => void;
  onEdit: (value: string) => void;
  onRevert?: () => void;
  onCopy: (text: string) => void | Promise<void>;
}

function ReplyBlock({
  index,
  tone,
  text,
  note,
  editable = false,
  edited = false,
  checked,
  onToggle,
  onEdit,
  onRevert,
  onCopy,
}: ReplyBlockProps) {
  const label = tone === "conservative" ? "Conservative" : "Experimental";
  return (
    <div
      className={`rounded-md border p-2.5 space-y-2 ${
        tone === "experimental" ? "border-primary/40 bg-muted" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-start gap-2">
          <Checkbox checked={checked} onCheckedChange={(next) => onToggle(next === true)} className="mt-0.5" />
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {index}. {label}
          </span>
        </label>
        <div className="flex items-center gap-1">
        {edited && (
          <Badge variant="outline" className="text-[10px] font-normal">
            Edited
          </Badge>
        )}
        {edited && onRevert && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={onRevert}
            aria-label={`Revert ${label.toLowerCase()} reply to TOBI's wording`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => void onCopy(text)}
          aria-label={`Copy ${label.toLowerCase()} reply`}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        </div>
      </div>
      {editable ? (
        <Textarea
          key={text}
          defaultValue={text}
          rows={3}
          className="text-sm"
          onBlur={(event) => {
            if (event.target.value === text) return;
            onEdit(event.target.value);
          }}
        />
      ) : (
        <p className="text-sm text-foreground whitespace-pre-line">{text}</p>
      )}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

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
}

/** TOBI's written read on the run: narrative, flags and suggested commentary. */
export function AiInsightsPanel({ runId }: Props) {
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

  const toggleSelection = useCallback(
    (key: string, fallbackText: string, include: boolean) => {
      const next: Record<string, InsightSelection> = {
        ...selections,
        [key]: {
          include,
          text: selections[key]?.text ?? fallbackText,
          edited: selections[key]?.edited === true,
        },
      };
      saveReview.mutate({ selections: next });
    },
    [selections, saveReview],
  );

  const editSelection = useCallback(
    (key: string, text: string, include: boolean) => {
      const next: Record<string, InsightSelection> = {
        ...selections,
        [key]: { include, text, edited: true },
      };
      saveReview.mutate({ selections: next });
      toast.success("Wording saved — it will be reused on the next generation");
    },
    [selections, saveReview],
  );

  /** Drops the reviewer's wording so TOBI's own text shows again. */
  const revertSelection = useCallback(
    (key: string) => {
      const next = { ...selections } as Record<string, InsightSelection>;
      const include = next[key]?.include === true;
      delete next[key];
      if (include) next[key] = { include: true, text: "" };
      saveReview.mutate({ selections: next });
    },
    [selections, saveReview],
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
          experimental: insights?.experimental?.suggestions?.[field] ?? "",
        }))
        .filter((row) => row.text.trim().length > 0 || row.experimental.trim().length > 0),
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

  return (
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

        {narrativeText.trim().length > 0 && (
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
        )}

        {insights?.experimental?.headline && (
          <>
            <Separator />
            <p className="text-sm">
              <span className="font-medium">Consultant's first point: </span>
              <span className="text-muted-foreground">{insights.experimental.headline}</span>
            </p>
          </>
        )}

        {insights?.generatedAt && insights.experimental?.error && (
          <p className="text-xs text-muted-foreground">
            Second opinion unavailable for this generation — {insights.experimental.error}
          </p>
        )}

        {(insights?.flags?.length ?? 0) > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Flags
              </h4>
              <ul className="space-y-4">
                {insights!.flags.map((flag) => (
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

                      <ReplyBlock
                        index={1}
                        tone="conservative"
                        text={selections[flag.id]?.text?.trim() || flag.factText}
                        note={flag.note ?? null}
                        editable
                        edited={selections[flag.id]?.edited === true}
                        onRevert={() => revertSelection(flag.id)}
                        checked={selections[flag.id]?.include === true}
                        onToggle={(next) => toggleSelection(flag.id, flag.factText, next)}
                        onEdit={(value) =>
                          editSelection(flag.id, value, selections[flag.id]?.include === true)
                        }
                        onCopy={copy}
                      />

                      {insights!.experimental.flagNotes[flag.id] ? (
                        <ReplyBlock
                          index={2}
                          tone="experimental"
                          text={
                            selections[experimentalKey(flag.id)]?.text?.trim() ||
                            insights!.experimental.flagNotes[flag.id]
                          }
                          note={null}
                          editable
                          edited={selections[experimentalKey(flag.id)]?.edited === true}
                          onRevert={() => revertSelection(experimentalKey(flag.id))}
                          checked={selections[experimentalKey(flag.id)]?.include === true}
                          onToggle={(next) =>
                            toggleSelection(
                              experimentalKey(flag.id),
                              insights!.experimental.flagNotes[flag.id],
                              next,
                            )
                          }
                          onEdit={(value) =>
                            editSelection(
                              experimentalKey(flag.id),
                              value,
                              selections[experimentalKey(flag.id)]?.include === true,
                            )
                          }
                          onCopy={copy}
                        />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {suggestionRows.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Suggested commentary
              </h4>
              {suggestionRows.map(({ field, text, experimental }) => (
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
                        {accepted[field] ? "Saved" : "Accept"}
                      </Button>
                    )}
                  </div>

                  {text.trim().length > 0 && (
                    <ReplyBlock
                      index={1}
                      tone="conservative"
                      text={selections[field]?.text?.trim() || text}
                      note={null}
                      editable
                      edited={selections[field]?.edited === true}
                      onRevert={() => revertSelection(field)}
                      checked={selections[field]?.include === true}
                      onToggle={(next) => toggleSelection(field, text, next)}
                      onEdit={(value) =>
                        editSelection(field, value, selections[field]?.include === true)
                      }
                      onCopy={copy}
                    />
                  )}

                  {experimental.trim().length > 0 && (
                    <ReplyBlock
                      index={2}
                      tone="experimental"
                      text={selections[experimentalKey(field)]?.text?.trim() || experimental}
                      note={null}
                      editable
                      edited={selections[experimentalKey(field)]?.edited === true}
                      onRevert={() => revertSelection(experimentalKey(field))}
                      checked={selections[experimentalKey(field)]?.include === true}
                      onToggle={(next) =>
                        toggleSelection(experimentalKey(field), experimental, next)
                      }
                      onEdit={(value) =>
                        editSelection(
                          experimentalKey(field),
                          value,
                          selections[experimentalKey(field)]?.include === true,
                        )
                      }
                      onCopy={copy}
                    />
                  )}
                </div>
              ))}
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
  );
}
