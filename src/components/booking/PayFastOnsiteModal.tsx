import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, ShieldCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";

// Extend Window interface for PayFast
declare global {
  interface Window {
    payfast_do_onsite_payment: (
      config: { uuid: string; return_url?: string; cancel_url?: string },
      callback?: (result: boolean) => void
    ) => void;
  }
}

interface PayFastOnsiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: () => void;
  onPaymentCancelled: () => void;
  bookingId: string;
  amount: number;
  propertyName: string;
  isSandbox?: boolean;
  uuid?: string; // Optional pre-fetched UUID to skip double API call
}

export const PayFastOnsiteModal = ({
  isOpen,
  onClose,
  onPaymentSuccess,
  onPaymentCancelled,
  bookingId,
  amount,
  propertyName,
  isSandbox = true,
  uuid: preProvidedUuid,
}: PayFastOnsiteModalProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [paymentUuid, setPaymentUuid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [payFastActive, setPayFastActive] = useState(false);

  // Load PayFast onsite script
  useEffect(() => {
    if (!isOpen) return;

    const scriptId = "payfast-onsite-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = isSandbox
        ? "https://sandbox.payfast.co.za/onsite/engine.js"
        : "https://www.payfast.co.za/onsite/engine.js";
      script.async = true;

      script.onload = () => {
        console.log("[PayFast Onsite] Script loaded successfully");
        setScriptLoaded(true);
      };

      script.onerror = () => {
        console.error("[PayFast Onsite] Failed to load script");
        setError("Failed to load payment system. Please refresh and try again.");
      };

      document.body.appendChild(script);
    } else {
      setScriptLoaded(true);
    }

    return () => {
      // Don't remove script - it may be needed for other payments
    };
  }, [isOpen, isSandbox]);

  // Hand off to PayFast's hosted (redirect) checkout — used whenever in-page
  // onsite checkout is unavailable for the merchant account.
  const submitRedirectCheckout = useCallback(
    (checkoutUrl: string, fields: Record<string, string>) => {
      console.log("[PayFast Onsite] Redirecting to hosted checkout:", checkoutUrl);
      setRedirecting(true);
      const form = document.createElement("form");
      form.method = "POST";
      form.action = checkoutUrl;
      form.style.display = "none";
      Object.entries(fields || {}).forEach(([name, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = String(value ?? "");
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    },
    []
  );

  // Watchdog fallback: onsite was triggered but nothing happened (e.g. the PayFast
  // frame 404'd). Fetch redirect-checkout fields and send the guest there instead.
  const fallbackToRedirect = useCallback(async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.functions.invoke("payfast-api", {
        body: { action: "initiate_payment", booking_id: bookingId },
      });
      if (data?.success && data?.checkout_url && data?.form_fields) {
        submitRedirectCheckout(data.checkout_url, data.form_fields);
        return;
      }
      setPayFastActive(false);
      setError(data?.error || "Payment window could not be opened. Please try again.");
    } catch (err) {
      console.error("[PayFast Onsite] Redirect fallback failed:", err);
      setPayFastActive(false);
      setError("Payment window could not be opened. Please try again.");
    }
  }, [bookingId, submitRedirectCheckout]);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  // Trigger PayFast onsite payment
  const triggerOnsitePayment = useCallback((uuid: string) => {
    if (!window.payfast_do_onsite_payment) {
      console.error("[PayFast Onsite] payfast_do_onsite_payment not available");
      setError("Payment system not ready. Please try again.");
      return;
    }

    console.log("[PayFast Onsite] Triggering payment with UUID:", uuid);
    
    // Mark PayFast as active - this hides our modal
    setPayFastActive(true);

    try {
      // PayFast onsite requires a callback function as second parameter
      window.payfast_do_onsite_payment(
        { uuid: uuid },
        (result: boolean) => {
          console.log("[PayFast Onsite] Payment callback result:", result);
          clearWatchdog();
          setPayFastActive(false);
          
          if (result === true) {
            // Success - navigate immediately
            toast.success("Payment successful!");
            onPaymentSuccess();
          } else {
            // User cancelled or payment failed
            console.log("[PayFast Onsite] Payment was cancelled or failed");
            onPaymentCancelled();
          }
        }
      );

      // If the PayFast frame never renders (account without Onsite Payments →
      // the /onsite/process/<uuid> URL 404s), switch to hosted checkout.
      clearWatchdog();
      watchdogRef.current = window.setTimeout(() => {
        const frame = document.querySelector<HTMLIFrameElement>(
          'iframe[src*="/onsite/"], iframe[src*="payfast"]'
        );
        const visible = !!frame && frame.getBoundingClientRect().height > 40;
        if (!visible) {
          console.warn("[PayFast Onsite] No payment frame detected — falling back to redirect checkout");
          void fallbackToRedirect();
        }
      }, 8000);
    } catch (err) {
      console.error("[PayFast Onsite] Error triggering payment:", err);
      clearWatchdog();
      setPayFastActive(false);
      setError("Failed to open payment window. Please try again.");
    }
  }, [onPaymentSuccess, onPaymentCancelled, clearWatchdog, fallbackToRedirect]);

  // Get payment UUID and trigger modal
  useEffect(() => {
    if (!isOpen || !scriptLoaded || paymentUuid) return;

    // If UUID was pre-provided, use it directly (skip API call)
    if (preProvidedUuid) {
      console.log("[PayFast Onsite] Using pre-provided UUID:", preProvidedUuid);
      setPaymentUuid(preProvidedUuid);
      triggerOnsitePayment(preProvidedUuid);
      return;
    }

    const initiatePayment = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { supabase } = await import("@/integrations/supabase/client");
        
        console.log("[PayFast Onsite] Requesting payment UUID for booking:", bookingId);
        
        const { data, error: apiError } = await supabase.functions.invoke("payfast-api", {
          body: {
            action: "initiate_onsite_payment",
            booking_id: bookingId,
          },
        });

        if (apiError) {
          throw new Error(apiError.message || "Failed to initiate payment");
        }

        // Merchant account can't do in-page checkout — go to hosted checkout.
        if (data?.success && data?.onsite_unavailable && data?.checkout_url && data?.form_fields) {
          console.log("[PayFast Onsite] Onsite unavailable:", data.fallback_reason);
          setIsLoading(false);
          submitRedirectCheckout(data.checkout_url, data.form_fields);
          return;
        }

        if (!data?.success || !data?.uuid) {
          const errorMessage = data?.details || data?.error || "Failed to get payment identifier";
          throw new Error(errorMessage);
        }

        console.log("[PayFast Onsite] Received UUID:", data.uuid);
        setPaymentUuid(data.uuid);
        setIsLoading(false);
        
        // Trigger PayFast immediately after getting UUID
        triggerOnsitePayment(data.uuid);
        
      } catch (err) {
        console.error("[PayFast Onsite] Initiation error:", err);
        setError(err instanceof Error ? err.message : "Payment initiation failed");
        setIsLoading(false);
      }
    };

    initiatePayment();
  }, [isOpen, scriptLoaded, paymentUuid, preProvidedUuid, bookingId, triggerOnsitePayment, submitRedirectCheckout]);


  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setPaymentUuid(null);
      setError(null);
      setIsLoading(false);
      setPayFastActive(false);
    }
  }, [isOpen]);

  const handleRetry = () => {
    setPaymentUuid(null);
    setError(null);
    setPayFastActive(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Hide our modal when PayFast popup is active - only show for loading/error states
  const shouldShowModal = isOpen && !payFastActive;

  return (
    <Dialog open={shouldShowModal} onOpenChange={(open) => !open && !payFastActive && onClose()}>
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

          {/* Waiting for PayFast Modal - only show if there's an error reopening */}
          {!isLoading && !error && paymentUuid && !payFastActive && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-4">
                Click below to open the payment window.
              </p>
              <Button onClick={() => triggerOnsitePayment(paymentUuid)} variant="default">
                Open Payment Window
              </Button>
            </div>
          )}

          {/* Security Badge */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            <span>Secured by PayFast · SSL Encrypted</span>
          </div>

          {/* Sandbox Notice */}
          {isSandbox && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-center">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                🔧 Test Mode: Use card 4000000000000002 with any future date and CVV
              </p>
            </div>
          )}
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
