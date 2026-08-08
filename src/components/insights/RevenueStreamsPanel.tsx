import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RolActualRevenue } from "@/hooks/useRolActualRevenue";

const zar = (n: number) =>
  `R ${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/**
 * Trailing 3-month revenue split by billing stream. Setup fees, monthly
 * subscriptions and booking commission are billed and settled separately, so
 * they are reported separately. Pass-through fees (third-party costs we merely
 * recover) are deducted to show true ROL margin.
 */
export function RevenueStreamsPanel({ revenue }: { revenue: RolActualRevenue | undefined }) {
  const rows: Array<{ label: string; value: number; hint: string }> = [
    {
      label: "Setup fees (upfront)",
      value: revenue?.setupZar ?? 0,
      hint: "Invoiced on contract signature",
    },
    {
      label: "Monthly subscriptions",
      value: revenue?.subscriptionZar ?? 0,
      hint: "Billed from engagement date + free period",
    },
    {
      label: "Booking commission",
      value: revenue?.commissionZar ?? 0,
      hint: "Confirmed bookings only",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Revenue streams · trailing 3 months</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">{r.label}</div>
              <div className="text-[10px] text-muted-foreground">{r.hint}</div>
            </div>
            <div className="font-semibold tabular-nums">{zar(r.value)}</div>
          </div>
        ))}
        <div className="flex items-center justify-between border-t pt-2">
          <span className="text-muted-foreground">Less pass-through recoveries</span>
          <span className="tabular-nums">-{zar(revenue?.passthroughZar ?? 0)}</span>
        </div>
        <div className="flex items-center justify-between font-semibold">
          <span>Net ROL margin</span>
          <span className="tabular-nums">{zar(revenue?.netMarginZar ?? 0)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
