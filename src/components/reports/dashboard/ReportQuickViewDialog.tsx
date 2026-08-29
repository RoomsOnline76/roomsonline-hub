import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, Printer, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { printFrameWithTitle } from "@/lib/reportDraftHtml";
import { loadRunReport, ReportNotBuiltError } from "@/lib/reports/reportHtmlSource";
import { reportsPath } from "@/lib/config";

interface QuickViewTarget {
  runId: string;
  propertyName: string;
  label: string;
}

/**
 * Quickview — the finished report, full, without leaving the dashboard.
 * Prints under the report's own document title so "Save as PDF" proposes the
 * branded filename, exactly like the full-page viewer.
 */
export function ReportQuickViewDialog({
  target,
  onClose,
}: {
  target: QuickViewTarget | null;
  onClose: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [documentTitle, setDocumentTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notBuilt, setNotBuilt] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setError(null);
    setNotBuilt(false);
    setDocumentTitle(null);
    if (!target) return;

    void (async () => {
      try {
        const loaded = await loadRunReport({ runId: target.runId });
        if (cancelled) {
          URL.revokeObjectURL(loaded.url);
          return;
        }
        objectUrl = loaded.url;
        setUrl(loaded.url);
        setDocumentTitle(loaded.documentTitle);
      } catch (caught) {
        if (cancelled) return;
        if (caught instanceof ReportNotBuiltError) setNotBuilt(true);
        else setError(caught instanceof Error ? caught.message : "Could not open the report.");
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [target]);

  const handlePrint = useCallback(() => {
    printFrameWithTitle(frameRef.current, documentTitle);
  }, [documentTitle]);

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[min(1200px,96vw)] h-[92vh] flex flex-col gap-3 p-4 sm:p-6">
        <DialogHeader className="space-y-1 pr-10">
          <DialogTitle className="text-base font-medium truncate">
            {documentTitle ?? target?.propertyName ?? "Report"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground truncate">{target?.label}</p>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={handlePrint} disabled={!url}>
            <Printer className="h-4 w-4 mr-2" />
            Save as PDF
          </Button>
          {target && (
            <Button variant="outline" size="sm" asChild>
              <Link to={reportsPath(`/runs/${target.runId}/draft`)} onClick={onClose}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in full page
              </Link>
            </Button>
          )}
          {target && (
            <Button variant="ghost" size="sm" asChild>
              <Link to={reportsPath(`/runs/${target.runId}`)} onClick={onClose}>
                <Wrench className="h-4 w-4 mr-2" />
                Open run builder
              </Link>
            </Button>
          )}
        </div>

        {notBuilt && target && (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground space-y-2">
            <p>This run has no generated report yet.</p>
            <Button variant="outline" size="sm" asChild>
              <Link to={reportsPath(`/runs/${target.runId}`)} onClick={onClose}>
                Go to the build stage
              </Link>
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!url && !error && !notBuilt && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading report…
          </div>
        )}

        {url && (
          <iframe
            ref={frameRef}
            src={url}
            title={documentTitle ?? "Report preview"}
            className="flex-1 w-full min-h-0 rounded border bg-muted"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export type { QuickViewTarget };
export default ReportQuickViewDialog;
