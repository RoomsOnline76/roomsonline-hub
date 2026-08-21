import { useCallback, useMemo, useState } from "react";
import { Check, Copy, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  useReportInsights,
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
}

/** TOBI's written read on the run: narrative, flags and suggested commentary. */
export function AiInsightsPanel({ runId }: Props) {
  const { insights, isLoading, generate, isGenerating, acceptSuggestion } =
    useReportInsights(runId);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

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
        .map((field) => ({ field, text: insights?.suggestions?.[field] ?? "" }))
        .filter((row) => row.text.trim().length > 0),
    [insights],
  );

  const paragraphs = useMemo(
    () =>
      (insights?.narrative ?? "")
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

        {paragraphs.length > 0 && (
          <div className="space-y-3">
            {paragraphs.map((text, index) => (
              <p key={index} className="text-sm leading-relaxed text-foreground">
                {text}
              </p>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => void copy(paragraphs.join("\n\n"))}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy narrative
            </Button>
          </div>
        )}

        {(insights?.flags?.length ?? 0) > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Flags
              </h4>
              <ul className="space-y-3">
                {insights!.flags.map((flag) => (
                  <li key={flag.id} className="flex gap-3">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_STYLES[flag.severity]?.dot ?? "bg-muted-foreground"}`}
                      aria-hidden
                    />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {monthLabel(flag.month)}
                        </Badge>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {SEVERITY_STYLES[flag.severity]?.label}
                        </span>
                      </div>
                      <p className="text-sm text-foreground">{flag.factText}</p>
                      {flag.note && (
                        <p className="text-sm text-muted-foreground">{flag.note}</p>
                      )}
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
              {suggestionRows.map(({ field, text }) => (
                <div key={field} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{FIELD_LABELS[field]}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => void copy(text)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-xs"
                        disabled={acceptSuggestion.isPending}
                        onClick={() => void handleAccept(field, text)}
                      >
                        {accepted[field] ? (
                          <Check className="h-3.5 w-3.5 mr-1.5" />
                        ) : null}
                        {accepted[field] ? "Saved" : "Accept"}
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
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
