import { useCallback } from "react";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSpecialReports } from "@/hooks/useSpecialReports";

interface SpecialReportsCardProps {
  runId: string;
}

/**
 * CheetaPlains owner-pack extras: the nationality and booking-partner slides.
 * Only rendered for properties flagged with that report set.
 */
export function SpecialReportsCard({ runId }: SpecialReportsCardProps) {
  const { reports, generate, isGenerating, open } = useSpecialReports(runId);

  const handleGenerate = useCallback(async () => {
    const result = await generate();
    if (result.ok) {
      toast.success(`${result.count ?? 0} slide(s) generated`);
    } else {
      toast.error("Could not build the specialised slides", { description: result.message });
    }
  }, [generate]);

  const handleOpen = useCallback(
    async (path: string) => {
      const url = await open(path);
      if (!url) {
        toast.error("Could not create a view link");
        return;
      }
      window.open(url, "_blank", "noopener");
    },
    [open],
  );

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base font-medium">Specialised owner slides</CardTitle>
        <Button size="sm" variant="outline" onClick={() => void handleGenerate()} disabled={isGenerating}>
          {isGenerating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {reports.length ? "Rebuild" : "Build slides"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Upload the Bookings by Nationality workbook and the reservation-list export, then
            build the nationality and travel-partner slides.
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
                <Button size="sm" variant="ghost" onClick={() => void handleOpen(report.storagePath)}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
