import { useEffect, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, MoveHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  applyRestrictionSpan,
  formatSpanAttribution,
  moveRestrictionSpanToStart,
  removeRestrictionSpan,
  RESTRICTION_KIND_LABELS,
  type RestrictionSpan,
} from "@/lib/restrictionSpans";

interface RestrictionSpanEditorProps {
  span: RestrictionSpan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful save/move/remove so the caller can refresh + push to channels. */
  onChanged: (span: RestrictionSpan) => void | Promise<void>;
}

const VALUE_LABELS: Partial<Record<RestrictionSpan["kind"], string>> = {
  min_stay: "Minimum nights",
  max_stay: "Maximum nights",
  lead_advance: "Lead days advance",
  lead_post: "Lead days post",
};

export function RestrictionSpanEditor({ span, open, onOpenChange, onChanged }: RestrictionSpanEditorProps) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!span || !open) return;
    setStart(span.start);
    setEnd(span.end);
    setValue(span.value != null ? String(span.value) : "");
    setReason(span.reason || "");
  }, [span, open]);

  if (!span) return null;

  const valueLabel = VALUE_LABELS[span.kind];

  const finish = async (message: string) => {
    // Close and confirm straight away; the refresh + channel push continue behind the dialog.
    toast.success(message);
    onOpenChange(false);
    void onChanged(span);
  };

  const handleSave = async () => {
    if (!start || !end) { toast.error("Pick a start and end date"); return; }
    if (end < start) { toast.error("The end date must fall on or after the start date"); return; }
    if (valueLabel && (!value || Number(value) <= 0)) { toast.error(`Enter a ${valueLabel.toLowerCase()} value`); return; }
    setBusy(true);
    try {
      await applyRestrictionSpan(span, {
        start,
        end,
        value: valueLabel ? Number(value) : null,
        reason: reason.trim() || null,
      });
      await finish("Restriction updated");
    } catch (error: any) {
      console.error("Failed to update restriction span:", error);
      toast.error(error.message || "Could not update the restriction");
    } finally {
      setBusy(false);
    }
  };

  const shift = (days: number) => {
    setStart((s) => (s ? format(addDays(parseISO(s), days), "yyyy-MM-dd") : s));
    setEnd((e) => (e ? format(addDays(parseISO(e), days), "yyyy-MM-dd") : e));
  };

  const handleMove = async () => {
    if (!start) return;
    setBusy(true);
    try {
      await moveRestrictionSpanToStart(span, start);
      await finish("Restriction moved");
    } catch (error: any) {
      console.error("Failed to move restriction span:", error);
      toast.error(error.message || "Could not move the restriction");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      await removeRestrictionSpan(span);
      await finish(span.kind === "block" ? "Nights unblocked" : "Restriction removed");
    } catch (error: any) {
      console.error("Failed to remove restriction span:", error);
      toast.error(error.message || "Could not remove the restriction");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {RESTRICTION_KIND_LABELS[span.kind]}
            <Badge variant="outline">{span.target}</Badge>
          </DialogTitle>
          <DialogDescription>
            {span.propertyName ? `${span.propertyName} · ` : ""}
            {formatSpanAttribution(span)}
          </DialogDescription>
        </DialogHeader>

        {!span.editable ? (
          <p className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
            This restriction comes from {formatSpanAttribution(span)} and is owned by that system — editing it here
            would be overwritten on the next sync. Change it at the source instead.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="span-start">From</Label>
                <Input id="span-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="span-end">To</Label>
                <Input id="span-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Shift the whole span</Label>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => shift(-7)}>−1 week</Button>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => shift(-1)}>−1 day</Button>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => shift(1)}>+1 day</Button>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => shift(7)}>+1 week</Button>
                <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" disabled={busy} onClick={handleMove}>
                  <MoveHorizontal className="mr-1 h-3 w-3" />Move here
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                “Move here” keeps the length ({span.nights} night{span.nights === 1 ? "" : "s"}) and relocates it to the
                start date above.
              </p>
            </div>

            {valueLabel && (
              <div className="space-y-1.5">
                <Label htmlFor="span-value">{valueLabel}</Label>
                <Input id="span-value" type="number" min={1} value={value} onChange={(e) => setValue(e.target.value)} />
              </div>
            )}

            {span.kind === "block" && (
              <div className="space-y-1.5">
                <Label htmlFor="span-reason">Reason</Label>
                <Input
                  id="span-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Owner stay, maintenance, private booking…"
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {span.editable ? (
            <Button variant="destructive" size="sm" disabled={busy} onClick={handleRemove}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {span.kind === "block" ? "Unblock these nights" : "Remove restriction"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
            {span.editable && (
              <Button size="sm" disabled={busy} onClick={handleSave}>
                {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Save changes
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
