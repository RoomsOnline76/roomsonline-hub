import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, FileText, Loader2 } from "lucide-react";
import { useBillingSummary } from "@/hooks/useBillingSummary";
import { useAuth } from "@/hooks/useAuth";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

export function BillingPulseCard() {
  const { user } = useAuth();
  const { data, isLoading } = useBillingSummary(user?.id);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Billing Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg border bg-muted/30">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Commission</p>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(data.totalCommission)}</p>
          </div>
          <div className="p-3 rounded-lg border bg-muted/30">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Fees</p>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(data.totalFees)}</p>
          </div>
          <div className="p-3 rounded-lg border bg-muted/30">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Transactions</p>
            <p className="text-lg font-bold tabular-nums">{data.transactionCount}</p>
          </div>
        </div>

        {data.lastInvoice && (
          <div className="p-3 rounded-lg border bg-primary/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs">
                  Last Invoice: {data.lastInvoice.period_start} — {data.lastInvoice.period_end}
                </span>
              </div>
              <span className="text-xs font-medium capitalize px-2 py-0.5 rounded-full bg-muted">
                {data.lastInvoice.status}
              </span>
            </div>
            <p className="text-sm font-bold mt-1">{formatCurrency(data.lastInvoice.net_payout)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
