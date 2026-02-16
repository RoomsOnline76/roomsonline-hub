import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, ShieldCheck, AlertCircle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PayGateRedirectProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentInitiated: () => void;
  bookingId: string;
  amount: number;
  propertyName: string;
}

export const PayGateRedirect = ({
  isOpen,
  onClose,
  onPaymentInitiated,
  bookingId,
  amount,
  propertyName,
}: PayGateRedirectProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirectData, setRedirectData] = useState<{
    pay_request_id: string;
    checksum: string;
    redirect_url: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen || redirectData) return;

    const initiatePayment = async () => {
      setIsLoading(true);
      setError(null);

      try {
        console.log("[PayGate] Initiating payment for booking:", bookingId);

        const { data, error: apiError } = await supabase.functions.invoke("paygate-api", {
          body: {
            action: "initiate_payment",
            booking_id: bookingId,
          },
        });

        if (apiError) throw new Error(apiError.message || "Failed to initiate payment");
        if (!data?.success || !data?.pay_request_id) {
          throw new Error(data?.error || "Failed to get payment session");
        }

        console.log("[PayGate] Received PAY_REQUEST_ID:", data.pay_request_id);
        setRedirectData({
          pay_request_id: data.pay_request_id,
          checksum: data.checksum,
          redirect_url: data.redirect_url,
        });
        setIsLoading(false);
      } catch (err) {
        console.error("[PayGate] Initiation error:", err);
        setError(err instanceof Error ? err.message : "Payment initiation failed");
        setIsLoading(false);
      }
    };

    initiatePayment();
  }, [isOpen, bookingId, redirectData]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setRedirectData(null);
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  const handleRedirect = () => {
    if (!redirectData) return;

    // Create a form and submit it to redirect the user to PayGate
    const form = document.createElement("form");
    form.method = "POST";
    form.action = redirectData.redirect_url;

    const addField = (name: string, value: string) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };

    addField("PAY_REQUEST_ID", redirectData.pay_request_id);
    addField("CHECKSUM", redirectData.checksum);

    document.body.appendChild(form);
    onPaymentInitiated();
    form.submit();
  };

  const handleRetry = () => {
    setRedirectData(null);
    setError(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent className="sm:max-w-md" hideCloseButton={isLoading}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Secure Payment
          </DialogTitle>
          <DialogDescription>
            Complete your payment for {propertyName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Amount Display */}
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Amount Due</p>
            <p className="text-3xl font-bold text-primary">{formatCurrency(amount)}</p>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Preparing secure payment...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">Payment Error</p>
                  <p className="text-sm text-destructive/80 mt-1">{error}</p>
                </div>
              </div>
              <Button onClick={handleRetry} variant="outline" size="sm" className="mt-3 w-full">
                Try Again
              </Button>
            </div>
          )}

          {/* Ready to Redirect */}
          {!isLoading && !error && redirectData && (
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                You'll be redirected to PayGate's secure payment page to complete your transaction.
              </p>
              <Button onClick={handleRedirect} className="w-full h-12 text-base" size="lg">
                <ExternalLink className="h-4 w-4 mr-2" />
                Proceed to Secure Payment
              </Button>
              <p className="text-xs text-muted-foreground">
                After payment, you'll be returned to RoomsOnline automatically.
              </p>
            </div>
          )}

          {/* Security Badge */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            <span>Secured by PayGate · SSL Encrypted</span>
          </div>
        </div>

        {/* Cancel Button */}
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
