import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Mail, Trash2, CalendarClock, Loader2, Download, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney } from "@/lib/ownerAccount";
import { downloadSubscriptionInvoice } from "@/lib/invoiceDownload";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  scope: "property" | "portfolio";
  entityId: string;
  onChanged?: () => void;
}

interface Summary {
  entity_name: string;
  currency: string;
  is_staff: boolean;
  setup: {
    total: number;
    items: { description: string; amount: number }[];
    invoice: { id: string; number: string | null; amount: number; pay_url: string | null } | null;
    paid_invoice: { id: string; number: string | null; amount: number; pdf_url: string | null } | null;
  };
  subscription: {
    monthly_fee: number;
    due_by: string | null;
    window_opens_on: string | null;
    can_start: boolean;
    invoice: {
      id: string;
      number: string | null;
      amount: number;
      period_start: string;
      period_end: string;
      pay_url: string | null;
    } | null;
  };
  cancelled_count: number;
}

/**
 * Two-payment billing card.
 *
 * Setup / once-off fees are due as soon as the contract is signed. The monthly
 * subscription is a separate payment the owner starts themselves, and that
 * button only unlocks a week before the first paid billing date.
 */
export function AccountTwoPaymentCard({ scope, entityId, onChanged }: Props) {
  const { isAdmin, isDev, isFearlessLeader } = useAuth();
  // Staff-only tools (reminders, deleting cancelled invoices) never render for owners.
  const isStaff = isAdmin || isDev || isFearlessLeader;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const call = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      const { data, error } = await supabase.functions.invoke("subscription-billing-actions", {
        body: { action, scope, entity_id: entityId, ...extra },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error(String((data as any).error));
      return data as any;
    },
    [scope, entityId],
  );

  const refresh = useCallback(async () => {
    try {
      const data = await call("summary");
      setSummary(data as Summary);
    } catch (err) {
      console.error("[two-payment] summary failed", err);
      setSummary(null);
    }
  }, [call]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (
    action: string,
    successMsg: string,
    openPayUrl = false,
    extra: Record<string, unknown> = {},
  ) => {
    setBusy(action);
    try {
      const res = await call(action, extra);
      toast.success(successMsg);
      if (openPayUrl && res?.pay_url) window.open(res.pay_url, "_blank", "noopener");
      await refresh();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  if (!summary) return null;

  const cur = summary.currency;
  const setupInvoice = summary.setup.invoice;
  const paidSetupInvoice = summary.setup.paid_invoice;
  const setupAmount = setupInvoice ? setupInvoice.amount : summary.setup.total;
  const sub = summary.subscription;
  const spin = (a: string) => busy === a;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <CreditCard className="h-4 w-4" /> Payments to start your account
          <Badge variant="outline" className="text-[10px]">
            Two separate payments
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-xs md:grid-cols-2">
        {/* 1 — once-off setup */}
        <div className="space-y-2 rounded-md border border-border/60 p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">1 · Once-off setup</span>
            {paidSetupInvoice && !setupInvoice ? (
              <Badge variant="outline" className="border-green-500/40 bg-green-500/10 text-success">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Paid
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-warning">Due now</Badge>
            )}
          </div>
          <div className="text-base font-semibold">{fmtMoney(setupAmount, cur)}</div>
          {summary.setup.items.length > 0 && (
            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
              {summary.setup.items.map((i) => (
                <li key={i.description} className="flex justify-between gap-2">
                  <span>{i.description}</span>
                  <span>{fmtMoney(i.amount, cur)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground">
            Payable on signature of the agreement — separate from the monthly subscription.
          </p>
          {paidSetupInvoice && !setupInvoice ? (
            paidSetupInvoice.pdf_url ? (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={downloading}
                onClick={async () => {
                  setDownloading(true);
                  try {
                    await downloadSubscriptionInvoice(paidSetupInvoice.id, paidSetupInvoice.number);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not download the invoice");
                  } finally {
                    setDownloading(false);
                  }
                }}
              >
                {downloading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-2 h-3.5 w-3.5" />}
                Download invoice {paidSetupInvoice.number ? `· ${paidSetupInvoice.number}` : ""}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={spin("deliver_invoice")}
                onClick={() => void run("deliver_invoice", "Invoice generated and emailed", false, { invoice_id: paidSetupInvoice.id })}
              >
                {spin("deliver_invoice") ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-2 h-3.5 w-3.5" />}
                Generate &amp; email invoice
              </Button>
            )
          ) : setupInvoice?.pay_url ? (

            <Button asChild size="sm" className="w-full">
              <a href={setupInvoice.pay_url} target="_blank" rel="noreferrer">
                Pay setup fee {setupInvoice.number ? `· ${setupInvoice.number}` : ""}
              </a>
            </Button>
          ) : setupAmount > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Invoice is being raised automatically — refresh in a moment.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">No setup fees outstanding.</p>
          )}
          {isStaff && summary.is_staff && setupInvoice && (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={spin("mark_invoice_paid")}
              onClick={() =>
                void run("mark_invoice_paid", "Invoice marked as paid", false, {
                  invoice_id: setupInvoice.id,
                })
              }
            >
              {spin("mark_invoice_paid") && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Mark as paid (settled outside ROL)
            </Button>
          )}

        </div>

        {/* 2 — monthly subscription */}
        <div className="space-y-2 rounded-md border border-border/60 p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">2 · Monthly subscription</span>
            <Badge variant="outline" className="gap-1 text-[10px]">
              <CalendarClock className="h-3 w-3" />
              {sub.due_by ? `Due by ${sub.due_by}` : "No start date"}
            </Badge>
          </div>
          <div className="text-base font-semibold">
            {fmtMoney(sub.invoice ? sub.invoice.amount : sub.monthly_fee, cur)}
            <span className="text-[11px] font-normal text-muted-foreground"> / month</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {sub.window_opens_on
              ? `Can be started from ${sub.window_opens_on} (a week before the first billing date).`
              : "Set an engagement date to schedule the first billing date."}
          </p>
          {sub.invoice?.pay_url ? (
            <Button asChild size="sm" variant="default" className="w-full">
              <a href={sub.invoice.pay_url} target="_blank" rel="noreferrer">
                Pay subscription · {sub.invoice.period_start} → {sub.invoice.period_end}
              </a>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={(!sub.can_start && !summary.is_staff) || spin("start_subscription")}
              onClick={() => void run("start_subscription", "Subscription started", true)}
            >
              {spin("start_subscription") && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {sub.can_start || summary.is_staff
                ? "Start subscription"
                : `Available from ${sub.window_opens_on ?? "—"}`}
            </Button>
          )}
        </div>

        {isStaff && summary.is_staff && (
          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
            <Button
              size="sm"
              variant="outline"
              disabled={spin("send_due_reminder")}
              onClick={() => void run("send_due_reminder", "Reminder emailed to owner and the ROL team")}
            >
              {spin("send_due_reminder") ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mail className="mr-2 h-3.5 w-3.5" />
              )}
              Email payment reminder
            </Button>
            {summary.cancelled_count > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={spin("delete_cancelled")}
                onClick={() => void run("delete_cancelled", "Cancelled invoices deleted")}
              >
                {spin("delete_cancelled") ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                )}
                Delete {summary.cancelled_count} cancelled invoice
                {summary.cancelled_count === 1 ? "" : "s"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
