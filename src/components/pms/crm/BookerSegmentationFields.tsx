import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COMM_CHANNELS, MARKET_SEGMENTS, type CrmAccountType } from "@/lib/crmSegmentation";
import { CrmAccountPicker } from "./CrmAccountPicker";
import { CrmAccountDialog } from "./CrmAccountDialog";
import { PhoneInput } from "@/components/pms/PhoneInput";
import { splitPhone, DEFAULT_DIAL_ISO } from "@/lib/dialCodes";
import type { CrmAccount } from "@/hooks/useCrmAccounts";

export interface BookerSegmentationValue {
  booker_is_guest: boolean;
  booker_name: string;
  booker_email: string;
  booker_phone: string;
  company_account_id: string | null;
  agent_account_id: string | null;
  source_account_id: string | null;
  market_segment: string;
  comm_channel: string;
}

export const emptyBookerSegmentation = (): BookerSegmentationValue => ({
  booker_is_guest: true,
  booker_name: "",
  booker_email: "",
  booker_phone: "",
  company_account_id: null,
  agent_account_id: null,
  source_account_id: null,
  market_segment: "",
  comm_channel: "",
});

interface BookerSegmentationFieldsProps {
  value: BookerSegmentationValue;
  onChange: (patch: Partial<BookerSegmentationValue>) => void;
  accounts: CrmAccount[];
  isPortfolioScoped: boolean;
  onSaveAccount: (values: Partial<CrmAccount> & { name: string }) => Promise<string>;
  /** Called when a company is linked so callers can copy invoice-to details. */
  onCompanyLinked?: (account: CrmAccount | null) => void;
  /** Hide the booker toggle/fields when the caller renders them itself. */
  hideBooker?: boolean;
  compact?: boolean;
}


/**
 * "Linked Profiles" + "Segmentation" — the booker (when not the guest), the
 * invoice-to company, the travel agent / tour operator and the source, plus the
 * market code and how the booking reached us.
 */
export function BookerSegmentationFields({
  value,
  onChange,
  accounts,
  isPortfolioScoped,
  onSaveAccount,
  onCompanyLinked,
  hideBooker,
  compact,
}: BookerSegmentationFieldsProps) {

  const [creating, setCreating] = useState<{ type: CrmAccountType; name: string } | null>(null);
  const [bookerIso, setBookerIso] = useState<string>(
    () => splitPhone(value.booker_phone).iso || DEFAULT_DIAL_ISO,
  );
  const [pendingField, setPendingField] = useState<keyof BookerSegmentationValue | null>(null);

  const openCreate = (type: CrmAccountType, name: string, field: keyof BookerSegmentationValue) => {
    setPendingField(field);
    setCreating({ type, name });
  };

  const labelCls = compact ? "text-xs" : undefined;

  return (
    <div className="space-y-3">
      {!hideBooker && (
      <div className="space-y-2">
        <div className="flex items-center gap-2">

          <Checkbox
            id="booker-is-guest"
            checked={value.booker_is_guest}
            onCheckedChange={(v) => onChange({ booker_is_guest: !!v })}
          />
          <Label htmlFor="booker-is-guest" className="cursor-pointer text-xs font-normal">
            The booker is the guest
          </Label>
        </div>

        {!value.booker_is_guest && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="min-w-0">
              <Label className={labelCls}>Booker Name</Label>
              <Input
                className="h-9"
                value={value.booker_name}
                onChange={(e) => onChange({ booker_name: e.target.value })}
                placeholder="Who made the booking"
              />
            </div>
            <div className="min-w-0">
              <Label className={labelCls}>Booker Email</Label>
              <Input
                className="h-9"
                type="email"
                value={value.booker_email}
                onChange={(e) => onChange({ booker_email: e.target.value })}
              />
            </div>
            <div className="min-w-0">
              <Label className={labelCls}>Booker Phone</Label>
              <PhoneInput
                value={value.booker_phone}
                onChange={(v) => onChange({ booker_phone: v })}
                countryIso={bookerIso}
                onCountryIsoChange={setBookerIso}
              />
            </div>
          </div>
        )}
      </div>
      )}


      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="min-w-0">
          <Label className={labelCls}>Company (invoice to)</Label>
          <CrmAccountPicker
            accounts={accounts}
            types={["company"]}
            value={value.company_account_id}
            onChange={(id, account) => {
              onChange({ company_account_id: id });
              onCompanyLinked?.(account);
            }}
            placeholder="No company"
            onCreateNew={(type, name) => openCreate(type, name, "company_account_id")}
          />
        </div>
        <div className="min-w-0">
          <Label className={labelCls}>Travel Agent / Tour Operator</Label>
          <CrmAccountPicker
            accounts={accounts}
            types={["travel_agent", "tour_operator"]}
            value={value.agent_account_id}
            onChange={(id) => onChange({ agent_account_id: id })}
            placeholder="No agent"
            onCreateNew={(type, name) => openCreate(type, name, "agent_account_id")}
          />
        </div>
        <div className="min-w-0">
          <Label className={labelCls}>Source</Label>
          <CrmAccountPicker
            accounts={accounts}
            types={["source"]}
            value={value.source_account_id}
            onChange={(id) => onChange({ source_account_id: id })}
            placeholder="No source profile"
            onCreateNew={(type, name) => openCreate(type, name, "source_account_id")}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <Label className={labelCls}>Market Segment</Label>
          <Select
            value={value.market_segment || "__none__"}
            onValueChange={(v) => onChange({ market_segment: v === "__none__" ? "" : v })}
          >
            <SelectTrigger className="h-9"><SelectValue placeholder="Not set" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not set</SelectItem>
              {MARKET_SEGMENTS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <Label className={labelCls}>Distribution / Communication</Label>
          <Select
            value={value.comm_channel || "__none__"}
            onValueChange={(v) => onChange({ comm_channel: v === "__none__" ? "" : v })}
          >
            <SelectTrigger className="h-9"><SelectValue placeholder="Not set" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not set</SelectItem>
              {COMM_CHANNELS.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <CrmAccountDialog
        open={!!creating}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(null);
            setPendingField(null);
          }
        }}
        account={null}
        initialType={creating?.type}
        initialName={creating?.name}
        isPortfolioScoped={isPortfolioScoped}
        onSave={onSaveAccount}
        onSaved={(id) => {
          if (pendingField) onChange({ [pendingField]: id } as Partial<BookerSegmentationValue>);
        }}
      />
    </div>
  );
}
