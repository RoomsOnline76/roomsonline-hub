import { useCallback, useState } from "react";
import { ChevronDown, FileText, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { useReportPage2 } from "@/hooks/useReportPage2";
import { page2HasContent, type Page2Document } from "@/lib/reports/page2";
import { Page2Editor } from "./Page2Editor";

interface Page2CardProps {
  runId: string;
  propertyId: string;
}

/**
 * Opt-in card for Page 2 — TOBI's Assessment. Turning it on prints the page
 * straight after the cover and becomes the property's default for later runs.
 */
export function Page2Card({ runId, propertyId }: Page2CardProps) {
  const {
    enabled,
    doc,
    isLoading,
    isGenerating,
    isSaving,
    setEnabled,
    saveDoc,
    generate,
  } = useReportPage2(runId, propertyId);
  const [open, setOpen] = useState(false);

  const hasContent = page2HasContent(doc);

  const handleToggle = useCallback(
    async (value: boolean) => {
      try {
        await setEnabled(value);
        if (value) {
          setOpen(true);
          toast.success("Page 2 will print after the cover — kept on for this property");
          if (!page2HasContent(doc)) {
            const result = await generate();
            if (!result.ok) toast.error(result.error ?? "TOBI could not write the assessment.");
            else toast.success("TOBI's assessment is ready");
          }
        } else {
          toast.success("Page 2 removed from this report");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not change the setting");
      }
    },
    [setEnabled, generate, doc],
  );

  const handleRegenerate = useCallback(async () => {
    const result = await generate({ force: true });
    if (!result.ok) toast.error(result.error ?? "TOBI could not write the assessment.");
    else toast.success("Assessment rewritten");
  }, [generate]);

  const handleSave = useCallback(
    async (next: Page2Document) => {
      try {
        await saveDoc(next);
        toast.success("Assessment saved");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save the assessment");
      }
    },
    [saveDoc],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <FileText className="h-4 w-4 text-primary" />
              Page 2 — TOBI's Assessment
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              An owner-facing read printed straight after the cover: the headline, a short
              primer, then what is going well, what needs attention and any red flags.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {enabled ? (
              <Badge variant="secondary" className="text-[10px]">
                {hasContent ? (doc.edited ? "edited" : "ready") : "empty"}
              </Badge>
            ) : null}
            <Switch
              checked={enabled}
              disabled={isLoading || isSaving || isGenerating}
              onCheckedChange={handleToggle}
              aria-label="Print Page 2 — TOBI's Assessment"
            />
          </div>
        </div>
      </CardHeader>

      {enabled ? (
        <CardContent className="space-y-3 pt-0">
          {doc.error ? (
            <p className="text-xs text-destructive">{doc.error}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={hasContent ? "outline" : "default"}
              size="sm"
              disabled={isGenerating}
              onClick={hasContent ? handleRegenerate : () => handleToggle(true)}
            >
              {isGenerating ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : hasContent ? (
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
              ) : (
                <Sparkles className="mr-2 h-3.5 w-3.5" />
              )}
              {hasContent ? "Rewrite with TOBI" : "Ask TOBI to write it"}
            </Button>
            {doc.generatedAt ? (
              <span className="text-xs text-muted-foreground">
                Written {new Date(doc.generatedAt).toLocaleString("en-ZA")}
              </span>
            ) : null}
          </div>

          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="px-2">
                <ChevronDown
                  className={`mr-2 h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                />
                {open ? "Hide the page" : "Review and edit the page"}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <Page2Editor doc={doc} disabled={isGenerating} onSave={handleSave} />
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      ) : null}
    </Card>
  );
}
