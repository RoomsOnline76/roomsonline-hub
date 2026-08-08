/**
 * Public settlement page for a ROL invoice to a property.
 *
 * The token is the only credential — no login — so everything shown comes from
 * the read-only RPC and the property can settle in one tap.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { LINE_KIND_LABELS, fmtMoney, periodLabel, round2, type PropertyInvoiceLineKind, type PublicInvoiceView } from "@/lib/propertyInvoice";

const SECTIONS: PropertyInvoiceLineKind[] = ["commission", "recurring", "charge", "adjustment"];

export default function PropertyInvoicePay() {
  const { token = "" } = useParams();
  const [params] = useSearchParams();
  const returnStatus = params.get("status");
  const [invoice, setInvoice] = useState<PublicInvoiceView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [formState, setFormState] = useState<{ url: string; fields: Record<string, string> } | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc("get_rol_property_invoice_by_token", { _token: token });
      if (!mounted) return;
      if (rpcError) {
        setError(rpcError.message);
      } else {
        const row = Array.isArray(data) ? data[0] : data;
        if (row) setInvoice(row as unknown as PublicInvoiceView);
        else setError("This invoice link is invalid or has expired.");
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

  const balance = useMemo(
    () => (invoice ? round2(invoice.total - invoice.amount_paid) : 0),
    [invoice],
  );

  const pay = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("payfast-api", {
        body: { action: "initiate_property_invoice_payment", token },
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

  if (!invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />Invalid link
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPaid = invoice.status === "paid" || returnStatus === "success" || balance <= 0;
  const money = (n: number) => fmtMoney(n, invoice.currency);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-6">
      <Card className="max-w-xl w-full">
        <CardHeader>
          <CardTitle className="text-2xl font-serif">Rooms Online Invoice</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {invoice.bill_to_name || invoice.group_name}
            {invoice.invoice_reference ? ` · ${invoice.invoice_reference}` : ""}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {isPaid && (
            <Alert className="border-green-500/50 bg-green-500/5">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle>Payment received</AlertTitle>
              <AlertDescription>This invoice is settled in full. Thank you.</AlertDescription>
            </Alert>
          )}
          {returnStatus === "cancelled" && !isPaid && (
            <Alert variant="destructive">
              <AlertTitle>Payment cancelled</AlertTitle>
              <AlertDescription>No payment was taken. You can try again below.</AlertDescription>
            </Alert>
          )}

          <div className="rounded-lg border divide-y">
            <div className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-muted-foreground">Period</span>
              <span>{periodLabel(invoice.period_start, invoice.period_end)}</span>
            </div>
            {invoice.due_date && (
              <div className="flex justify-between px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">Due date</span>
                <span>{invoice.due_date}</span>
              </div>
            )}
            {SECTIONS.map((kind) => {
              const lines = (invoice.lines || []).filter((l) => l.line_kind === kind);
              if (lines.length === 0) return null;
              return (
                <div key={kind} className="px-4 py-3">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                    {LINE_KIND_LABELS[kind]}
                  </div>
                  <div className="space-y-1">
                    {lines.map((l, i) => (
                      <div key={i} className="flex justify-between gap-3 text-sm">
                        <span className="text-muted-foreground min-w-0">
                          {l.description || "—"}
                          {l.property_name ? <span className="block text-xs">{l.property_name}</span> : null}
                        </span>
                        <span className="shrink-0 tabular-nums">{money(l.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="px-4 py-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{money(invoice.subtotal)}</span>
              </div>
              {invoice.vat_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT @ {invoice.vat_rate}%</span>
                  <span>{money(invoice.vat_amount)}</span>
                </div>
              )}
              {invoice.amount_paid > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Already paid</span>
                  <span>{money(invoice.amount_paid)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1.5 border-t text-lg">
                <span className="font-semibold">{isPaid ? "Total" : "Amount due"}</span>
                <span className="font-bold text-primary">{money(isPaid ? invoice.total : balance)}</span>
              </div>
            </div>
          </div>

          {!isPaid && (
            <>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 mt-0.5 text-primary" />
                <p>
                  Secure card and EFT payment via PayFast. Your invoice is marked paid automatically once the payment
                  clears.
                </p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button onClick={pay} disabled={submitting} size="lg" className="w-full">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />Redirecting to PayFast…
                  </>
                ) : (
                  `Pay ${money(balance)}`
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
