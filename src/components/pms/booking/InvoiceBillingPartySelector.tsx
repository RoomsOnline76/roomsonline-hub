/**
 * Invoice Billing Party selector.
 *
 * Decides WHO an invoice is addressed to — the guest, a company, a travel
 * agent/tour operator, or the channel the booking arrived through. Channel and
 * agent invoices carry a commission rate so revenue can be reconciled against
 * what actually lands in the bank.
 */
import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CrmAccountPicker } from "@/components/pms/crm/CrmAccountPicker";
import { channelSourceLabel } from "@/lib/channelVocabulary";
import type { CrmAccount } from "@/hooks/useCrmAccounts";
import { Building2, Globe, User, Users } from "lucide-react";

export type BillToType = "guest" | "company" | "agent" | "channel";

export interface BillingPartyState {
  billToType: BillToType;
  accountId: string | null;
  /** Commission % held against this document; null = fall back to config. */
  commissionRate: number | null;
}

interface InvoiceBillingPartySelectorProps {
  value: BillingPartyState;
  onChange: (next: BillingPartyState) => void;
  accounts: CrmAccount[];
  /** The booking's channel key, used to label the Channel option. */
  bookingChannel?: string | null;
  guestName?: string;
  disabled?: boolean;
}

const OPTIONS: { value: BillToType; label: string; icon: typeof User }[] = [
  { value: "guest", label: "Guest", icon: User },
  { value: "company", label: "Company", icon: Building2 },
  { value: "agent", label: "Agent", icon: Users },
  { value: "channel", label: "Channel", icon: Globe },
];

export function InvoiceBillingPartySelector({
  value,
  onChange,
  accounts,
  bookingChannel,
  guestName,
  disabled,
}: InvoiceBillingPartySelectorProps) {
  const { billToType, accountId, commissionRate } = value;

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId) || null,
    [accounts, accountId],
  );

  const needsAccount = billToType === "company" || billToType === "agent";
  const showCommission = billToType === "agent" || billToType === "channel" || billToType === "company";

  const setType = (next: string) => {
    if (!next) return;
    const type = next as BillToType;
    onChange({
      billToType: type,
      // Keep the link only while it still applies to the chosen party.
      accountId: type === "company" || type === "agent" ? accountId : null,
      commissionRate: type === "guest" ? null : commissionRate,
    });
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Bill to</Label>
        <ToggleGroup
          type="single"
          value={billToType}
          onValueChange={setType}
          disabled={disabled}
          className="grid grid-cols-4 gap-1"
        >
          {OPTIONS.map(({ value: v, label, icon: Icon }) => (
            <ToggleGroupItem
              key={v}
              value={v}
              aria-label={label}
              className="h-8 gap-1 border border-border text-[11px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              <Icon className="h-3 w-3" />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {billToType === "guest" && (
        <p className="text-[11px] text-muted-foreground">
          Invoiced directly to {guestName || "the guest"}.
        </p>
      )}

      {needsAccount && (
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {billToType === "company" ? "Company profile" : "Agent / tour operator"}
          </Label>
          <CrmAccountPicker
            accounts={accounts}
            types={billToType === "company" ? ["company"] : ["travel_agent", "tour_operator"]}
            value={accountId}
            disabled={disabled}
            placeholder={billToType === "company" ? "Select a company" : "Select an agent"}
            onChange={(id, account) =>
              onChange({
                billToType,
                accountId: id,
                // Adopt the profile's negotiated rate unless one was typed in.
                commissionRate: account?.default_commission_rate ?? commissionRate,
              })
            }
          />
          {selectedAccount && (
            <p className="text-[11px] text-muted-foreground">
              {selectedAccount.vat_number ? `VAT ${selectedAccount.vat_number} · ` : ""}
              {selectedAccount.payment_terms_days
                ? `${selectedAccount.payment_terms_days} day terms`
                : "No payment terms on file"}
            </p>
          )}
        </div>
      )}

      {billToType === "channel" && (
        <p className="text-[11px] text-muted-foreground">
          Invoiced to <span className="font-medium text-foreground">{channelSourceLabel(bookingChannel)}</span> —
          used where the channel collects from the guest and settles with you.
        </p>
      )}

      {showCommission && (
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Commission %
          </Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={0.5}
            inputMode="decimal"
            disabled={disabled}
            value={commissionRate ?? ""}
            placeholder="From billing config"
            className="h-8 text-xs"
            onChange={(e) =>
              onChange({
                billToType,
                accountId,
                commissionRate: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
          <p className="text-[11px] text-muted-foreground">
            Shown on the invoice and deducted to give the net payable.
          </p>
        </div>
      )}
    </div>
  );
}
