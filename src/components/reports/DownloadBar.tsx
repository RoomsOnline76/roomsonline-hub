import { useCallback } from "react";
import { FileArchive, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

interface Props {
  hasSnapshot: boolean;
  isExcelBusy: boolean;
  isDraftBusy: boolean;
  isPackBusy: boolean;
  onExcel: () => Promise<{ ok: boolean; message?: string; url?: string }>;
  onDraft: () => Promise<{ ok: boolean; message?: string; url?: string }>;
  onPack: () => Promise<{ ok: boolean; message?: string; url?: string }>;
}

/** Excel / draft report / Canva pack downloads for a processed run. */
export function DownloadBar({
  hasSnapshot,
  isExcelBusy,
  isDraftBusy,
  isPackBusy,
  onExcel,
  onDraft,
  onPack,
}: Props) {
  const run = useCallback(
    async (
      action: () => Promise<{ ok: boolean; message?: string; url?: string }>,
      successLabel: string,
      failureLabel: string,
      download: boolean,
    ) => {
      const result = await action();
      if (!result.ok || !result.url) {
        toast.error(failureLabel, { description: result.message });
        return;
      }
      if (download) await downloadFile(result.url);
      toast.success(successLabel);
    },
    [],
  );

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
        <div className="space-y-1">
          <p className="text-sm font-medium">Downloads</p>
          <p className="text-sm text-muted-foreground">
            {hasSnapshot
              ? "Editable workbook, branded draft report and the designer asset pack."
              : "Process the run first — downloads need an aggregated snapshot."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={!hasSnapshot || isExcelBusy}
            onClick={() =>
              void run(onExcel, "Consolidated workbook ready", "Could not build the workbook", true)
            }
          >
            {isExcelBusy ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
            Excel
          </Button>
          <Button
            variant="outline"
            disabled={!hasSnapshot || isDraftBusy}
            onClick={() =>
              void run(onDraft, "Draft report rebuilt", "Could not build the draft report", false)
            }
          >
            {isDraftBusy ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            Draft report
          </Button>
          <Button
            variant="outline"
            disabled={!hasSnapshot || isPackBusy}
            onClick={() =>
              void run(onPack, "Canva pack ready", "Could not build the Canva pack", true)
            }
          >
            {isPackBusy ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileArchive className="h-4 w-4 mr-2" />
            )}
            Canva pack
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
