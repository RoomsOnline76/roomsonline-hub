/**
 * Sales rep / referral commission table for the Cost estimator.
 *
 * Collapsed by default. Shows, per commissionable revenue line, what a
 * referring rep would earn at each tier — first-year monthly and residual
 * monthly — plus first 12-month and residual totals.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/billingEstimate";
import type { BillingEstimate } from "@/lib/billingEstimate";
import {
  buildRepCommissionEstimate,
  REP_TIER_ORDER,
  type RepGlobalsLike,
} from "@/lib/repCommissionEstimate";
import { Users } from "lucide-react";

interface Props {
  estimate: BillingEstimate;
  globals: RepGlobalsLike | null | undefined;
}

export function RepCommissionPanel({ estimate, globals }: Props) {
  const [open, setOpen] = useState(false);
  const rep = useMemo(() => buildRepCommissionEstimate(estimate, globals), [estimate, globals]);
  const source = rep.rates[0]?.source;

  return (
    <div className="rounded-md border border-border">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-full justify-between px-2.5 text-[11px]"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-primary" />
          Sales rep / referral commission
          <span className="text-muted-foreground">
            · on {money(rep.baseTotal)} /mo revenue · {money(rep.totals.base.firstYear)} –{" "}
            {money(rep.totals.elite.firstYear)} /mo first year
          </span>
        </span>
        <span className="text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </Button>

      {open && (
        <div className="border-t border-border p-2.5 space-y-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-1.5 pr-3 font-medium">Revenue line</th>
                <th className="py-1.5 px-2 font-medium text-right whitespace-nowrap">Monthly revenue</th>
                {REP_TIER_ORDER.map((t) => {
                  const r = rep.rates.find((x) => x.tier === t)!;
                  return (
                    <th key={t} className="py-1.5 px-2 font-medium text-right whitespace-nowrap">
                      {r.label}
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        {r.firstYearRate}% / {r.residualRate}%
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rep.rows.map((row) => (
                <tr key={row.key} className="border-b border-border/50">
                  <td className="py-1.5 pr-3">{row.label}</td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap text-muted-foreground">
                    {money(row.base)}
                  </td>
                  {REP_TIER_ORDER.map((t) => (
                    <td key={t} className="py-1.5 px-2 text-right whitespace-nowrap">
                      {money(row.byTier[t].firstYear)}
                      <span className="text-muted-foreground"> / {money(row.byTier[t].residual)}</span>
                    </td>
                  ))}
                </tr>
              ))}

              <tr className="border-b border-border font-medium">
                <td className="py-1.5 pr-3">Monthly rep earnings</td>
                <td className="py-1.5 px-2 text-right">{money(rep.baseTotal)}</td>
                {REP_TIER_ORDER.map((t) => (
                  <td key={t} className="py-1.5 px-2 text-right whitespace-nowrap">
                    {money(rep.totals[t].firstYear)}
                    <span className="text-muted-foreground"> / {money(rep.totals[t].residual)}</span>
                  </td>
                ))}
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-1.5 pr-3 text-muted-foreground">First 12 months total</td>
                <td />
                {REP_TIER_ORDER.map((t) => (
                  <td key={t} className="py-1.5 px-2 text-right whitespace-nowrap">
                    {money(rep.totals[t].firstYearTotal)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-1.5 pr-3 text-muted-foreground">
                  Residual total ({rep.residualMonths} months)
                </td>
                <td />
                {REP_TIER_ORDER.map((t) => (
                  <td key={t} className="py-1.5 px-2 text-right whitespace-nowrap">
                    {money(rep.totals[t].residualTotal)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>

          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Each cell shows first-year monthly / residual monthly earnings. Commission is earned on RoomsOnline
            revenue — booking and widget commission plus subscriptions and add-ons. Card processing is a
            pass-through cost and is excluded, and the fee-free owner CRM earns nothing. Figures use steady-state
            day-{estimate.freeDays + 1} revenue, so nothing is earned on add-ons while they are waived in the first{" "}
            {estimate.freeDays} days. Rates come from{" "}
            {source === "tier_criteria"
              ? "the preset's rep tier criteria"
              : source === "preset_default"
              ? "the preset's referral defaults"
              : "the platform tier defaults"}
            .
          </p>
        </div>
      )}
    </div>
  );
}
