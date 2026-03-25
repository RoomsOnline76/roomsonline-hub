import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, AlertCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface StripeCheckoutProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentInitiated: () => void;
  bookingId: string;
  amount: number;
  propertyName: string;
  propertyId?: string;
  currency?: string;
}

/**
 * Stripe Checkout redirect component.
 * Creates a Stripe Checkout Session and redirects the user.
 */
export function StripeCheckout({
  isOpen,
  onClose,
  onPaymentInitiated,
  bookingId,
  amount,
  propertyName,
  propertyId,
  currency = "ZAR",
}: StripeCheckoutProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePay = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const returnUrl = `${window.location.origin}/booking-confirmation/${bookingId}?payment=success&gateway=stripe`;
      const cancelUrl = `${window.location.origin}/booking-confirmation/${bookingId}?payment=cancelled`;

      const { data, error: fnError } = await supabase.functions.invoke("stripe-gateway", {
        body: {
          action: "initiate_payment",
          booking_id: bookingId,
          amount,
          currency,
          guest_email: "",
          guest_name: "",
          return_url: returnUrl,
          cancel_url: cancelUrl,
          property_id: propertyId,
          item_name: `Booking at ${propertyName}`,
        },
      });

      if (fnError || !data?.success) {
        throw new Error(data?.error || fnError?.message || "Stripe checkout failed");
      }

      if (data.redirect_url) {
        onPaymentInitiated();
        window.location.href = data.redirect_url;
      } else {
        throw new Error("No checkout URL returned from Stripe");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment initiation failed";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Pay with Stripe
          </DialogTitle>
          <DialogDescription>
            You'll be redirected to Stripe's secure checkout to complete your payment of{" "}
            <strong>
              {new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(amount)}
            </strong>{" "}
            for {propertyName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            onClick={handlePay}
            disabled={isLoading}
            className="w-full gap-2"
            size="lg"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            {isLoading ? "Connecting to Stripe..." : "Pay with Stripe"}
          </Button>

          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Secured by Stripe · 256-bit SSL</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
