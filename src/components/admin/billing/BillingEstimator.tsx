/**
 * Billing estimator — sits at the top of Billing Defaults.
 *
 * Compact two-column layout: configurables on the left, live Day 1–60 and
 * Day 61+ costs on the right of the same row, so ticking an add-on updates its
 * own line in place. The property/volume setup strip stays at the top in a
 * dense grid. Nothing here writes to the database — the presets are the source
 * of the numbers.
 */

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, ChevronDown, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { listGatewaySchedules } from "@/lib/gatewayBillingRate";
import { presetLabel, type BillingDefault } from "@/hooks/useBillingDefaults";
import {
  buildBillingEstimate,
  money,
  summariseEstimate,
  DEFAULT_WIDGET_TIERS,
  type EstimatorAddOns,
  type EstimatorProperty,
  type EstimateLine,
  type PaymentMode,
  type WidgetCommissionMode,
} from "@/lib/billingEstimate";
import { RepCommissionPanel } from "./RepCommissionPanel";
import type { RepGlobalsLike } from "@/lib/repCommissionEstimate";


const ADD_ON_LABELS: Array<{ key: keyof EstimatorAddOns; label: string; hint: string }> = [
  { key: "pms", label: "ROL'OS PMS subscription", hint: "room-count tier" },
  { key: "channel_manager", label: "Channel Manager", hint: "per unit" },
  { key: "branding", label: "Branding pack", hint: "monthly + setup" },
  { key: "white_label", label: "White label", hint: "monthly + setup" },
  { key: "pricelabs", label: "PriceLabs", hint: "per property" },
  { key: "hubspot", label: "Owner CRM (HubSpot)", hint: "no charge" },
];

const PAYMENT_LABELS: Record<PaymentMode, string> = {
  rol: "ROL'OS",
  byo: "BYO",
  reservation_only: "Bookings only",
};

const PAYMENT_HINTS: Record<PaymentMode, string> = {
  rol: "RoomsOnline processes the card payment",
  byo: "The property's own provider processes the card",
  reservation_only: "Reservation captured, no card payment taken",
};

let rowSeq = 0;
function newRow(index: number): EstimatorProperty {
  rowSeq += 1;
  return { id: `row_${rowSeq}`, name: `Property ${index + 1}`, units: 10 };
}

const ALL_ADD_ONS: EstimatorAddOns = {
  pms: true,
  channel_manager: true,
  branding: true,
  white_label: true,
  pricelabs: true,
  hubspot: true,
};

/**
 * Last-used estimator setup. One slot only — saving overwrites it, so there is
 * never more than a single remembered preset.
 */
const SAVED_KEY = "rolos.cost-estimator.last";

interface SavedEstimatorState {
  presetId: string | null;
  rows: EstimatorProperty[];
  bookings: string;
  bookingValue: string;
  paymentMode: PaymentMode;
  widgetBookings: string;
  widgetValue: string;
  widgetMode: WidgetCommissionMode;
  addOns: EstimatorAddOns;
  savedAt: string;
}

function readSaved(): SavedEstimatorState | null {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedEstimatorState;
    if (!Array.isArray(parsed?.rows) || !parsed.rows.length || !parsed?.addOns) return null;
    return parsed;
  } catch {
    return null;
  }
}


export function BillingEstimator({ defaults }: { defaults: BillingDefault[] }) {
  const saved = useMemo(() => readSaved(), []);
  const [open, setOpen] = useState(true);
  const [presetId, setPresetId] = useState<string | null>(saved?.presetId ?? null);
  const [rows, setRows] = useState<EstimatorProperty[]>(() => saved?.rows ?? [newRow(0)]);
  const [bookings, setBookings] = useState(saved?.bookings ?? "20");
  const [bookingValue, setBookingValue] = useState(saved?.bookingValue ?? "150000");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(saved?.paymentMode ?? "rol");
  const [widgetBookings, setWidgetBookings] = useState(saved?.widgetBookings ?? "10");
  const [widgetValue, setWidgetValue] = useState(saved?.widgetValue ?? "60000");
  const [widgetMode, setWidgetMode] = useState<WidgetCommissionMode>(saved?.widgetMode ?? "flat");
  const [addOns, setAddOns] = useState<EstimatorAddOns>(
    saved?.addOns ?? {
      pms: true,
      channel_manager: true,
      branding: false,
      white_label: false,
      pricelabs: false,
      hubspot: true,
    },
  );
  const [savedAt, setSavedAt] = useState<string | null>(saved?.savedAt ?? null);
  const [showExtras, setShowExtras] = useState(false);


  const { data: schedules = [] } = useQuery({
    queryKey: ["gateway-billing-configs", "estimator"],
    queryFn: listGatewaySchedules,
  });
  const activeSchedule = useMemo(() => schedules.find((s) => s.is_active) ?? null, [schedules]);

  const preset = useMemo(
    () => defaults.find((d) => d.id === presetId) ?? defaults.find((d) => d.strategy === "default") ?? defaults[0] ?? null,
    [defaults, presetId],
  );

  const baseInput = useMemo(
    () => ({
      properties: rows,
      monthlyBookings: Number(bookings) || 0,
      monthlyBookingValue: Number(bookingValue) || 0,
      widgetBookings: Number(widgetBookings) || 0,
      widgetBookingValue: Number(widgetValue) || 0,
      widgetCommissionMode: widgetMode,
      paymentMode,
    }),
    [rows, bookings, bookingValue, widgetBookings, widgetValue, widgetMode, paymentMode],
  );

  const estimate = useMemo(
    () => buildBillingEstimate(preset, { ...baseInput, addOns }, activeSchedule),
    [preset, baseInput, addOns, activeSchedule],
  );

  /** Shadow run with every add-on on, so unticked rows can show their would-be price. */
  const shadow = useMemo(
    () => buildBillingEstimate(preset, { ...baseInput, addOns: ALL_ADD_ONS }, activeSchedule),
    [preset, baseInput, activeSchedule],
  );

  const lineByKey = useMemo(() => {
    const map = new Map<string, EstimateLine>();
    estimate.lines.forEach((l) => map.set(l.key, l));
    return map;
  }, [estimate.lines]);

  const shadowByKey = useMemo(() => {
    const map = new Map<string, EstimateLine>();
    shadow.lines.forEach((l) => map.set(l.key, l));
    return map;
  }, [shadow.lines]);

  const transactionLines = useMemo(
    () => estimate.lines.filter((l) => l.group === "transaction"),
    [estimate.lines],
  );

  const setUnits = (id: string, units: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, units: Number(units) || 0 } : r)));
  const setName = (id: string, name: string) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
  const applyToAll = () =>
    setRows((prev) => (prev.length ? prev.map((r) => ({ ...r, units: prev[0].units })) : prev));

  const freeHead = `Days 1–${estimate.freeDays}`;
  const steadyHead = `From day ${estimate.freeDays + 1}`;

  /** Overwrite the single remembered setup — never adds a second one. */
  const saveCurrent = () => {
    const at = new Date().toISOString();
    const payload: SavedEstimatorState = {
      presetId: preset?.id ?? null,
      rows,
      bookings,
      bookingValue,
      paymentMode,
      widgetBookings,
      widgetValue,
      widgetMode,
      addOns,
      savedAt: at,
    };
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(payload));
      setSavedAt(at);
      toast.success("Estimator setup saved", { description: "This is now the setup the estimator opens with." });
    } catch {
      toast.error("Could not save the estimator setup");
    }
  };

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between gap-3">
            <CollapsibleTrigger asChild>
              <div className="flex-1 cursor-pointer">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-primary" /> Cost estimator
                  <span className="text-xs font-normal text-muted-foreground">
                    {estimate.propertyCount} properties · {estimate.totalUnits} units ·{" "}
                    {money(estimate.freePeriodTotal)} → {money(estimate.steadyStateTotal)} /mo
                  </span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Tick or change anything on the left — the {freeHead.toLowerCase()} and day {estimate.freeDays + 1}{" "}
                  costs update on the same line.
                  {savedAt && (
                    <span className="ml-1 text-muted-foreground">
                      Last saved {new Date(savedAt).toLocaleString()}.
                    </span>
                  )}
                </CardDescription>
              </div>
            </CollapsibleTrigger>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={saveCurrent}>
                <Save className="h-3.5 w-3.5 mr-1" /> Save setup
              </Button>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>



        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            {/* ── Setup strip: preset, volumes, gateway ───────────────────── */}
            <div className="rounded-md border border-border p-2.5 space-y-2.5">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                <div className="space-y-0.5 lg:col-span-2">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Preset</Label>
                  <Select value={preset?.id ?? ""} onValueChange={setPresetId}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Select preset" />
                    </SelectTrigger>
                    <SelectContent>
                      {defaults.map((d) => (
                        <SelectItem key={d.id} value={d.id} className="text-xs">
                          {presetLabel(d)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Bookings /mo</Label>
                  <Input
                    type="number"
                    min="0"
                    value={bookings}
                    onChange={(e) => setBookings(e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Value /mo (R)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={bookingValue}
                    onChange={(e) => setBookingValue(e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5 lg:col-span-2">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Payment gateway</Label>
                  <div className="flex rounded-md border border-border overflow-hidden">
                    {(Object.keys(PAYMENT_LABELS) as PaymentMode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        title={PAYMENT_HINTS[m]}
                        onClick={() => setPaymentMode(m)}
                        className={`flex-1 h-7 text-[10px] px-1.5 transition-colors ${
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

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                <div className="space-y-0.5">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Widget bookings</Label>
                  <Input
                    type="number"
                    min="0"
                    value={widgetBookings}
                    onChange={(e) => setWidgetBookings(e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Widget value (R)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={widgetValue}
                    onChange={(e) => setWidgetValue(e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5 lg:col-span-2">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Widget commission</Label>
                  <Select value={widgetMode} onValueChange={(v) => setWidgetMode(v as WidgetCommissionMode)}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flat" className="text-xs">
                        Flat percentage
                      </SelectItem>
                      <SelectItem value="tiered" className="text-xs">
                        Volume tiered
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-0.5 lg:col-span-2">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Properties &amp; units
                  </Label>
                  <div className="flex flex-wrap items-center gap-1">
                    {rows.map((r) => (
                      <div key={r.id} className="flex items-center rounded-md border border-border overflow-hidden">
                        <Input
                          value={r.name}
                          onChange={(e) => setName(r.id, e.target.value)}
                          className="h-7 w-28 text-xs border-0 rounded-none focus-visible:ring-0"
                        />
                        <Input
                          type="number"
                          min="0"
                          value={String(r.units)}
                          onChange={(e) => setUnits(r.id, e.target.value)}
                          className="h-7 w-14 text-xs border-0 border-l border-border rounded-none focus-visible:ring-0"
                        />
                        <button
                          type="button"
                          title="Remove property"
                          disabled={rows.length <= 1}
                          onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}
                          className="h-7 w-6 flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-40"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setRows((prev) => [...prev, newRow(prev.length)])}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Property
                    </Button>
                    {rows.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={applyToAll}>
                        Same units
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {widgetMode === "tiered" && (
                <p className="text-[10px] text-muted-foreground">
                  Widget bands: {DEFAULT_WIDGET_TIERS.map((t) => `${t.min_bookings}+ → ${t.rate}%`).join(" · ")}
                </p>
              )}
            </div>

            {/* ── Configurables (left) vs cost (right) ────────────────────── */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-1.5 pr-3 font-medium">Configurable</th>
                    <th className="py-1.5 px-3 font-medium text-right whitespace-nowrap w-28">{freeHead}</th>
                    <th className="py-1.5 pl-3 font-medium text-right whitespace-nowrap w-28">{steadyHead}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-muted/40">
                    <td colSpan={3} className="py-1 pr-3 font-medium uppercase tracking-wide text-[10px]">
                      Add-ons &amp; subscriptions — waived for the first {estimate.freeDays} days
                    </td>
                  </tr>
                  {ADD_ON_LABELS.map(({ key, label, hint }) => {
                    // White label bundles the branding pack at no charge.
                    const bundled = key === "branding" && addOns.white_label;
                    const active = bundled || addOns[key];
                    const line = lineByKey.get(key);
                    const ghost = shadowByKey.get(key);
                    return (
                      <tr key={key} className="border-b border-border/50">
                        <td className="py-1.5 pr-3">
                          <label
                            className={`flex items-center gap-2 ${bundled ? "cursor-default" : "cursor-pointer"}`}
                          >
                            <Checkbox
                              checked={active}
                              disabled={bundled}
                              onCheckedChange={(c) => setAddOns((prev) => ({ ...prev, [key]: c === true }))}
                            />
                            <span>
                              <span className="font-medium">{label}</span>{" "}
                              <span className="text-muted-foreground">
                                · {bundled ? "free with white label" : line?.detail || hint}
                              </span>
                            </span>
                          </label>
                        </td>
                        <td className="py-1.5 px-3 text-right whitespace-nowrap">
                          {active ? (
                            line?.waivedInFreePeriod ? (
                              <Badge variant="outline" className="text-[10px]">
                                free
                              </Badge>
                            ) : (
                              money(line?.freePeriod ?? 0)
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-1.5 pl-3 text-right whitespace-nowrap">
                          {active ? (
                            money(line?.steadyState ?? 0)
                          ) : (
                            <span className="text-muted-foreground/70">
                              {ghost ? `(${money(ghost.steadyState)})` : "—"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-b border-border">
                    <td className="py-1.5 pr-3 font-medium">Recurring subtotal</td>
                    <td className="py-1.5 px-3 text-right font-medium">{money(estimate.recurringFreePeriodTotal)}</td>
                    <td className="py-1.5 pl-3 text-right font-medium">{money(estimate.recurringSteadyStateTotal)}</td>
                  </tr>

                  <tr className="bg-muted/40">
                    <td colSpan={3} className="py-1 pr-3 font-medium uppercase tracking-wide text-[10px]">
                      Commission &amp; transaction fees — payable from day one
                    </td>
                  </tr>
                  {transactionLines.map((l) => (
                    <tr key={l.key} className="border-b border-border/50">
                      <td className="py-1.5 pr-3">
                        <span className="font-medium">{l.label}</span>{" "}
                        <span className="text-muted-foreground">· {l.detail}</span>
                      </td>
                      <td className="py-1.5 px-3 text-right whitespace-nowrap">{money(l.freePeriod)}</td>
                      <td className="py-1.5 pl-3 text-right whitespace-nowrap">{money(l.steadyState)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-border">
                    <td className="py-1.5 pr-3 font-medium">Transaction subtotal</td>
                    <td className="py-1.5 px-3 text-right font-medium">{money(estimate.transactionFreePeriodTotal)}</td>
                    <td className="py-1.5 pl-3 text-right font-medium">
                      {money(estimate.transactionSteadyStateTotal)}
                    </td>
                  </tr>

                  <tr className="font-semibold">
                    <td className="py-2 pr-3">Monthly total</td>
                    <td className="py-2 px-3 text-right">{money(estimate.freePeriodTotal)}</td>
                    <td className="py-2 pl-3 text-right">{money(estimate.steadyStateTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── Setup fees & per-property split (collapsed) ─────────────── */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setShowExtras((v) => !v)}>
                {showExtras ? "Hide" : "Show"} setup fees{estimate.propertyCount > 1 ? " & per-property split" : ""}
                {estimate.setupTotal > 0 ? ` · ${money(estimate.setupTotal)} upfront` : ""}
              </Button>
              {estimate.gatewayNote && (
                <p
                  className={`text-[10px] ${
                    estimate.usedLegacyGatewayFallback ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  Card processing: {estimate.gatewayNote}
                </p>
              )}
            </div>

            {showExtras && (
              <div className="grid gap-3 md:grid-cols-2">
                {estimate.setupLines.length > 0 && (
                  <div className="rounded-md border border-border p-2.5 space-y-1">
                    <p className="text-[11px] font-medium">Setup fees — invoiced upfront on signature</p>
                    {estimate.setupLines.map((s) => (
                      <p key={s.key} className="text-[11px] text-muted-foreground flex justify-between">
                        <span>{s.label}</span>
                        <span>{money(s.amount)}</span>
                      </p>
                    ))}
                    <p className="text-[11px] font-medium flex justify-between pt-1 border-t border-border/50">
                      <span>Total setup</span>
                      <span>{money(estimate.setupTotal)}</span>
                    </p>
                  </div>
                )}
                {estimate.propertyCount > 1 && (
                  <div className="rounded-md border border-border p-2.5 space-y-1">
                    <p className="text-[11px] font-medium">Per-property split</p>
                    {estimate.perProperty.map((p) => (
                      <p key={p.id} className="text-[11px] text-muted-foreground flex justify-between">
                        <span>
                          {p.name} · {p.units} units
                        </span>
                        <span>
                          {money(p.freePeriod)} → {money(p.steadyState)} /mo
                        </span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <RepCommissionPanel estimate={estimate} globals={preset as unknown as RepGlobalsLike | null} />

            <p className="text-[11px] leading-relaxed text-muted-foreground">{summariseEstimate(estimate)}</p>

          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

