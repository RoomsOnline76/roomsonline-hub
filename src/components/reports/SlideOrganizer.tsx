import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  RotateCcw,
} from "lucide-react";
import { useReportPageOrder } from "@/hooks/useReportPageOrder";
import type { ReportPageDefinition } from "@/lib/reportPages";

interface SlideOrganizerProps {
  runId: string;
  /** Media pages that will print: section pages plus per-image slides. */
  mediaPages: ReportPageDefinition[];
  /** Legacy section key -> per-image slide keys for orders saved earlier. */
  legacyExpansions?: Record<string, string[]>;
  /** Property the run belongs to, so the layout carries over between runs. */
  propertyId?: string;
}

/**
 * Manual page sequencing for the draft report: drag (or nudge) pages into the
 * order the revenue team wants, and hide the ones they don't need this round.
 */
export function SlideOrganizer({
  runId,
  mediaPages,
  legacyExpansions,
  propertyId,
}: SlideOrganizerProps) {
  const { pages, movePage, reorderTo, toggleHidden, reset, isSaving } = useReportPageOrder(
    runId,
    mediaPages,
    legacyExpansions,
    propertyId,
  );
  const [open, setOpen] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const visible = pages.filter((page) => !page.hidden).length;

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-medium">Slide organizer</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Drag pages into the order they should print. The cover always stays first.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{visible + 1} pages</Badge>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
              <span className="w-6 text-center text-xs font-medium text-muted-foreground">1</span>
              <div className="flex-1">
                <p className="text-sm font-medium">Cover</p>
                <p className="text-xs text-muted-foreground">Artwork, property, as-at date</p>
              </div>
              <Badge variant="outline" className="text-[10px]">
                locked
              </Badge>
            </div>

            <div className="space-y-2">
              {pages.map((page, index) => (
                <div
                  key={page.key}
                  draggable
                  onDragStart={() => setDragKey(page.key)}
                  onDragEnd={() => {
                    setDragKey(null);
                    setOverIndex(null);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setOverIndex(index);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragKey) reorderTo(dragKey, index);
                    setDragKey(null);
                    setOverIndex(null);
                  }}
                  className={`flex items-center gap-3 rounded-md border px-3 py-2 transition-colors ${
                    overIndex === index && dragKey && dragKey !== page.key
                      ? "border-primary bg-accent"
                      : "border-border"
                  } ${page.hidden ? "opacity-50" : ""}`}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                  <span className="w-5 text-center text-xs font-medium text-muted-foreground">
                    {page.hidden ? "—" : pages.filter((p, i) => !p.hidden && i <= index).length + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{page.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{page.summary}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={index === 0 || isSaving}
                      onClick={() => movePage(page.key, -1)}
                      aria-label={`Move ${page.title} up`}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={index === pages.length - 1 || isSaving}
                      onClick={() => movePage(page.key, 1)}
                      aria-label={`Move ${page.title} down`}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => toggleHidden(page.key)}
                      aria-label={page.hidden ? `Show ${page.title}` : `Hide ${page.title}`}
                    >
                      {page.hidden ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted-foreground">
                Pages with no data are skipped automatically.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={reset} disabled={isSaving}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Reset order
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
