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
import { Loader2, AlertTriangle } from "lucide-react";

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
}

export const CancelBookingModal: React.FC<CancelBookingModalProps> = ({
  open,
  onOpenChange,
  booking,
  onSubmit,
  loading = false,
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
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-2 text-xs text-destructive">
            This action will cancel the booking and notify the PMS (if connected). 
            This cannot be undone.
          </div>

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
              I confirm this cancellation and understand it will be sent to the PMS
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
