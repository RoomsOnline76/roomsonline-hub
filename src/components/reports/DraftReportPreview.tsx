import { useCallback, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Printer, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  url: string | null;
  isGenerating: boolean;
  onGenerate: () => void;
  pageCount?: number;
}

/**
 * Embedded A4 preview of the generated draft report. Printing the iframe keeps the
 * report's own @page rules, which is what produces a clean PDF.
 */
export function DraftReportPreview({ url, isGenerating, onGenerate, pageCount = 5 }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [activePage, setActivePage] = useState(1);

  const pages = useMemo(
    () => Array.from({ length: Math.max(1, pageCount) }, (_, index) => index + 1),
    [pageCount],
  );

  const handlePrint = useCallback(() => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  }, []);

  const handleJump = useCallback((page: number) => {
    setActivePage(page);
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    const target = doc?.querySelectorAll<HTMLElement>("section.page")[page - 1];
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base font-medium">Draft visual report</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            {url ? "Rebuild" : "Build draft"}
          </Button>
          {url && (
            <>
              <Button variant="outline" size="sm" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open
                </a>
              </Button>
              <Button size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Save as PDF
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!url && (
          <p className="text-sm text-muted-foreground py-6">
            Build the draft to preview the branded report — cover, revenue performance,
            revenue review, traveller trends and process notes.
          </p>
        )}
        {url && (
          <div className="flex gap-4">
            <div className="hidden md:flex flex-col gap-2 shrink-0">
              {pages.map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => handleJump(page)}
                  className={cn(
                    "h-16 w-12 rounded border text-xs text-muted-foreground transition-colors",
                    activePage === page
                      ? "border-primary text-foreground bg-accent"
                      : "hover:bg-muted",
                  )}
                  aria-label={`Go to page ${page}`}
                >
                  {page}
                </button>
              ))}
            </div>
            <iframe
              ref={frameRef}
              src={url}
              title="Draft revenue report preview"
              className="w-full h-[720px] rounded border bg-muted"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
