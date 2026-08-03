import { memo } from "react";
import { Check, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEAL_TYPE_LABELS, type DealType } from "@/lib/specialsResolver";

export interface CheckoutOffer {
  id: string;
  name: string;
  description?: string | null;
  label: string;
  dealType?: DealType | null;
  discount: number;
  cancellationPolicyId?: string | null;
}

interface SpecialOfferPickerProps {
  offers: CheckoutOffer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Renders the currency amount using the page's price formatter. */
  renderAmount: (amount: number) => React.ReactNode;
}

/**
 * One-of-N offer selection at checkout. Only rendered when two or more
 * specials qualify — a single qualifying special is auto-applied upstream.
 */
export const SpecialOfferPicker = memo(function SpecialOfferPicker({
  offers,
  selectedId,
  onSelect,
  renderAmount,
}: SpecialOfferPickerProps) {
  if (offers.length < 2) return null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <Tag className="h-4 w-4 text-[hsl(var(--primary-text-safe,var(--primary)))]" />
        <p className="text-sm font-medium text-foreground">
          {offers.length} offers available — choose one
        </p>
      </div>
      <div className="space-y-2" role="radiogroup" aria-label="Available special offers">
        {offers.map((offer) => {
          const active = offer.id === selectedId;
          return (
            <button
              key={offer.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(offer.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors",
                active
                  ? "border-[hsl(var(--primary))] bg-accent"
                  : "border-border hover:bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border",
                  active ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]" : "border-muted-foreground",
                )}
              >
                {active && <Check className="h-3 w-3 text-[hsl(var(--primary-foreground))]" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{offer.name}</span>
                  {offer.dealType && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {DEAL_TYPE_LABELS[offer.dealType] ?? offer.dealType}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {offer.description || offer.label}
                </span>
              </span>
              <span className="flex-shrink-0 text-sm font-semibold text-[hsl(var(--primary-text-safe,var(--primary)))]">
                -{renderAmount(offer.discount)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
