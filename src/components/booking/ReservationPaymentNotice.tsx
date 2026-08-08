import { Landmark, Info } from "lucide-react";
import { FormattedPrice } from "@/components/FormattedPrice";
import { bankingLines, type PropertyBankingDetails } from "@/lib/paymentMode";
import type { ReservationTerms } from "@/lib/reservationTerms";

interface ReservationPaymentNoticeProps {
  banking: PropertyBankingDetails | null;
  terms: ReservationTerms;
  total: number;
  reference?: string | null;
  policySummary?: string | null;
  /** Compact variant for narrow checkout panels. */
  compact?: boolean;
}

/**
 * Shown instead of a payment gateway when the property handles payment itself.
 * Unobtrusive but noticeable: bank details, what is due when, and the terms.
 */
export function ReservationPaymentNotice({
  banking,
  terms,
  total,
  reference,
  policySummary,
  compact = false,
}: ReservationPaymentNoticeProps) {
  const rows = banking ? bankingLines(banking) : [];

  return (
    <div className="rounded-xl border border-primary/30 bg-muted/30 overflow-hidden">
      <div className="flex items-start gap-2 px-4 py-3 border-b border-border/60">
        <Landmark className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium">Reserve now, pay the property directly</p>
          <p className="text-xs text-muted-foreground">
            No online payment is taken. {terms.summary} by bank transfer to secure your stay.
          </p>
        </div>
      </div>

      <div className={compact ? "px-4 py-3 space-y-2" : "px-4 py-4 space-y-3"}>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {terms.isFullPrepayment ? "Payable now" : `Deposit (${terms.depositPercent}%)`}
          </span>
          <span className="font-semibold"><FormattedPrice amount={terms.amountDueNow} /></span>
        </div>
        {!terms.isFullPrepayment && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Balance{terms.balanceDueDate ? ` by ${terms.balanceDueDate}` : ""}</span>
            <span><FormattedPrice amount={terms.balanceDue} /></span>
          </div>
        )}
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Stay total</span>
          <span><FormattedPrice amount={total} /></span>
        </div>

        {rows.length > 0 ? (
          <div className="rounded-lg border border-border/60 bg-background/60 divide-y divide-border/50">
            {rows.map((r) => (
              <div key={r.label} className="flex justify-between gap-3 px-3 py-1.5 text-xs">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-medium text-right break-all">{r.value}</span>
              </div>
            ))}
            {reference && (
              <div className="flex justify-between gap-3 px-3 py-1.5 text-xs">
                <span className="text-muted-foreground">Payment reference</span>
                <span className="font-medium text-right break-all">{reference}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            The property will email you their banking details with your pro forma invoice.
          </p>
        )}

        {policySummary && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">{policySummary}</p>
        )}
      </div>
    </div>
  );
}
