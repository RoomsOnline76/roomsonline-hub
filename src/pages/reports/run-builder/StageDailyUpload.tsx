import { useEffect, useState } from "react";
import { CalendarDays, ClipboardPaste, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileDropZone } from "@/components/reports/FileDropZone";
import { SourceFileList } from "@/components/reports/SourceFileList";
import type { RunBuilderContext } from "./types";

/** Daily stage A — the day's date, its source files and the day's email text. */
export function StageDailyUpload({ ctx }: { ctx: RunBuilderContext }) {
  const [asOf, setAsOf] = useState(ctx.run.asOfDate.slice(0, 10));
  const [savingDate, setSavingDate] = useState(false);
  const [emailText, setEmailText] = useState(ctx.dailyEmailText);
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => {
    setAsOf(ctx.run.asOfDate.slice(0, 10));
  }, [ctx.run.asOfDate]);

  useEffect(() => {
    setEmailText(ctx.dailyEmailText);
  }, [ctx.dailyEmailText]);

  const dateDirty = asOf !== ctx.run.asOfDate.slice(0, 10);
  const emailDirty = emailText !== ctx.dailyEmailText;

  const saveEmail = async (value: string) => {
    setSavingEmail(true);
    try {
      const outcome = await ctx.onSaveDailyEmailText(value);
      if (outcome.ok) toast.success(value.trim() ? "Email text saved" : "Email text cleared");
      else toast.error("Could not save the email text", { description: outcome.message });
    } finally {
      setSavingEmail(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <CalendarDays className="h-4 w-4" />
            Report day
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The day this pack covers. It must appear in the villa-state exports you upload.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="daily-date">Date</Label>
              <Input
                id="daily-date"
                type="date"
                value={asOf}
                disabled={!ctx.editable}
                onChange={(event) => setAsOf(event.target.value)}
                className="w-44"
              />
            </div>
            {dateDirty && (
              <Button
                size="sm"
                disabled={savingDate}
                onClick={async () => {
                  setSavingDate(true);
                  try {
                    await ctx.onSetAsOfDate(asOf);
                  } finally {
                    setSavingDate(false);
                  }
                }}
              >
                {savingDate && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save date
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Upload className="h-4 w-4" />
            The day's files
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Drop the villa-state exports, the provisional bookings export and the created /
            cancelled reservation prints for the day. Spreadsheets and PDFs are both accepted.
          </p>
          <FileDropZone
            files={ctx.pending}
            states={ctx.fileStates}
            disabled={!ctx.editable || ctx.uploadBusy}
            acceptedExtensions={[...ctx.adapter.acceptedFileTypes, ".pdf"]}
            onFilesAdded={ctx.addPending}
            onRemove={ctx.removePending}
          />

          {ctx.pending.length > 0 && (
            <Button onClick={ctx.onUpload} disabled={ctx.uploadBusy}>
              {ctx.uploadBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Upload {ctx.pending.length} file(s)
            </Button>
          )}
          <SourceFileList
            files={ctx.run.files}
            editable={ctx.editable}
            reparsingId={ctx.reparsingId}
            onDownload={ctx.onDownload}
            onReparse={ctx.onReparse}
            onRemove={ctx.onRemoveFile}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <ClipboardPaste className="h-4 w-4" />
            Paste from the email
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Paste the day's email here. Figures it mentions fill anything the exports did not
            carry, and the text prints on the report under “From the day's email”.
          </p>
          <Textarea
            value={emailText}
            disabled={!ctx.editable || savingEmail}
            onChange={(event) => setEmailText(event.target.value)}
            placeholder="Paste the text of the day's email…"
            className="min-h-[160px] font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!emailDirty || savingEmail} onClick={() => void saveEmail(emailText)}>
              {savingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save text
            </Button>
            {emailText.trim() && (
              <Button
                size="sm"
                variant="ghost"
                disabled={savingEmail}
                onClick={() => {
                  setEmailText("");
                  void saveEmail("");
                }}
              >
                Clear
              </Button>
            )}
            {!emailDirty && ctx.dailyEmailText.trim() && (
              <span className="text-xs text-muted-foreground">Saved on this run.</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
