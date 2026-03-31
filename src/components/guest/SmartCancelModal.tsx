import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertTriangle, Shield, CheckCircle, Sparkles, CalendarDays, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Alternative {
  type: string;
  title: string;
  description: string;
  savings?: string;
}

interface SmartCancelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: {
    id: string;
    guest_name: string;
    check_in_date: string;
    check_out_date: string;
    total_price: number;
  };
  property: {
    name: string;
    brand_primary_color?: string | null;
  };
  cancellationPolicy?: {
    is_free_cancel?: boolean;
    forfeit_amount?: number;
    forfeit_percent?: number;
    deadline_date?: string;
    is_non_refundable?: boolean;
  } | null;
  token: string;
  onCancelled: () => void;
}

export const SmartCancelModal: React.FC<SmartCancelModalProps> = ({
  open,
  onOpenChange,
  booking,
  property,
  cancellationPolicy,
  token,
  onCancelled,
}) => {
  const [step, setStep] = useState<"alternatives" | "confirm">("alternatives");
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [loadingAlternatives, setLoadingAlternatives] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("alternatives");
      setReason("");
      setConfirmed(false);
      fetchAlternatives();
    }
  }, [open]);

  const fetchAlternatives = async () => {
    setLoadingAlternatives(true);
    try {
      const { data, error } = await supabase.functions.invoke("guest-cancel-booking", {
        body: { token, get_alternatives: true },
      });

      if (!error && data?.alternatives?.length > 0) {
        setAlternatives(data.alternatives);
        setSaveMessage(data.save_message || "");
      } else {
        // No alternatives — skip straight to confirm
        setStep("confirm");
      }
    } catch (err) {
      console.warn("Failed to fetch alternatives:", err);
      setStep("confirm");
    } finally {
      setLoadingAlternatives(false);
    }
  };

  const handleCancel = async () => {
    if (!reason.trim() || !confirmed) return;
    setCancelling(true);

    try {
      const { data, error } = await supabase.functions.invoke("guest-cancel-booking", {
        body: { token, reason: reason.trim(), confirmed: true },
      });

      if (error || !data?.success) {
        toast.error(data?.error || "Failed to cancel booking.");
        return;
      }

      toast.success("Booking cancelled successfully.");
      onCancelled();
    } catch (_err) {
      toast.error("An error occurred. Please try again.");
    } finally {
      setCancelling(false);
    }
  };

  const isValid = reason.trim().length >= 3 && confirmed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            {step === "alternatives" ? (
              <>
                <Sparkles className="h-4 w-4 text-amber-500" />
                Before You Cancel
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Cancel Booking
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {step === "alternatives" && (
          <div className="space-y-3">
            {loadingAlternatives ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {saveMessage && (
                  <p className="text-xs text-muted-foreground">{saveMessage}</p>
                )}

                <div className="space-y-2">
                  {alternatives.map((alt, idx) => (
                    <Card key={idx} className="border-border/60">
                      <CardContent className="p-3 flex items-start gap-3">
                        <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-1.5 mt-0.5">
                          <CalendarDays className="h-3.5 w-3.5 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{alt.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{alt.description}</p>
                          {alt.savings && (
                            <p className="text-xs text-emerald-600 mt-1 font-medium">{alt.savings}</p>
                          )}
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="border-t pt-3 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => onOpenChange(false)}
                  >
                    Keep Booking
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-xs text-muted-foreground"
                    onClick={() => setStep("confirm")}
                  >
                    Proceed with Cancellation
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-3">
            {/* Policy banner */}
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
                      Cancellation fee: <strong>R{cancellationPolicy.forfeit_amount?.toFixed(2)}</strong> ({cancellationPolicy.forfeit_percent}%)
                    </span>
                  </div>
                )}
              </>
            )}

            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-2 text-xs text-destructive">
              You are about to cancel your reservation at <strong>{property.name}</strong> for <strong>{booking.guest_name}</strong>.
              This cannot be undone.
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Why are you cancelling? *</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="text-xs min-h-[80px]"
                placeholder="Please tell us your reason (min 3 characters)"
                required
                minLength={3}
              />
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="confirm-guest-cancel"
                checked={confirmed}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
              />
              <Label htmlFor="confirm-guest-cancel" className="text-xs leading-tight cursor-pointer">
                I understand this cancellation is final and accept the cancellation terms
              </Label>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs h-8"
                onClick={() => alternatives.length > 0 ? setStep("alternatives") : onOpenChange(false)}
              >
                {alternatives.length > 0 ? "Back" : "Keep Booking"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1 text-xs h-8"
                disabled={!isValid || cancelling}
                onClick={handleCancel}
              >
                {cancelling && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Confirm Cancellation
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
