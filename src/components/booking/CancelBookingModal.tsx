import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, AlertTriangle, Shield, CheckCircle } from "lucide-react";

interface CancellationPolicyInfo {
  is_free_cancel?: boolean;
  forfeit_amount?: number;
  forfeit_percent?: number;
  deadline_date?: string;
  is_non_refundable?: boolean;
}

interface CancelBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: {
    id: string;
    guest_name: string;
    property_name?: string;
    check_in_date: string;
    check_out_date: string;
  };
  onSubmit: (reason: string) => Promise<void>;
  loading?: boolean;
  externalSystem?: string | null;
  cancellationPolicy?: CancellationPolicyInfo | null;
}

export const CancelBookingModal: React.FC<CancelBookingModalProps> = ({
  open,
  onOpenChange,
  booking,
  onSubmit,
  loading = false,
  externalSystem,
  cancellationPolicy,
}) => {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || !confirmed) return;
    await onSubmit(reason.trim());
  };

  const isValid = reason.trim().length >= 3 && confirmed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Cancel Booking
          </DialogTitle>
          <DialogDescription className="text-xs">
            Cancel reservation for <strong>{booking.guest_name}</strong> at{" "}
            <strong>{booking.property_name}</strong>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Policy evaluation banner */}
          {cancellationPolicy && (
            <>
              {cancellationPolicy.is_non_refundable ? (
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-2 text-xs text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>This booking is <strong>non-refundable</strong>. Full amount will be forfeited.</span>
                </div>
              ) : cancellationPolicy.is_free_cancel ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-md p-2 text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Within <strong>free cancellation</strong> period
                    {cancellationPolicy.deadline_date && <> (until {cancellationPolicy.deadline_date})</>}
                  </span>
                </div>
              ) : (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-2 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                  <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Cancellation fee applies: <strong>R{cancellationPolicy.forfeit_amount?.toFixed(2)}</strong> ({cancellationPolicy.forfeit_percent}% of booking total)
                  </span>
                </div>
              )}
            </>
          )}

          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-2 text-xs text-destructive">
            This action will cancel the booking in RoomsOnline. 
            This cannot be undone.
          </div>
          {externalSystem === "benson" && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-2 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                This booking is on a <strong>Benson</strong> property. Cancelling here only removes it from RoomsOnline — you must also contact the property directly to cancel in Benson.
              </span>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Cancellation Reason *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="text-xs min-h-[80px]"
              placeholder="Reason for cancellation (required, min 3 characters)"
              required
              minLength={3}
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="confirm-cancel"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
            />
            <Label htmlFor="confirm-cancel" className="text-xs leading-tight cursor-pointer">
              I confirm this cancellation{externalSystem === "benson" ? " and understand the property must be contacted separately to cancel in Benson" : ""}
            </Label>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs h-8"
            >
              Keep Booking
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={!isValid || loading}
              className="text-xs h-8"
            >
              {loading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
