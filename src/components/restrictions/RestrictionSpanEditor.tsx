import { useEffect, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, MoveHorizontal, Trash2, Unlock } from "lucide-react";
import { toast } from "sonner";
import {
  applyRestrictionSpan,
  formatSpanAttribution,
  moveRestrictionSpanToStart,
  releaseRestrictionNights,
  removeRestrictionSpan,
  RESTRICTION_KIND_LABELS,
  type RestrictionChangeRange,
  type RestrictionSpan,
} from "@/lib/restrictionSpans";

/** What the write touched, so the caller can scope the channel delta to exactly those nights. */
export interface RestrictionSpanChange {
  range: RestrictionChangeRange | null;
  /** True when nights were freed (removal, partial release, shrink) — the reopen must be forced. */
  reopened: boolean;
}

interface RestrictionSpanEditorProps {
  span: RestrictionSpan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful save/move/release/remove so the caller can refresh + push to channels. */
  onChanged: (span: RestrictionSpan, change: RestrictionSpanChange) => void | Promise<void>;
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
  const [releaseFrom, setReleaseFrom] = useState("");
  const [releaseTo, setReleaseTo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!span || !open) return;
    setStart(span.start);
    setEnd(span.end);
    setValue(span.value != null ? String(span.value) : "");
    setReason(span.reason || "");
    // Default the release window to the tail of the span — the common case is freeing the last
    // nights of a block after a guest shortened or cancelled part of a hold.
    setReleaseFrom(span.end);
    setReleaseTo(span.end);
  }, [span, open]);

  if (!span) return null;

  const valueLabel = VALUE_LABELS[span.kind];


  const finish = async (message: string, change: RestrictionSpanChange) => {
    // Close and confirm straight away; the refresh + channel push continue behind the dialog.
    toast.success(message);
    onOpenChange(false);
    void onChanged(span, change);
  };

  const handleSave = async () => {
    if (!start || !end) { toast.error("Pick a start and end date"); return; }
    if (end < start) { toast.error("The end date must fall on or after the start date"); return; }
    if (valueLabel && (!value || Number(value) <= 0)) { toast.error(`Enter a ${valueLabel.toLowerCase()} value`); return; }
    setBusy(true);
    try {
      const range = await applyRestrictionSpan(span, {
        start,
        end,
        value: valueLabel ? Number(value) : null,
        reason: reason.trim() || null,
      });
      // Shrinking or moving the span frees nights, so treat any edit that lets nights go as a reopen.
      const freedNights = start > span.start || end < span.end;
      await finish("Restriction updated", { range, reopened: freedNights });
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
      const range = await moveRestrictionSpanToStart(span, start);
      await finish("Restriction moved", { range, reopened: true });
    } catch (error: any) {
      console.error("Failed to move restriction span:", error);
      toast.error(error.message || "Could not move the restriction");
    } finally {
      setBusy(false);
    }
  };

  const handleRelease = async () => {
    if (!releaseFrom || !releaseTo) { toast.error("Pick the nights to release"); return; }
    if (releaseTo < releaseFrom) { toast.error("The last night must fall on or after the first"); return; }
    if (releaseFrom < span.start || releaseTo > span.end) {
      toast.error("Those nights fall outside this restriction");
      return;
    }
    setBusy(true);
    try {
      const range = await releaseRestrictionNights(span, releaseFrom, releaseTo);
      if (!range) {
        toast.info("Those nights are not part of this restriction");
        return;
      }
      await finish(
        span.kind === "block" ? "Nights released and reopened" : "Restriction lifted for those nights",
        { range, reopened: true },
      );
    } catch (error: any) {
      console.error("Failed to release restriction nights:", error);
      toast.error(error.message || "Could not release those nights");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      const range = await removeRestrictionSpan(span);
      await finish(span.kind === "block" ? "Nights unblocked" : "Restriction removed", { range, reopened: true });
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

            {span.nights > 1 && (
              <div className="space-y-1.5 rounded-lg border border-border p-3">
                <Label className="text-xs text-muted-foreground">
                  {span.kind === "block" ? "Release part of this block" : "Lift this rule for part of the span"}
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="release-from" className="text-[11px]">First night</Label>
                    <Input
                      id="release-from"
                      type="date"
                      min={span.start}
                      max={span.end}
                      value={releaseFrom}
                      onChange={(e) => setReleaseFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="release-to" className="text-[11px]">Last night</Label>
                    <Input
                      id="release-to"
                      type="date"
                      min={span.start}
                      max={span.end}
                      value={releaseTo}
                      onChange={(e) => setReleaseTo(e.target.value)}
                    />
                  </div>
                </div>
                <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" disabled={busy} onClick={handleRelease}>
                  <Unlock className="mr-1 h-3 w-3" />
                  {span.kind === "block" ? "Release these nights" : "Lift for these nights"}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  The rest of the span stays in place, and only the released nights are sent to the Channel Manager.
                </p>
              </div>
            )}


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
