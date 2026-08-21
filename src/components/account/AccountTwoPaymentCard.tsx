import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  Mail,
  Trash2,
  CalendarClock,
  Loader2,
  Download,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  XCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney } from "@/lib/ownerAccount";
import { detectSubscriptionDrift, driftMessage } from "@/lib/subscriptionDrift";
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
  pending_plan: {
    monthly_fee: number;
    effective_date: string | null;
    reason: string | null;
    window_opens_on: string | null;
    can_activate: boolean;
  } | null;
  subscription: {
    monthly_fee: number;
    /** Amount the payment gateway is actually collecting. */
    billed_amount?: number | null;
    /** True when the collected amount no longer matches the contracted fee. */
    amount_drift?: boolean;
    due_by: string | null;
    started_on: string | null;
    period_start: string | null;
    has_started: boolean;
    window_opens_on: string | null;
    can_start: boolean;
    status: string;
    paid_through: string | null;
    cancel_at_period_end: boolean;
    cancel_effective_date: string | null;
    suspended_at: string | null;
    can_cancel: boolean;
    can_resume: boolean;
    can_reactivate: boolean;
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
  const setup = summary.setup ?? ({ items: [], total: 0, invoice: null, paid_invoice: null } as Summary["setup"]);
  const setupItems = setup.items ?? [];
  const setupInvoice = setup.invoice;
  const paidSetupInvoice = setup.paid_invoice;
  const setupAmount = setupInvoice ? setupInvoice.amount : setup.total ?? 0;
  const sub = summary.subscription;
  // Contracted fee vs the amount the gateway is actually collecting.
  const drift = detectSubscriptionDrift({
    contractedMonthlyFee: sub.monthly_fee,
    billedAmount: sub.billed_amount ?? null,
    pendingMonthlyFee: summary.pending_plan?.monthly_fee ?? null,
  });
  const spin = (a: string) => busy === a;
  // A reminder only makes sense while something is actually outstanding: an open
  // setup-fee invoice, an unpaid subscription invoice, or a subscription that has
  // not been started yet.
  const hasOutstanding =
    !!setupInvoice ||
    !!sub.invoice ||
    (sub.monthly_fee > 0 && !sub.cancel_at_period_end && !sub.suspended_at && sub.status !== "active");


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
          {setupItems.length > 0 && (
            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
              {setupItems.map((i) => (
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
              {sub.due_by
                ? `${sub.has_started ? "Next payment" : "Due by"} ${sub.due_by}`
                : "No start date"}
            </Badge>
          </div>
          <div className="text-base font-semibold">
            {fmtMoney(sub.invoice ? sub.invoice.amount : sub.monthly_fee, cur)}
            <span className="text-[11px] font-normal text-muted-foreground"> / month</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {sub.has_started
              ? `Started ${sub.started_on ?? sub.period_start ?? ""} — current period runs to ${sub.due_by}, when the next payment is due.`
              : sub.window_opens_on
              ? `Can be started from ${sub.window_opens_on} (a week before the first billing date).`
              : "Set an engagement date to schedule the first billing date."}
          </p>
          {sub.suspended_at && (
            <p className="flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-[11px] text-destructive">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                Account suspended. Access and functionality are restricted pending reactivation — your data is
                retained.
              </span>
            </p>
          )}
          {sub.cancel_at_period_end && !sub.suspended_at && (
            <p className="flex items-start gap-1.5 rounded-md bg-muted p-2 text-[11px] text-muted-foreground">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                Cancellation scheduled. Service continues until{" "}
                <strong>{sub.cancel_effective_date ?? sub.paid_through ?? "the end of the paid period"}</strong>, then
                the account is suspended pending reactivation.
              </span>
            </p>
          )}

          {drift.drifting && !summary.pending_plan && !sub.suspended_at && (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-2">
              <p className="flex items-start gap-1.5 text-[11px] text-destructive">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Subscription amount changed.</strong>{" "}
                  {driftMessage(drift, (n) => fmtMoney(n, cur))} The current subscription must be
                  cancelled and the new plan activated so the correct amount is collected.
                </span>
              </p>
              {isStaff && summary.is_staff && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  disabled={spin("apply_config_change")}
                  onClick={() =>
                    void run("apply_config_change", "Plan change scheduled - the owner activates the new plan")
                  }
                >
                  {spin("apply_config_change") && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Schedule plan change
                </Button>
              )}
            </div>
          )}

          {summary.pending_plan && !sub.suspended_at && (
            <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-2">
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <CalendarClock className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  <strong className="text-foreground">Plan change scheduled.</strong> Current plan runs to{" "}
                  {sub.cancel_effective_date ?? sub.paid_through ?? "the end of the paid period"}. The new plan of{" "}
                  <strong className="text-foreground">{fmtMoney(summary.pending_plan.monthly_fee, cur)} / month</strong>{" "}
                  starts on <strong className="text-foreground">{summary.pending_plan.effective_date}</strong>.
                </span>
              </p>
              <Button
                size="sm"
                className="w-full"
                disabled={(!summary.pending_plan.can_activate && !summary.is_staff) || spin("activate_pending_plan")}
                onClick={() => void run("activate_pending_plan", "New plan activated - settle the invoice to continue", true)}
              >
                {spin("activate_pending_plan") && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Activate new plan
              </Button>
              {!summary.pending_plan.can_activate && (
                <p className="text-[11px] text-muted-foreground">
                  Activation opens on {summary.pending_plan.window_opens_on} (a week before the new plan starts).
                </p>
              )}
            </div>
          )}

          {sub.invoice?.pay_url ? (
            <Button asChild size="sm" variant="default" className="w-full">
              <a href={sub.invoice.pay_url} target="_blank" rel="noreferrer">
                Pay subscription · {sub.invoice.period_start} → {sub.invoice.period_end}
              </a>
            </Button>
          ) : sub.can_reactivate ? (
            <Button
              size="sm"
              variant="default"
              className="w-full"
              disabled={spin("reactivate_subscription")}
              onClick={() => void run("reactivate_subscription", "Subscription reactivated", true)}
            >
              {spin("reactivate_subscription") ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
              )}
              Reactivate subscription
            </Button>
          ) : sub.can_resume ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={spin("resume_subscription")}
              onClick={() => void run("resume_subscription", "Cancellation withdrawn — subscription continues", true)}
            >
              {spin("resume_subscription") ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
              )}
              Keep subscription (undo cancellation)
            </Button>
          ) : sub.can_cancel ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="w-full text-destructive" disabled={spin("cancel_subscription")}>
                  {spin("cancel_subscription") ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <XCircle className="mr-2 h-3.5 w-3.5" />
                  )}
                  Cancel subscription
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this subscription?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-sm">
                      <p>
                        The account will be <strong>suspended pending reactivation</strong>.
                      </p>
                      <p>
                        The service continues in full until{" "}
                        <strong>{sub.paid_through ?? "the last day of the paid period"}</strong> — the last day already
                        paid for. After that date access and functionality cease until the subscription is reactivated.
                      </p>
                      <p className="text-muted-foreground">
                        You can undo this at any time before that date. Your data is retained either way.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep subscription</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void run("cancel_subscription", "Cancellation scheduled for the end of the paid period", true)}
                  >
                    Cancel subscription
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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

        {isStaff && summary.is_staff && (hasOutstanding || summary.cancelled_count > 0) && (
          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
            {hasOutstanding && (
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
            )}
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
