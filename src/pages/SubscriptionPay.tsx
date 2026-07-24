import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";

type LineItem = { kind?: string; description: string; amount: number };
type Invoice = {
  id: string;
  property_id: string | null;
  portfolio_id: string | null;
  amount: number;
  subscription_amount?: number | null;
  once_off_amount?: number | null;
  line_items?: LineItem[] | null;
  invoice_number?: string | null;
  currency: string;
  period_start: string;
  period_end: string;
  status: string;
  invoice_kind: string;
  entity_name: string;
};

export default function SubscriptionPay() {
  const { token = "" } = useParams();
  const [params] = useSearchParams();
  const returnStatus = params.get("status");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [formState, setFormState] = useState<{ url: string; fields: Record<string, string> } | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.rpc("get_subscription_invoice_by_token", { _token: token });
      if (!mounted) return;
      if (error) { setError(error.message); setLoading(false); return; }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) { setError("Invoice link is invalid or has expired."); setLoading(false); return; }
      setInvoice(row as Invoice);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [token]);

  useEffect(() => {
    if (formState && formRef.current) formRef.current.submit();
  }, [formState]);

  const initPayment = async () => {
    if (!invoice) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("payfast-api", {
        body: { action: "initiate_subscription_payment", token },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Could not start payment");
      setFormState({ url: data.checkout_url, fields: data.form_fields });
    } catch (e: any) {
      setError(e.message || "Payment could not be started.");
      setSubmitting(false);
    }
  };

  const cancelSubscription = async () => {
    if (!confirm("Cancel this subscription? You can restart any time.")) return;
    setCancelling(true);
    const { data, error } = await supabase.rpc("cancel_subscription_by_token", { _token: token });
    setCancelling(false);
    if (error) { setError(error.message); return; }
    if (data) { setCancelled(true); }
  };

  const amountFmt = useMemo(() => invoice ? `${invoice.currency} ${Number(invoice.amount).toFixed(2)}` : "", [invoice]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>;
  }

  if (error && !invoice) {
    return <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="max-w-md w-full">
        <CardHeader><CardTitle className="flex items-center gap-2"><XCircle className="h-5 w-5 text-destructive" /> Invalid link</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">{error}</p></CardContent>
      </Card>
    </div>;
  }

  const isPaid = invoice?.status === "paid" || returnStatus === "success";
  const isCancelled = invoice?.status === "cancelled" || cancelled;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle className="text-2xl font-serif">Rooms Online Subscription</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">{invoice?.entity_name}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {isPaid && (
            <Alert className="border-green-500/50 bg-green-500/5">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle>Payment received</AlertTitle>
              <AlertDescription>Your subscription is active. Thank you.</AlertDescription>
            </Alert>
          )}
          {isCancelled && !isPaid && (
            <Alert variant="destructive">
              <AlertTitle>Subscription cancelled</AlertTitle>
              <AlertDescription>Your subscription has been cancelled. Contact support to reactivate.</AlertDescription>
            </Alert>
          )}
          {!isPaid && !isCancelled && (
            <>
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium capitalize">{invoice?.invoice_kind}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Period</span><span>{invoice?.period_start} → {invoice?.period_end}</span></div>
                <div className="flex justify-between text-lg pt-2 border-t"><span className="font-semibold">Amount due</span><span className="font-bold text-primary">{amountFmt}</span></div>
              </div>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 mt-0.5 text-primary" />
                <p>Secure payment via PayFast. <strong>Cancel anytime</strong> — no lock-in, no cancellation fee. Your account stays active for the paid month.</p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex flex-col gap-2">
                <Button onClick={initPayment} disabled={submitting} size="lg" className="w-full">
                  {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Redirecting to PayFast…</> : `Pay ${amountFmt}`}
                </Button>
                <Button variant="ghost" size="sm" onClick={cancelSubscription} disabled={cancelling} className="text-muted-foreground">
                  {cancelling ? "Cancelling…" : "Cancel subscription"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {formState && (
        <form ref={formRef} action={formState.url} method="post" className="hidden">
          {Object.entries(formState.fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        </form>
      )}
    </div>
  );
}
