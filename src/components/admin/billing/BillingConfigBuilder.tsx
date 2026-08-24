import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Info } from "lucide-react";
import { WidgetTierEditor } from "@/components/admin/billing/WidgetTierEditor";
import { DEFAULT_TIERS, PricingTier } from "@/lib/billingTierResolver";

/**
 * Shape of a billing configuration — either a preset (Admin → Billing Defaults)
 * or a per-property override. Every dimension is optional and controlled by an
 * independent toggle.
 */
export interface BillingConfigValue {
  // OTA listing commission (flat %) — bookings made through ROL's own OTA
  commission_enabled: boolean;
  commission_rate: string;
  /** Commission on the property's own surfaces (white-label, direct, widget, embed, API). */
  pms_commission_rate: string;

  // Widget / WBE tiered commission (uses global widget tiers)
  widget_tiers_enabled: boolean;
  // Widget / WBE flat commission — mutually exclusive with tiered widget
  widget_flat_enabled: boolean;
  widget_flat_rate: string;
  // PMS subscription (monthly base)
  pms_enabled: boolean;
  subscription_fee: string;
  /** Channel Manager entitlement (Rentals United sync). Independent of the PMS subscription. */
  channel_manager_enabled: boolean;
  channel_per_unit: string;

  /** Enterprise custom monthly fee (used when property/portfolio > 3 properties). */
  enterprise_custom_fee: string;
  // Per-unit volume tier (uses `tier_pricing_json`)
  volume_tiers_enabled: boolean;
  tier_pricing_json: PricingTier[] | null;
  // ROL payment facilitator surcharge (%)
  facilitator_surcharge_enabled: boolean;
  transaction_fee: string;
  // BYO payment gateway monthly add-on (ZAR)
  byo_gateway_enabled: boolean;
  byo_gateway_fee: string;
  // White-label add-on
  white_label_enabled: boolean;
  white_label_monthly_fee: string;
  white_label_setup_fee: string;
  white_label_billing_mode: "monthly" | "annual";
  // Branding pack (standalone — when off, branding is auto-included free with white-label)
  branding_addon_enabled: boolean;
  branding_addon_monthly_fee: string;
  branding_addon_setup_fee: string;
  branding_addon_billing_mode: "monthly" | "annual";
  // PriceLabs add-on (property-level)
  pricelabs_enabled: boolean;
  pricelabs_monthly_fee: string;
  pricelabs_setup_fee: string;
}

export function emptyBuilderValue(): BillingConfigValue {
  return {
    commission_enabled: false,
    commission_rate: "",
    pms_commission_rate: "",

    widget_tiers_enabled: false,
    widget_flat_enabled: false,
    widget_flat_rate: "",
    pms_enabled: false,
    subscription_fee: "",
    channel_manager_enabled: false,
    channel_per_unit: "",

    enterprise_custom_fee: "",
    volume_tiers_enabled: false,
    tier_pricing_json: null,
    facilitator_surcharge_enabled: true,
    transaction_fee: "",
    byo_gateway_enabled: false,
    byo_gateway_fee: "",
    white_label_enabled: false,
    white_label_monthly_fee: "",
    white_label_setup_fee: "",
    white_label_billing_mode: "monthly",
    branding_addon_enabled: false,
    branding_addon_monthly_fee: "",
    branding_addon_setup_fee: "",
    branding_addon_billing_mode: "monthly",
    pricelabs_enabled: false,
    pricelabs_monthly_fee: "",
    pricelabs_setup_fee: "",
  };
}

interface BuilderProps {
  value: BillingConfigValue;
  onChange: (next: BillingConfigValue) => void;
  /** When true, exposes admin-only controls (global widget tier editor). */
  scope: "preset" | "property";
  /** Optional platform defaults for placeholders. */
  placeholders?: Partial<Record<keyof BillingConfigValue, string | number>>;
  /** Show the "Payment model" separator context. Defaults to true. */
  showPaymentInfo?: boolean;
  /** Add-ons to disable (property-scope gating), keyed by short name. */
  disabledAddons?: { pricelabs?: { disabled: boolean; reason?: string } };
  /** Optional slot rendered inside the PriceLabs frame (e.g., admin push button). */
  pricelabsExtras?: React.ReactNode;
}

function ToggleRow({
  title,
  description,
  enabled,
  onToggle,
  children,
  disabled,
  disabledReason,
}: {
  title: string;
  description?: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children?: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <div className={`rounded-md border p-3 space-y-3 ${enabled && !disabled ? "" : "bg-muted/20"} ${disabled ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label className="text-sm font-medium">{title}</Label>
          {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
          {disabled && disabledReason && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">{disabledReason}</p>
          )}
        </div>
        <Switch checked={enabled && !disabled} disabled={disabled} onCheckedChange={onToggle} />
      </div>
      {enabled && !disabled && children ? <div className="pt-1 space-y-2">{children}</div> : null}
    </div>
  );
}

export function BillingConfigBuilder({ value, onChange, scope, placeholders = {}, showPaymentInfo = true, disabledAddons, pricelabsExtras }: BuilderProps) {
  const set = <K extends keyof BillingConfigValue>(key: K, v: BillingConfigValue[K]) =>
    onChange({ ...value, [key]: v });
  const pricelabsDisabled = !!disabledAddons?.pricelabs?.disabled;

  const tiers = value.tier_pricing_json ?? [];
  const updateTier = (idx: number, patch: Partial<PricingTier>) => {
    const base = value.tier_pricing_json ?? [...DEFAULT_TIERS];
    set("tier_pricing_json", base.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };
  const addTier = () => {
    const base = value.tier_pricing_json ?? [...DEFAULT_TIERS];
    const last = base[base.length - 1];
    const nextMin = last ? (last.max_rooms ?? last.min_rooms) + 1 : 0;
    set("tier_pricing_json", [...base, { min_rooms: nextMin, max_rooms: null, max_properties: null, monthly_fee: null }]);
  };
  const removeTier = (idx: number) => {
    const base = value.tier_pricing_json ?? [...DEFAULT_TIERS];
    set("tier_pricing_json", base.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      {/* ── Commission (two rates by booking origin) ───────────────── */}
      <ToggleRow
        title="Booking commission"
        description="Two rates, applied per booking depending on where it came from. Reservations synced in from third-party channels (Booking.com, Expedia, Airbnb…) carry no ROL commission."
        enabled={value.commission_enabled}
        onToggle={(v) => set("commission_enabled", v)}
      >
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto] items-center gap-2">
            <div>
              <p className="text-[11px] font-medium">Marketplace / listing</p>
              <p className="text-[10px] text-muted-foreground">
                Bookings on ROL's own OTA (book.sleepinafrica.roomsonline.co.za), journeys and itineraries.
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Input
                type="number" step="0.5" min="0" max="100"
                value={value.commission_rate}
                onChange={(e) => set("commission_rate", e.target.value)}
                placeholder={String(placeholders.commission_rate ?? "10")}
                className="h-8 w-20 text-xs"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-t pt-2">
            <div>
              <p className="text-[11px] font-medium">PMS · white-label · direct · widget</p>
              <p className="text-[10px] text-muted-foreground">
                Bookings on the property's own surfaces (white-label site, embed, WordPress, API). Blank = 2%.
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Input
                type="number" step="0.5" min="0" max="100"
                value={value.pms_commission_rate}
                onChange={(e) => set("pms_commission_rate", e.target.value)}
                placeholder={String(placeholders.pms_commission_rate ?? "2")}
                className="h-8 w-20 text-xs"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
        </div>
      </ToggleRow>


      {/* ── Widget flat commission ─────────────────────────────────── */}
      <ToggleRow
        title="Widget — flat commission (WBE)"
        description="Property uses ROL's booking engine (WBE) with a single flat commission %. Mutually exclusive with tiered."
        enabled={value.widget_flat_enabled}
        onToggle={(v) =>
          onChange({
            ...value,
            widget_flat_enabled: v,
            // Turning flat ON disables tiered
            widget_tiers_enabled: v ? false : value.widget_tiers_enabled,
          })
        }
      >
        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
          <Input
            type="number" step="0.5" min="0" max="100"
            value={value.widget_flat_rate}
            onChange={(e) => set("widget_flat_rate", e.target.value)}
            placeholder="8"
            className="h-8 text-xs"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </ToggleRow>

      {/* ── Widget tiered commission ───────────────────────────────── */}
      <ToggleRow
        title="Widget — tiered commission"
        description="Property uses ROL's booking engine (WBE) on their own site. Commission % follows the monthly volume tiers."
        enabled={value.widget_tiers_enabled}
        onToggle={(v) =>
          onChange({
            ...value,
            widget_tiers_enabled: v,
            // Turning tiered ON disables flat
            widget_flat_enabled: v ? false : value.widget_flat_enabled,
          })
        }
      >
        {scope === "preset" ? (
          <WidgetTierEditor />
        ) : (
          <div className="rounded-md border border-dashed bg-muted/30 p-2 text-[11px] text-muted-foreground flex items-start gap-1.5">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            Tier thresholds are managed centrally in Admin → Billing Defaults.
          </div>
        )}
      </ToggleRow>


      {/* ── PMS subscription (billed by total room count) ────────────── */}
      <ToggleRow
        title="PMS subscription (ROL'OS)"
        description={
          scope === "preset"
            ? "Monthly PMS fee. Bills from the room-count tier table below — property count is not a factor. Edit tiers to change platform-wide pricing."
            : "Monthly PMS fee. Bills from the platform's room-count tiers. You may override tiers for this property below."
        }
        enabled={value.pms_enabled}
        onToggle={(v) => set("pms_enabled", v)}
      >
        {/* Tier table — editable in preset scope; read-only until override in property scope */}
        {(() => {
          const usingOverride = Array.isArray(value.tier_pricing_json) && value.tier_pricing_json.length > 0;
          const displayTiers = usingOverride ? (value.tier_pricing_json as PricingTier[]) : DEFAULT_TIERS;
          const editable = scope === "preset" || usingOverride;

          const commitTiers = (next: PricingTier[]) =>
            onChange({ ...value, tier_pricing_json: next, volume_tiers_enabled: true });

          return (
            <div className="rounded-md border bg-muted/20 overflow-hidden">
              <div className="flex items-center justify-between px-2 py-1 bg-muted/60">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Room-count tiers {usingOverride ? "(override)" : scope === "property" ? "(platform default)" : ""}
                </span>
                {scope === "property" && (
                  <div className="flex gap-1">
                    {!usingOverride ? (
                      <Button
                        type="button" size="sm" variant="ghost"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => commitTiers([...DEFAULT_TIERS])}
                      >
                        Override for this property
                      </Button>
                    ) : (
                      <Button
                        type="button" size="sm" variant="ghost"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => onChange({ ...value, tier_pricing_json: null, volume_tiers_enabled: false })}
                      >
                        Reset to platform tiers
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                <span>Min rooms</span><span>Max rooms</span><span>Fee / mo (ZAR)</span><span />
              </div>
              <div className="px-2 pb-2 space-y-1">
                {displayTiers.map((t, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 items-center">
                    <Input
                      type="number" min="0" value={t.min_rooms ?? 0} disabled={!editable}
                      onChange={(e) => {
                        const next = [...displayTiers];
                        next[i] = { ...t, min_rooms: parseInt(e.target.value) || 0 };
                        commitTiers(next);
                      }}
                      className="h-7 text-xs"
                    />
                    <Input
                      type="number" min="0"
                      value={t.max_rooms == null ? "" : t.max_rooms}
                      placeholder="∞"
                      disabled={!editable}
                      onChange={(e) => {
                        const next = [...displayTiers];
                        next[i] = { ...t, max_rooms: e.target.value === "" ? null : parseInt(e.target.value) };
                        commitTiers(next);
                      }}
                      className="h-7 text-xs"
                    />
                    <Input
                      type="number" min="0" step="10"
                      value={t.monthly_fee == null ? "" : t.monthly_fee}
                      disabled={!editable}
                      onChange={(e) => {
                        const next = [...displayTiers];
                        next[i] = { ...t, monthly_fee: e.target.value === "" ? null : parseFloat(e.target.value) };
                        commitTiers(next);
                      }}
                      className="h-7 text-xs"
                    />
                    {editable ? (
                      <Button
                        type="button" variant="ghost" size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => commitTiers(displayTiers.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    ) : <span />}
                  </div>
                ))}
                {editable && (
                  <Button
                    type="button" size="sm" variant="outline"
                    className="h-7 w-full text-[11px] mt-1"
                    onClick={() => {
                      const last = displayTiers[displayTiers.length - 1];
                      const nextMin = last ? ((last.max_rooms ?? last.min_rooms ?? 0) + 1) : 0;
                      commitTiers([...displayTiers, { min_rooms: nextMin, max_rooms: null, max_properties: null, monthly_fee: null }]);
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add tier
                  </Button>
                )}
              </div>
            </div>
          );
        })()}

        <div className="mt-2">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Monthly base override (ZAR)</Label>
          <Input
            type="number" step="50" min="0"
            value={value.subscription_fee}
            onChange={(e) => set("subscription_fee", e.target.value)}
            placeholder="Auto from tier"
            className="h-8 text-xs"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Leave blank to auto-resolve from the tier above. Fill only to force a custom fixed fee.
          </p>
        </div>
      </ToggleRow>

      {/* ── Channel Manager entitlement ─────────────────────────────── */}
      <ToggleRow
        title="Channel Manager (Rentals United)"
        description="Billed per synced unit per month. This switch is also the entitlement gate: when OFF, the ROL'OS Channel Manager screen is locked and every property in the portfolio is archived at Rentals United."
        enabled={value.channel_manager_enabled}
        onToggle={(v) => set("channel_manager_enabled", v)}
      >
        <div className="space-y-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Channel mgr / unit / mo</Label>
            <Input
              type="number" step="10" min="0"
              value={value.channel_per_unit}
              onChange={(e) => set("channel_per_unit", e.target.value)}
              placeholder={String(placeholders.channel_per_unit ?? "60")}
              className="h-8 text-xs"
            />
          </div>
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-1.5">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              Turning this <strong>off</strong> archives all listings for this property/portfolio at Rentals United and stops
              per-unit channel billing. Turning it back <strong>on</strong> re-activates the listings at Rentals United and
              resumes billing for synced units.
            </span>
          </div>
        </div>
      </ToggleRow>





      {/* ── Payment model separator ────────────────────────────────── */}
      {showPaymentInfo && (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-2.5 text-[11px] text-blue-900 dark:text-blue-200 flex items-start gap-1.5">
          <Info className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            <strong>Payment model.</strong> Pick exactly one: <em>ROL processes payments</em> (facilitator surcharge %),{" "}
            <em>Owner's own gateway</em> (BYO monthly add-on), or <em>None</em> — a{" "}
            <strong>reservation-only</strong> property where no online payment is processed and the guest pays the property by bank transfer.
          </span>
        </div>
      )}

      {/* Explicit tri-state payment model — "None" is a first-class choice */}
      <div className="rounded-md border p-3 space-y-2">
        <p className="text-xs font-medium">Payment model</p>
        <div className="grid grid-cols-3 gap-2">
          {([
            { key: "rol", label: "ROL processes", hint: "Facilitator surcharge %" },
            { key: "byo", label: "Owner's gateway", hint: "Flat monthly add-on" },
            { key: "none", label: "None", hint: "Reservation only" },
          ] as const).map((opt) => {
            const active =
              opt.key === "rol"
                ? value.facilitator_surcharge_enabled && !value.byo_gateway_enabled
                : opt.key === "byo"
                ? value.byo_gateway_enabled && !value.facilitator_surcharge_enabled
                : !value.facilitator_surcharge_enabled && !value.byo_gateway_enabled;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    facilitator_surcharge_enabled: opt.key === "rol",
                    byo_gateway_enabled: opt.key === "byo",
                  })
                }
                className={`rounded-md border p-2 text-left transition-colors ${
                  active ? "border-primary bg-primary/10" : "border-input hover:bg-muted/40"
                }`}
              >
                <span className="block text-xs font-medium">{opt.label}</span>
                <span className="block text-[10px] text-muted-foreground">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {!value.facilitator_surcharge_enabled && !value.byo_gateway_enabled && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-1.5">
          <Info className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            <strong>Reservation only.</strong> Payment processing is <strong>NONE</strong>. No gateway is offered at checkout —
            the guest reserves, receives banking details on a pro forma invoice, and the property marks the reservation paid in ROL'OS.
          </span>
        </div>
      )}


      {/* ── ROL facilitator surcharge ──────────────────────────────── */}
      <ToggleRow
        title="ROL payment processing"
        description="Charged per booking when ROL processes payments. The rate comes from the active Gateway Schedule — it is not editable here. Charged on the booking amount only, never compounding on commission or add-ons. Sales reps do not earn commission on this fee. Mutually exclusive with the BYO gateway add-on; turn both off for a reservation-only property."
        enabled={value.facilitator_surcharge_enabled}
        onToggle={(v) => {
          if (v) {
            // Turning on facilitator → turn off BYO
            onChange({ ...value, facilitator_surcharge_enabled: true, byo_gateway_enabled: false });
          } else {
            // Both off is valid → reservation-only
            onChange({ ...value, facilitator_surcharge_enabled: false });
          }
        }}
      >
        <GatewayScheduleMirror fallbackRate={value.transaction_fee || String(placeholders.transaction_fee ?? "")} />
      </ToggleRow>


      {/* ── BYO gateway add-on ─────────────────────────────────────── */}
      <ToggleRow
        title="BYO payment gateway add-on"
        description="Flat monthly fee when the owner connects their own gateway. ROL does not handle the money. Mutually exclusive with the ROL facilitator surcharge; turn both off for a reservation-only property."
        enabled={value.byo_gateway_enabled}
        onToggle={(v) => {
          if (v) {
            onChange({ ...value, byo_gateway_enabled: true, facilitator_surcharge_enabled: false });
          } else {
            onChange({ ...value, byo_gateway_enabled: false });
          }
        }}
      >

        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
          <Input
            type="number" step="50" min="0"
            value={value.byo_gateway_fee}
            onChange={(e) => set("byo_gateway_fee", e.target.value)}
            placeholder={String(placeholders.byo_gateway_fee ?? "250")}
            className="h-8 text-xs"
          />
          <span className="text-xs text-muted-foreground">ZAR/mo</span>
        </div>
      </ToggleRow>

      {/* ── White-label add-on ─────────────────────────────────────── */}
      <ToggleRow
        title="White-label domain & branding"
        description="Custom booking subdomain, full brand override on booking, embeds & emails."
        enabled={value.white_label_enabled}
        onToggle={(v) => set("white_label_enabled", v)}
      >
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Monthly (ZAR)</Label>
            <Input
              type="number" step="50" min="0"
              value={value.white_label_monthly_fee}
              onChange={(e) => set("white_label_monthly_fee", e.target.value)}
              placeholder={String(placeholders.white_label_monthly_fee ?? "450")}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Setup (ZAR)</Label>
            <Input
              type="number" step="50" min="0"
              value={value.white_label_setup_fee}
              onChange={(e) => set("white_label_setup_fee", e.target.value)}
              placeholder={String(placeholders.white_label_setup_fee ?? "1500")}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Billing mode</Label>
            <select
              value={value.white_label_billing_mode}
              onChange={(e) => set("white_label_billing_mode", e.target.value as "monthly" | "annual")}
              className="h-8 w-full text-xs rounded-md border border-input bg-background px-2"
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
        </div>
        {value.white_label_enabled && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            ✓ Basic Branding add-on is automatically included at no extra charge while White-label is on.
          </p>
        )}
      </ToggleRow>

      {/* ── Branding pack (standalone, non-white-label) ────────────── */}
      <ToggleRow
        title="Branding pack (standalone)"
        description="Colour, logo & font overrides on the standard Rooms Online domain — a cheaper alternative to full white-label."
        enabled={value.branding_addon_enabled}
        onToggle={(v) => set("branding_addon_enabled", v)}
        disabled={value.white_label_enabled}
        disabledReason={value.white_label_enabled ? "Included free with White-label." : undefined}
      >
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Monthly (ZAR)</Label>
            <Input
              type="number" step="50" min="0"
              value={value.branding_addon_monthly_fee}
              onChange={(e) => set("branding_addon_monthly_fee", e.target.value)}
              placeholder={String(placeholders.branding_addon_monthly_fee ?? "150")}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Setup (ZAR)</Label>
            <Input
              type="number" step="50" min="0"
              value={value.branding_addon_setup_fee}
              onChange={(e) => set("branding_addon_setup_fee", e.target.value)}
              placeholder={String(placeholders.branding_addon_setup_fee ?? "500")}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Billing mode</Label>
            <select
              value={value.branding_addon_billing_mode}
              onChange={(e) => set("branding_addon_billing_mode", e.target.value as "monthly" | "annual")}
              className="h-8 w-full text-xs rounded-md border border-input bg-background px-2"
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
        </div>
      </ToggleRow>

      {/* ── PriceLabs add-on ───────────────────────────────────────── */}
      <ToggleRow
        title="PriceLabs revenue management (ROL'OS only)"
        description="Allow this property to enable PriceLabs from the ROL'OS revenue tab. Only applicable when PMS = ROL'OS. Fee bills only after the client activates it in ROL'OS."
        enabled={value.pricelabs_enabled}
        onToggle={(v) => set("pricelabs_enabled", v)}
        disabled={pricelabsDisabled}
        disabledReason={disabledAddons?.pricelabs?.reason}
      >
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Monthly (ZAR)</Label>
            <Input
              type="number" step="50" min="0"
              value={value.pricelabs_monthly_fee}
              onChange={(e) => set("pricelabs_monthly_fee", e.target.value)}
              placeholder={String(placeholders.pricelabs_monthly_fee ?? "250")}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Setup (ZAR)</Label>
            <Input
              type="number" step="50" min="0"
              value={value.pricelabs_setup_fee}
              onChange={(e) => set("pricelabs_setup_fee", e.target.value)}
              placeholder={String(placeholders.pricelabs_setup_fee ?? "0")}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">Charged only once the property activates PriceLabs in ROL'OS.</p>
        {pricelabsExtras ? <div className="pt-2 border-t mt-2">{pricelabsExtras}</div> : null}
      </ToggleRow>
    </div>
  );
}

/** One-line human summary of the enabled toggles in a builder value. */
export function summarizeBuilderValue(v: BillingConfigValue): string {
  const parts: string[] = [];
  if (v.commission_enabled && v.commission_rate) parts.push(`${v.commission_rate}% listing commission`);
  if (v.commission_enabled && v.pms_commission_rate) parts.push(`${v.pms_commission_rate}% PMS/direct commission`);

  if (v.widget_flat_enabled && v.widget_flat_rate) parts.push(`${v.widget_flat_rate}% widget flat commission`);
  if (v.widget_tiers_enabled) parts.push("widget tiered commission");

  if (v.pms_enabled) {
    parts.push(v.subscription_fee ? `R${v.subscription_fee}/mo` : "PMS subscription");
  }
  if (v.channel_manager_enabled) {
    parts.push(v.channel_per_unit ? `R${v.channel_per_unit}/unit channel mgr` : "channel manager");
  }

  if (v.volume_tiers_enabled) parts.push("per-unit volume tiers");
  if (v.facilitator_surcharge_enabled && v.transaction_fee) parts.push(`${v.transaction_fee}% ROL surcharge`);
  if (v.byo_gateway_enabled && v.byo_gateway_fee) parts.push(`R${v.byo_gateway_fee}/mo BYO gateway`);
  if (v.white_label_enabled && v.white_label_monthly_fee) parts.push(`R${v.white_label_monthly_fee}/${v.white_label_billing_mode === "annual" ? "yr" : "mo"} white-label`);
  if (v.pricelabs_enabled && v.pricelabs_monthly_fee) parts.push(`R${v.pricelabs_monthly_fee}/mo PriceLabs`);
  return parts.length ? parts.join(" · ") : "no components enabled";
}
