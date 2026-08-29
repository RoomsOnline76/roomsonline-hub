import { useEffect, useState } from "react";
import { AlertTriangle, Archive, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatEur } from "@/lib/channelBillingForecast";
import type { ChannelPropertyRow } from "@/hooks/useChannelCostMonitor";

/** Extra teardown steps the operator may tick on top of a plain archive. */
export interface ArchiveExtras {
  /** Close the distribution sub-account itself (channel close-account API). */
  closeAccount: boolean;
  /** Wipe local channel state and reset the onboarding gates so it can start over. */
  sterilize: boolean;
}

interface Props {
  open: boolean;
  mode: "archive" | "reactivate";
  property: ChannelPropertyRow | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string, extras: ArchiveExtras) => void;
}

export function ArchivePropertyDialog({ open, mode, property, busy, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  const [closeAccount, setCloseAccount] = useState(false);
  const [sterilize, setSterilize] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setCloseAccount(false);
      setSterilize(false);
    }
  }, [open, property?.id]);

  const archiving = mode === "archive";
  const unitCount = property?.units.length ?? 0;
  const hasAccount = !!property?.ownerId;


  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {archiving ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
            {archiving ? "Archive property and units" : "Re-activate property and units"}
          </DialogTitle>
          <DialogDescription>
            {property?.name}
            {property?.portfolioName ? ` · ${property.portfolioName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border bg-muted/50 p-3">
            <ul className="space-y-1 text-muted-foreground">
              <li>
                {archiving ? "Removes" : "Restores"}{" "}
                <span className="font-medium text-foreground">
                  {archiving ? property?.listings ?? 0 : unitCount || 1}
                </span>{" "}
                billable listing{(archiving ? property?.listings ?? 0 : unitCount || 1) === 1 ? "" : "s"} on the
                Channel Manager.
              </li>
              <li>
                {archiving ? "Deactivates" : "Re-activates"}{" "}
                <span className="font-medium text-foreground">{unitCount}</span> unit
                {unitCount === 1 ? "" : "s"} locally and at the channel.
              </li>
              <li>
                {archiving
                  ? `Saves roughly ${formatEur(property?.monthlyCostEur ?? 0)} a month once above the period minimum.`
                  : "Resumes usage billing for this property from the current period."}
              </li>
              {archiving && <li>Stops all further rate and availability pushes.</li>}
            </ul>
          </div>

          {!archiving && (
            <div className="flex items-start gap-2 rounded-md border border-primary bg-primary/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs">
                Re-activation is billable and will email a notification to the development and finance mailboxes.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="archive-reason" className="text-xs">
              Reason {archiving ? "(recommended)" : "(recommended)"}
            </Label>
            <Textarea
              id="archive-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder={archiving ? "e.g. owner paused distribution for winter" : "e.g. owner resumed contract"}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(reason.trim())} disabled={busy}>
            {busy ? "Working…" : archiving ? "Confirm archive" : "Confirm re-activation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
