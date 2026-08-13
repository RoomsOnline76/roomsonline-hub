/**
 * Public balance settlement page for a modified booking.
 *
 * The token from the balance-request email is the only credential: the guest sees what was
 * received, what the stay now costs, and settles the difference in one tap.
 */
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";

interface BalanceView {
  reference: string;
  guest_name: string | null;
  property_name: string | null;
  check_in_date: string;
  check_out_date: string;
  total_price: number;
  amount_paid: number;
  balance_due: number;
}

const money = (n: number) =>
  `R${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;

export default function BookingBalancePay() {
  const { token = "" } = useParams();
  const [params] = useSearchParams();
  const returnStatus = params.get("payment");
  const [view, setView] = useState<BalanceView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [formState, setFormState] = useState<{ url: string; fields: Record<string, string> } | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error: fnError } = await supabase.functions.invoke("booking-balance-api", {
        body: { action: "get_balance", token },
      });
      if (!mounted) return;
      if (fnError || data?.error) {
        setError(
          typeof data?.error === "string" ? data.error : "This payment link is invalid or has expired.",
        );
      } else if (data?.booking) {
        setView(data.booking as BalanceView);
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    if (formState && formRef.current) formRef.current.submit();
  }, [formState]);

  const pay = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("booking-balance-api", {
        body: { action: "initiate_balance_payment", token },
      });
      if (fnError) throw fnError;
      if (!data?.success) throw new Error(data?.error || "Could not start payment");
      setFormState({ url: data.checkout_url, fields: data.form_fields });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment could not be started.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!view) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />Link no longer valid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const settled = view.balance_due <= 0.01 || returnStatus === "success";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-6">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle className="text-2xl font-serif">Settle your balance</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {view.property_name ?? "Rooms Online"} · {view.reference}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {settled && (
            <Alert className="border-green-500/50 bg-green-500/5">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle>Nothing outstanding</AlertTitle>
              <AlertDescription>
                Your stay is paid in full. Thank you — we look forward to welcoming you.
              </AlertDescription>
            </Alert>
          )}
          {returnStatus === "cancelled" && !settled && (
            <Alert variant="destructive">
              <AlertTitle>Payment cancelled</AlertTitle>
              <AlertDescription>No payment was taken. You can try again below.</AlertDescription>
            </Alert>
          )}

          <div className="rounded-lg border divide-y text-sm">
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Guest</span>
              <span>{view.guest_name ?? "—"}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Stay</span>
              <span>
                {view.check_in_date} → {view.check_out_date}
              </span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Updated total</span>
              <span className="tabular-nums">{money(view.total_price)}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Already received</span>
              <span className="tabular-nums">{money(view.amount_paid)}</span>
            </div>
            <div className="flex justify-between px-4 py-3 text-lg">
              <span className="font-semibold">{settled ? "Total" : "Amount due"}</span>
              <span className="font-bold text-primary tabular-nums">
                {money(settled ? view.total_price : view.balance_due)}
              </span>
            </div>
          </div>

          {!settled && (
            <>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 mt-0.5 text-primary" />
                <p>
                  Secure card and EFT payment. Your booking updates automatically the moment the payment
                  clears.
                </p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button onClick={pay} disabled={submitting} size="lg" className="w-full">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />Redirecting to secure checkout…
                  </>
                ) : (
                  `Pay ${money(view.balance_due)}`
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
      {formState && (
        <form ref={formRef} action={formState.url} method="post" className="hidden">
          {Object.entries(formState.fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        </form>
      )}
    </div>
  );
}
