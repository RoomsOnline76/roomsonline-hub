import { useCallback } from "react";
import { Link } from "react-router-dom";
import { Download, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSpecialReports } from "@/hooks/useSpecialReports";
import { reportsPath } from "@/lib/config";

interface SpecialReportsCardProps {
  runId: string;
}

/**
 * This property's own report pack — the pages the owner receives in addition to
 * the regular report. It is built from the run's own figures whenever the run is
 * processed; the button here rebuilds it after new files or edits.
 */
export function SpecialReportsCard({ runId }: SpecialReportsCardProps) {
  const { reports, generate, isGenerating, downloadPack, downloadOne, isDownloading } =
    useSpecialReports(runId);

  const handleGenerate = useCallback(async () => {
    const result = await generate();
    if (result.ok) {
      toast.success(`${result.count ?? 0} page(s) built`);
    } else {
      toast.error("Could not build the owner pack", { description: result.message });
    }
  }, [generate]);

  const handleDownloadPack = useCallback(async () => {
    const result = await downloadPack("Owner pack");
    if (!result.ok) toast.error("Could not save the owner pack", { description: result.message });
  }, [downloadPack]);

  return (
    <Card>
      <CardHeader className="pb-3 space-y-1">
        <CardTitle className="text-base font-medium">Owner pack</CardTitle>
        <p className="text-xs text-muted-foreground">
          Built from this run and sent with the regular report. The written pages are a first
          draft — read them before the pack goes out.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void handleGenerate()} disabled={isGenerating}>
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {reports.length ? "Rebuild pack" : "Build pack"}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleDownloadPack()}
            disabled={reports.length === 0 || isDownloading}
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Download pack
          </Button>
        </div>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Process the run to build the pack. Add the provisional-bookings export for the active
            enquiries column, and the nationality and reservation-list exports for those pages.
          </p>
        ) : (
          reports.map((report) => (
            <div
              key={report.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2.5"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium">{report.title}</p>
                <p className="text-xs text-muted-foreground">
                  {report.rowCount} row(s)
                  {report.currentLabel ? ` · ${report.currentLabel}` : ""}
                  {report.priorLabel ? ` vs ${report.priorLabel}` : ""}
                </p>
                {report.warnings.slice(0, 2).map((warning) => (
                  <p key={warning} className="text-xs text-muted-foreground">
                    {warning}
                  </p>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {report.warnings.length > 0 && (
                  <Badge variant="outline" className="font-normal text-[11px]">
                    {report.warnings.length} note(s)
                  </Badge>
                )}
                <Button size="sm" variant="ghost" asChild>
                  <Link
                    to={reportsPath(`/runs/${runId}/draft?slide=${report.id}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void downloadOne(report)}
                  aria-label={`Save ${report.title}`}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
