import { useState } from "react";
import { AlertTriangle, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { extractFunctionError } from "@/lib/functionError";
import {
  CANCELLATION_REASON_CATEGORIES,
  type CancellationReasonCategory,
} from "@/lib/revenueStatuses";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  guestName: string;
  /** Shows the channel-withdrawal notice for Rentals United bookings. */
  isRuBooking?: boolean;
  /** True for unconfirmed RU requests — these are rejected rather than cancelled. */
  isRuLead?: boolean;
  /** Set when the operator clicked Cancel on one unit of a multi-unit stay. */
  unitLineId?: string | null;
  unitLabel?: string | null;
  /** Total units on the stay — a scope choice only appears when above 1. */
  unitCount?: number;
  onDone: () => void;
}

export function BookingCancelDialog({
  open,
  onOpenChange,
  bookingId,
  guestName,
  isRuBooking = false,
  isRuLead = false,
  unitLineId = null,
  unitLabel = null,
  unitCount = 1,
  onDone,
}: Props) {
  const [reason, setReason] = useState("");
  const [cancelledBy, setCancelledBy] = useState<"1" | "2">("2");
  const [category, setCategory] = useState<CancellationReasonCategory>("guest_request");
  const [busy, setBusy] = useState(false);
  const canScope = !!unitLineId && unitCount > 1;
  const [scope, setScope] = useState<"unit" | "booking">(canScope ? "unit" : "booking");
  const unitOnly = canScope && scope === "unit";

  const submit = async () => {
    if (reason.trim().length < 3) {
      toast.error("Please give a cancellation reason (at least 3 characters).");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-booking", {
        body: {
          booking_id: bookingId,
          reason: reason.trim(),
          reason_category: category,
          cancel_type_id: Number(cancelledBy),
          ...(unitOnly ? { cancel_room_line_ids: [unitLineId] } : {}),
        },
      });
      if (error) throw new Error(await extractFunctionError(error, "Cancellation failed"));
      if (data && data.success === false) throw new Error(data.message || "Cancellation failed");

      toast.success(data?.message || "Booking cancelled", {
        description: "Released nights and emails are updating in the background.",
      });
      onOpenChange(false);
      setReason("");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancellation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-destructive" />
            {unitOnly ? "Cancel one unit" : isRuLead ? "Reject request" : "Cancel booking"} — {guestName}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {unitOnly
              ? `Only ${unitLabel || "this unit"} is removed from the stay. The remaining ${unitCount - 1} unit${unitCount - 1 === 1 ? "" : "s"} stay booked and the total is re-calculated.`
              : isRuBooking
              ? isRuLead
                ? "This request came from ROL'OS Channels. It will be rejected at the channel first; the hold and calendar block are released only once the channel accepts."
                : "This reservation came from ROL'OS Channels. It will be cancelled at the channel first — if the channel refuses, nothing changes here."
              : "The guest will receive a cancellation email and the nights are released back to inventory."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          {canScope && (
            <div className="space-y-1.5">
              <Label className="text-xs">What should be cancelled?</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as "unit" | "booking")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unit">Just {unitLabel || "this unit"}</SelectItem>
                  <SelectItem value="booking">The whole booking ({unitCount} units)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {isRuBooking && !isRuLead && (
            <div className="space-y-1.5">
              <Label className="text-xs">Cancelled by</Label>
              <Select value={cancelledBy} onValueChange={(v) => setCancelledBy(v as "1" | "2")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">Guest requested the cancellation</SelectItem>
                  <SelectItem value="1">Property / operator cancelled</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Channels treat operator-side cancellations differently to guest-side ones.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Reason category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as CancellationReasonCategory)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CANCELLATION_REASON_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Used for the cancellation analysis on Reports.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Guest requested cancellation — refund per policy"
              rows={3}
            />
          </div>

          <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span>This cannot be undone. Refunds are handled separately on the folio.</span>
          </div>
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Keep booking
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            {unitOnly ? "Cancel this unit" : isRuLead ? "Reject request" : "Cancel booking"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
