import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowUpRight, CreditCard } from "lucide-react";
import { ADMIN_DOMAIN } from "@/lib/config";
import { fmtMoney, type OwnerBalances, type OwnerRolInvoice, type OwnerSubscriptionInvoice } from "@/lib/ownerAccount";

interface Props {
  balances: OwnerBalances;
  subscriptionInvoices: OwnerSubscriptionInvoice[];
  rolInvoices: OwnerRolInvoice[];
}

/** Resolve the oldest open document and the production settlement link for it. */
function oldestPayLink(subs: OwnerSubscriptionInvoice[], rol: OwnerRolInvoice[]): string | null {
  const candidates: { date: string; url: string }[] = [];
  for (const s of subs) {
    if (["paid", "void"].includes(s.status) || !s.payfast_token) continue;
    // GLOBAL RULE: shareable payment links always use the production domain.
    candidates.push({ date: s.created_at, url: `${ADMIN_DOMAIN}/subscribe/pay/${s.payfast_token}` });
  }
  for (const i of rol) {
    if (i.status === "paid" || i.status === "void" || !i.pay_token) continue;
    candidates.push({ date: i.issued_at || i.created_at, url: `${ADMIN_DOMAIN}/billing/pay/${i.pay_token}` });
  }
  candidates.sort((a, b) => a.date.localeCompare(b.date));
  return candidates[0]?.url ?? null;
}

export function AccountBalanceStrip({ balances, subscriptionInvoices, rolInvoices }: Props) {
  const payUrl = oldestPayLink(subscriptionInvoices, rolInvoices);
  const c = balances.currency;

  const tiles = [
    { label: "Due", value: balances.due, tone: balances.due > 0 ? "warning" : "muted" },
    { label: "Overdue", value: balances.overdue, tone: balances.overdue > 0 ? "danger" : "muted" },
    { label: "Paid this year", value: balances.paidThisYear, tone: "muted" },
    { label: "Due to you", value: balances.dueToYou, tone: balances.dueToYou > 0 ? "success" : "muted" },
  ] as const;

  const toneClass = (tone: string) =>
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-warning"
        : tone === "success"
          ? "text-success"
          : "text-foreground";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="border-border/60">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{t.label}</div>
              <div className={`text-xl font-semibold ${toneClass(t.tone)}`}>{fmtMoney(t.value, c)}</div>
              {t.label === "Overdue" && balances.overdue > 0 && (
                <div className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  {balances.oldestOverdueDays} day{balances.oldestOverdueDays === 1 ? "" : "s"} old
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {payUrl ? (
          <Button asChild size="sm">
            <a href={payUrl} target="_blank" rel="noreferrer">
              <CreditCard className="mr-2 h-4 w-4" />
              Settle now
            </a>
          </Button>
        ) : (
          <Badge variant="outline" className="border-green-500/40 bg-green-500/10 text-success">
            Nothing due
          </Badge>
        )}
        <Button asChild variant="outline" size="sm">
          <a href={`${ADMIN_DOMAIN}/admin/account`} target="_blank" rel="noreferrer">
            Billing portal
            <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </a>
        </Button>
        <span className="text-xs text-muted-foreground">
          Net position {fmtMoney(balances.net, c)} — positive means due to ROL
        </span>
      </div>
    </div>
  );
}
