/**
 * Billing estimator — sits at the top of Billing Defaults.
 *
 * Andim enters properties, units, expected booking volume/value and the add-ons
 * that apply from day 61; the table below recomputes instantly, showing the free
 * first-60-days column beside the steady-state monthly column. Nothing here
 * writes to the database — the presets are the source of the numbers.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, ChevronDown, Plus, Trash2, Building2 } from "lucide-react";
import { listGatewaySchedules } from "@/lib/gatewayBillingRate";
import { presetLabel, type BillingDefault } from "@/hooks/useBillingDefaults";
import {
  buildBillingEstimate,
  money,
  summariseEstimate,
  DEFAULT_WIDGET_TIERS,
  type EstimatorAddOns,
  type EstimatorProperty,
  type EstimateGroup,
  type PaymentMode,
  type WidgetCommissionMode,
} from "@/lib/billingEstimate";

const ADD_ON_LABELS: Array<{ key: keyof EstimatorAddOns; label: string; hint: string }> = [
  { key: "pms", label: "ROL'OS PMS subscription", hint: "room-count tier" },
  { key: "channel_manager", label: "Channel Manager", hint: "per unit" },
  { key: "branding", label: "Branding pack", hint: "monthly + setup" },
  { key: "white_label", label: "White label", hint: "monthly + setup" },
  { key: "pricelabs", label: "PriceLabs", hint: "per property" },
  { key: "hubspot", label: "Owner CRM (HubSpot)", hint: "no charge" },
];

const PAYMENT_LABELS: Record<PaymentMode, string> = {
  rol: "ROL'OS gateway",
  byo: "Own gateway (BYO)",
  reservation_only: "Bookings only",
};

const PAYMENT_HINTS: Record<PaymentMode, string> = {
  rol: "RoomsOnline processes the card payment",
  byo: "The property's own provider processes the card",
  reservation_only: "Reservation captured, no card payment taken",
};

const GROUP_LABELS: Record<EstimateGroup, string> = {
  transaction: "Commission & transaction fees",
  recurring: "Monthly recurring",
};

let rowSeq = 0;
function newRow(index: number): EstimatorProperty {
  rowSeq += 1;
  return { id: `row_${rowSeq}`, name: `Property ${index + 1}`, units: 10 };
}

export function BillingEstimator({ defaults }: { defaults: BillingDefault[] }) {
  const [open, setOpen] = useState(true);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [rows, setRows] = useState<EstimatorProperty[]>(() => [newRow(0)]);
  const [bookings, setBookings] = useState("20");
  const [bookingValue, setBookingValue] = useState("150000");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("rol");
  const [widgetBookings, setWidgetBookings] = useState("10");
  const [widgetValue, setWidgetValue] = useState("60000");
  const [widgetMode, setWidgetMode] = useState<WidgetCommissionMode>("flat");
  const [addOns, setAddOns] = useState<EstimatorAddOns>({
    pms: true,
    channel_manager: true,
    branding: false,
    white_label: false,
    pricelabs: false,
    hubspot: true,
  });
  const [showPerProperty, setShowPerProperty] = useState(false);

  const { data: schedules = [] } = useQuery({
    queryKey: ["gateway-billing-configs", "estimator"],
    queryFn: listGatewaySchedules,
  });
  const activeSchedule = useMemo(() => schedules.find((s) => s.is_active) ?? null, [schedules]);

  const preset = useMemo(
    () => defaults.find((d) => d.id === presetId) ?? defaults.find((d) => d.strategy === "default") ?? defaults[0] ?? null,
    [defaults, presetId],
  );

  const estimate = useMemo(
    () =>
      buildBillingEstimate(
        preset,
        {
          properties: rows,
          monthlyBookings: Number(bookings) || 0,
          monthlyBookingValue: Number(bookingValue) || 0,
          widgetBookings: Number(widgetBookings) || 0,
          widgetBookingValue: Number(widgetValue) || 0,
          widgetCommissionMode: widgetMode,
          addOns,
          paymentMode,
        },
        activeSchedule,
      ),
    [preset, rows, bookings, bookingValue, widgetBookings, widgetValue, widgetMode, addOns, paymentMode, activeSchedule],
  );

  const setUnits = (id: string, units: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, units: Number(units) || 0 } : r)));
  const setName = (id: string, name: string) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
  const applyToAll = () =>
    setRows((prev) => (prev.length ? prev.map((r) => ({ ...r, units: prev[0].units })) : prev));

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-primary" /> Cost estimator
                </CardTitle>
                <CardDescription className="text-xs">
                  Enter properties, units and expected booking volume to see the first {estimate.freeDays} days beside
                  steady-state monthly billing — priced from the configured defaults.
                </CardDescription>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-5">
            {/* ── Inputs ─────────────────────────────────────────────────── */}
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Priced from preset</Label>
                <Select value={preset?.id ?? ""} onValueChange={setPresetId}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {defaults.map((d) => (
                      <SelectItem key={d.id} value={d.id} className="text-sm">
                        {presetLabel(d)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bookings per month</Label>
                <Input
                  type="number"
                  min="0"
                  value={bookings}
                  onChange={(e) => setBookings(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Booking value per month (R)</Label>
                <Input
                  type="number"
                  min="0"
                  value={bookingValue}
                  onChange={(e) => setBookingValue(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Payment gateway</Label>
                <div className="flex rounded-md border border-border overflow-hidden">
                  {(Object.keys(PAYMENT_LABELS) as PaymentMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      title={PAYMENT_HINTS[m]}
                      onClick={() => setPaymentMode(m)}
                      className={`flex-1 h-8 text-[11px] px-2 transition-colors ${
                        paymentMode === m
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {PAYMENT_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Booking widget (direct) commission ─────────────────────── */}
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Widget bookings per month</Label>
                <Input
                  type="number"
                  min="0"
                  value={widgetBookings}
                  onChange={(e) => setWidgetBookings(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Widget booking value per month (R)</Label>
                <Input
                  type="number"
                  min="0"
                  value={widgetValue}
                  onChange={(e) => setWidgetValue(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Widget commission</Label>
                <Select value={widgetMode} onValueChange={(v) => setWidgetMode(v as WidgetCommissionMode)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat" className="text-sm">
                      Flat percentage
                    </SelectItem>
                    <SelectItem value="tiered" className="text-sm">
                      Volume tiered
                    </SelectItem>
                  </SelectContent>
                </Select>
                {widgetMode === "tiered" && (
                  <p className="text-[10px] text-muted-foreground">
                    Bands:{" "}
                    {DEFAULT_WIDGET_TIERS.map((t) => `${t.min_bookings}+ → ${t.rate}%`).join(" · ")}
                  </p>
                )}
              </div>
            </div>

            {/* ── Properties & units ─────────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-primary" /> Properties &amp; units
                  <span className="text-muted-foreground font-normal">
                    ({estimate.propertyCount} properties · {estimate.totalUnits} units)
                  </span>
                </Label>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={applyToAll}>
                    Same units for all
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setRows((prev) => [...prev, newRow(prev.length)])}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add property
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                {rows.map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <Input value={r.name} onChange={(e) => setName(r.id, e.target.value)} className="h-8 text-sm flex-1" />
                    <Input
                      type="number"
                      min="0"
                      value={String(r.units)}
                      onChange={(e) => setUnits(r.id, e.target.value)}
                      className="h-8 text-sm w-24"
                    />
                    <span className="text-xs text-muted-foreground w-10">units</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={rows.length <= 1}
                      onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Add-ons from day 61 ────────────────────────────────────── */}
            <div className="space-y-2">
              <Label className="text-xs">Add-ons that apply from day {estimate.freeDays + 1}</Label>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ADD_ON_LABELS.map(({ key, label, hint }) => {
                  // White label bundles the branding pack at no charge.
                  const bundled = key === "branding" && addOns.white_label;
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-2 rounded-md border border-border px-2.5 py-2 ${
                        bundled ? "cursor-default opacity-90" : "cursor-pointer"
                      }`}
                    >
                      <Checkbox
                        checked={bundled || addOns[key]}
                        disabled={bundled}
                        onCheckedChange={(c) => setAddOns((prev) => ({ ...prev, [key]: c === true }))}
                      />
                      <span className="text-xs">
                        {label}{" "}
                        <span className="text-muted-foreground">· {bundled ? "free with white label" : hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* ── Breakdown table ───────────────────────────────────────── */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-3 font-medium">Line item</th>
                    <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Days 1–{estimate.freeDays}</th>
                    <th className="py-2 pl-3 font-medium text-right whitespace-nowrap">
                      From day {estimate.freeDays + 1}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(["transaction", "recurring"] as EstimateGroup[]).map((group) => {
                    const groupLines = estimate.lines.filter((l) => l.group === group);
                    if (!groupLines.length) return null;
                    const subFree =
                      group === "transaction" ? estimate.transactionFreePeriodTotal : estimate.recurringFreePeriodTotal;
                    const subSteady =
                      group === "transaction"
                        ? estimate.transactionSteadyStateTotal
                        : estimate.recurringSteadyStateTotal;
                    return (
                      <>
                        <tr key={`${group}_head`} className="bg-muted/40">
                          <td colSpan={3} className="py-1.5 pr-3 font-medium uppercase tracking-wide text-[10px]">
                            {GROUP_LABELS[group]}
                          </td>
                        </tr>
                        {groupLines.map((l) => (
                          <tr key={l.key} className="border-b border-border/50">
                            <td className="py-2 pr-3">
                              <span className="font-medium">{l.label}</span>
                              <span className="block text-muted-foreground">{l.detail}</span>
                            </td>
                            <td className="py-2 px-3 text-right whitespace-nowrap">
                              {l.waivedInFreePeriod ? (
                                <Badge variant="outline" className="text-[10px]">
                                  free
                                </Badge>
                              ) : (
                                money(l.freePeriod)
                              )}
                            </td>
                            <td className="py-2 pl-3 text-right whitespace-nowrap">{money(l.steadyState)}</td>
                          </tr>
                        ))}
                        <tr key={`${group}_sub`} className="border-b border-border">
                          <td className="py-1.5 pr-3 font-medium">{GROUP_LABELS[group]} subtotal</td>
                          <td className="py-1.5 px-3 text-right font-medium">{money(subFree)}</td>
                          <td className="py-1.5 pl-3 text-right font-medium">{money(subSteady)}</td>
                        </tr>
                      </>
                    );
                  })}
                  <tr className="font-semibold">
                    <td className="py-2 pr-3">Monthly total</td>
                    <td className="py-2 px-3 text-right">{money(estimate.freePeriodTotal)}</td>
                    <td className="py-2 pl-3 text-right">{money(estimate.steadyStateTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {estimate.setupLines.length > 0 && (
              <div className="rounded-md border border-border p-3 space-y-1">
                <p className="text-xs font-medium">Setup fees — invoiced upfront on signature</p>
                {estimate.setupLines.map((s) => (
                  <p key={s.key} className="text-xs text-muted-foreground flex justify-between">
                    <span>{s.label}</span>
                    <span>{money(s.amount)}</span>
                  </p>
                ))}
                <p className="text-xs font-medium flex justify-between pt-1 border-t border-border/50">
                  <span>Total setup</span>
                  <span>{money(estimate.setupTotal)}</span>
                </p>
              </div>
            )}

            {estimate.propertyCount > 1 && (
              <div className="space-y-1.5">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowPerProperty((v) => !v)}>
                  {showPerProperty ? "Hide" : "Show"} per-property split
                </Button>
                {showPerProperty &&
                  estimate.perProperty.map((p) => (
                    <p key={p.id} className="text-xs text-muted-foreground flex justify-between">
                      <span>
                        {p.name} · {p.units} units
                      </span>
                      <span>
                        {money(p.freePeriod)} → {money(p.steadyState)} / mo
                      </span>
                    </p>
                  ))}
              </div>
            )}

            <p className="text-xs leading-relaxed">{summariseEstimate(estimate)}</p>
            {estimate.gatewayNote && (
              <p className={`text-[11px] ${estimate.usedLegacyGatewayFallback ? "text-destructive" : "text-muted-foreground"}`}>
                Card processing: {estimate.gatewayNote}
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
