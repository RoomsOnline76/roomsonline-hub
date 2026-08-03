import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CreditCard, AlertTriangle } from "lucide-react";

/**
 * Accepted payment methods — mandatory channel content.
 *
 * Rentals United (and every channel behind it) requires at least one
 * PaymentMethod on Push_PutProperty_RQ. The keys below are exactly the keys
 * the push adapter maps to RU PaymentMethodIDs, RU-supported options first.
 */
export const RU_PAYMENT_METHODS: { key: string; label: string; hint?: string; ruId: number }[] = [
  { key: "cash", label: "Cash", ruId: 1 },
  { key: "credit_card", label: "Credit card (Visa)", ruId: 2 },
  { key: "mastercard", label: "Mastercard", ruId: 3 },
  { key: "amex", label: "American Express", ruId: 4 },
  { key: "bank_transfer", label: "Bank transfer / EFT", ruId: 5 },
  { key: "paypal", label: "PayPal", ruId: 6 },
];

interface RuPaymentMethodsPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Portfolio-level defaults offered when this property has none set. */
  inheritedValue?: string[];
  disabled?: boolean;
}

export const RuPaymentMethodsPicker: React.FC<RuPaymentMethodsPickerProps> = ({
  value,
  onChange,
  inheritedValue,
  disabled,
}) => {
  const selected = Array.isArray(value) ? value : [];
  const canInherit = selected.length === 0 && (inheritedValue?.length ?? 0) > 0;

  const toggle = (key: string, checked: boolean) => {
    if (disabled) return;
    onChange(checked ? Array.from(new Set([...selected, key])) : selected.filter((k) => k !== key));
  };

  return (
    <Card>
      <CardHeader className="py-2 px-4">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Accepted payment methods <span className="text-primary">*</span>
          </span>
          {selected.length === 0 ? (
            <Badge variant="outline" className="text-xs border-primary text-primary">
              Not configured
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">
              {selected.length} selected
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2 px-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          What guests may use to pay at the property. At least one is required by Rentals United and every sales
          channel behind it. Until this is set, the push falls back to Cash + Credit card and the readiness card
          flags it as unconfirmed.
        </p>

        {selected.length === 0 && (
          <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-muted/40 p-2">
            <AlertTriangle className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
            <span className="text-xs text-muted-foreground">
              No payment method confirmed for this property yet.
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {RU_PAYMENT_METHODS.map((m) => (
            <label
              key={m.key}
              className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 cursor-pointer hover:bg-muted/50"
            >
              <Checkbox
                checked={selected.includes(m.key)}
                onCheckedChange={(c) => toggle(m.key, c === true)}
                disabled={disabled}
              />
              <Label className="text-xs cursor-pointer">{m.label}</Label>
            </label>
          ))}
        </div>

        {canInherit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onChange(Array.from(new Set(inheritedValue ?? [])))}
          >
            Use portfolio defaults ({(inheritedValue ?? []).length})
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
