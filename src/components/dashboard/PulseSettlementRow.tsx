import { useMemo } from "react";
import { Building2, CreditCard, DollarSign, TrendingUp } from "lucide-react";
import { usePropertyPayouts } from "@/hooks/usePropertyPayouts";
import { ROLKPICard } from "./ROLKPICard";

interface PulseSettlementRowProps {
  /** Inclusive start date, yyyy-MM-dd. */
  start: string;
  /** Inclusive end date, yyyy-MM-dd. */
  end: string;
}

const formatZar = (value: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value));

/**
 * Settlement money row for ROL Pulse -> Revenue.
 *
 * Every card here shares the Pulse period selector, so the four figures are
 * directly comparable — unlike the old /admin/payments strip, which mixed a
 * this-month payout view with an all-time gateway total.
 */
export function PulseSettlementRow({ start, end }: PulseSettlementRowProps) {
  // The payout hook wants an exclusive upper bound; Pulse gives an inclusive day.
  const range = useMemo(() => {
    const from = new Date(`${start}T00:00:00.000Z`).toISOString();
    const toDate = new Date(`${end}T00:00:00.000Z`);
    toDate.setUTCDate(toDate.getUTCDate() + 1);
    return { from, to: toDate.toISOString() };
  }, [start, end]);

  const { stats, loading } = usePropertyPayouts(range);

  // "Collected" is every rand received for a revenue-bearing booking, whether it
  // came through a gateway transaction, a manual/EFT capture on the booking, or
  // a sales channel. The subtitle keeps ROL-held cash distinguishable.
  const collected = stats.totalGross;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 xl:gap-4">
        <ROLKPICard
          title="Total Collected"
          value={loading ? "-" : formatZar(collected)}
          subtitle={
            loading
              ? "Loading"
              : `${formatZar(stats.totalRolGross)} to ROL · ${formatZar(stats.totalByoGross)} to owner/channel`
          }
          icon={DollarSign}
          isLoading={loading}
        />
        <ROLKPICard
          title="Commission Earned"
          value={loading ? "-" : formatZar(stats.totalCommission)}
          subtitle="Platform commission in period"
          icon={TrendingUp}
          isLoading={loading}
          valueClassName="text-primary"
        />
        <ROLKPICard
          title="Recoverable (BYO)"
          value={loading ? "-" : formatZar(stats.totalInvoiced)}
          subtitle="Commission to invoice owners"
          icon={CreditCard}
          isLoading={loading}
        />
        <ROLKPICard
          title="Due to Properties"
          value={loading ? "-" : formatZar(stats.totalDue)}
          subtitle={`${stats.propertiesCount} propert${stats.propertiesCount === 1 ? "y" : "ies"}`}
          icon={Building2}
          isLoading={loading}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Live estimates for the selected period, by booking date. Monthly subscription and white-label fees are invoiced
        separately and are not deducted here. Payout statements and property invoices under Payments remain the
        authoritative documents.
      </p>
    </div>
  );
}

