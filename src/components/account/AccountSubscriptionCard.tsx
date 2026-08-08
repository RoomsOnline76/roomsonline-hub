import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Clock, PowerOff, XCircle, CreditCard } from "lucide-react";
import { ADMIN_DOMAIN } from "@/lib/config";
import { resolveBillingSchedule } from "@/lib/billingSchedule";
import {
  feeBreakdown,
  fmtMoney,
  type OwnerBalances,
  type OwnerBillingConfig,
  type OwnerSubscriptionInvoice,
  type SubscriptionView,
} from "@/lib/ownerAccount";

interface Props {
  config: OwnerBillingConfig | null;
  subscription: SubscriptionView;
  balances: OwnerBalances;
  unitCount: number;
  invoices: OwnerSubscriptionInvoice[];
}

const ICONS = {
  active: CheckCircle2,
  pending: Clock,
  past_due: AlertTriangle,
  cancelled: XCircle,
  switched_off: PowerOff,
  reset_pending: AlertTriangle,
} as const;

const BADGE = {
  active: "bg-green-500/10 text-success border-green-500/40",
  pending: "bg-amber-500/10 text-warning border-amber-500/40",
  past_due: "bg-destructive/10 text-destructive border-destructive/40",
  cancelled: "bg-muted text-muted-foreground border-border",
  switched_off: "bg-muted text-muted-foreground border-border",
  reset_pending: "bg-destructive/10 text-destructive border-destructive/40",
} as const;

export function AccountSubscriptionCard({ config, subscription, balances, unitCount, invoices }: Props) {
  const schedule = resolveBillingSchedule(config);
  const Icon = ICONS[subscription.status];
  const components = feeBreakdown(config, unitCount);
  const currency = balances.currency;
  const openSub = invoices.find((i) => !["paid", "void"].includes(i.status) && i.payfast_token);
  // GLOBAL RULE: settlement links always resolve to the production domain.
  const payUrl = openSub ? `${ADMIN_DOMAIN}/subscribe/pay/${openSub.payfast_token}` : null;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-medium">
          Subscription
          <Badge variant="outline" className={`gap-1 ${BADGE[subscription.status]}`}>
            <Icon className="h-3 w-3" />
            {subscription.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        {subscription.status === "switched_off" && (
          <div className="rounded-md border border-border bg-muted/50 p-3 text-[11px]">
            Billing switched off — your subscription stays active until{" "}
            <strong>{subscription.activeUntil || "the end of the current period"}</strong>, after which paid features
            end. No further charges.
          </div>
        )}
        {subscription.status === "cancelled" && subscription.activeUntil && (
          <div className="rounded-md border border-border bg-muted/50 p-3 text-[11px]">
            Cancelled — everything stays in force until <strong>{subscription.activeUntil}</strong>. Nothing is charged
            after that date.
          </div>
        )}
        {subscription.resetPending && (
          <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-[11px]">
            <div>
              Your plan changed{subscription.planChangedAt ? ` on ${subscription.planChangedAt}` : ""}. A balance of{" "}
              <strong>{fmtMoney(balances.due, currency)}</strong> is due immediately to activate the new monthly fee of{" "}
              <strong>{fmtMoney(subscription.monthlyFee, currency)}</strong>
              {subscription.previousFee != null && (
                <> (previously {fmtMoney(subscription.previousFee, currency)})</>
              )}
              .
            </div>
            {payUrl && (
              <Button asChild size="sm" variant="destructive">
                <a href={payUrl} target="_blank" rel="noreferrer">
                  <CreditCard className="mr-2 h-3.5 w-3.5" />
                  Pay now
                </a>
              </Button>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <div className="text-muted-foreground">Monthly fee</div>
            <div className="text-base font-semibold">{fmtMoney(subscription.monthlyFee, currency)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Engagement date</div>
            <div className="font-medium">{config?.engagement_date || config?.billing_start_date || "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Paid billing starts</div>
            <div className="font-medium">
              {schedule.paidStart || "—"}
              {schedule.inFreePeriod && (
                <span className="ml-1 text-[10px] text-muted-foreground">
                  ({schedule.freeDaysRemaining} free day{schedule.freeDaysRemaining === 1 ? "" : "s"} left)
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Next billing date</div>
            <div className="font-medium">{subscription.activeUntil || "—"}</div>
          </div>
        </div>

        {components.length > 0 && (
          <div>
            <div className="mb-1 text-muted-foreground">What the monthly fee covers</div>
            <div className="divide-y rounded-md border border-border/60">
              {components.map((c) => (
                <div key={c.label} className="flex items-center justify-between px-3 py-1.5">
                  <span>{c.label}</span>
                  <span className="font-medium">{fmtMoney(c.amount, currency)}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Setup and once-off fees are billed separately on signing and never form part of the monthly fee.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
