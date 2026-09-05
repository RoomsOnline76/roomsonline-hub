import React, { useEffect, useMemo, useReducer, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CalendarClock,
  CalendarDays,
  Check,
  Clock,
  Gift,
  Loader2,
  Percent,
  ShieldCheck,
  Tag,
  Timer,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { queueChannelDiscountSync } from "@/lib/channelContentSync";
import { useReservationPolicies, type ReservationPolicy } from "@/hooks/useReservationPolicies";
import { usePortfolioSiblings } from "@/hooks/usePortfolioSiblings";
import { usePortfolioPolicies } from "@/hooks/usePortfolioPolicies";
import { ReservationPolicyDialog } from "@/components/property/ReservationPolicyDialog";
import { formatCancellationPolicy } from "@/lib/policyFormatter";
import { DEAL_TYPE_LABELS, type DealType, type StayDateRange } from "@/lib/specialsResolver";

interface RoomTypeOption {
  id: string;
  name: string;
}

interface RatePlanOption {
  id: string;
  name: string;
}

export interface SpecialWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  category: string;
  roomTypes?: RoomTypeOption[];
  onSaved: () => void;
}

type CopyMode = "copy" | "link";

interface WizardState {
  step: number;
  dealType: DealType;
  specialType: "discount" | "fixed_off" | "fixed_price" | "package";
  name: string;
  description: string;
  leadDaysMin: string;
  leadDaysMax: string;
  leadHoursMax: string;
  lastMinuteUnit: "days" | "hours";
  minStay: string;
  maxStay: string;
  audience: "everyone" | "subscribers";
  discountPercent: string;
  fixedAmount: string;
  fixedPrice: string;
  validFrom: string;
  validTo: string;
  extraRanges: StayDateRange[];
  dow: string[];
  roomIds: string[];
  ratePlanIds: string[];
  roundingMode: string;
  pricePointing: string;
  policyChoice: "inherit" | "existing";
  policyId: string | null;
  copyTargets: Record<string, CopyMode | undefined>;
  isActive: boolean;
  isPublic: boolean;
  isStackable: boolean;
  terms: string;
}

type Action =
  | { type: "set"; patch: Partial<WizardState> }
  | { type: "reset" }
  | { type: "next" }
  | { type: "back" };

const ALL_DOW = ["mo", "tu", "we", "th", "fr", "sa", "su"];
const DOW_LABEL: Record<string, string> = { mo: "Mo", tu: "Tu", we: "We", th: "Th", fr: "Fr", sa: "Sa", su: "Su" };

const initialState: WizardState = {
  step: 0,
  dealType: "last_minute",
  specialType: "discount",
  name: "",
  description: "",
  leadDaysMin: "30",
  leadDaysMax: "3",
  leadHoursMax: "",
  lastMinuteUnit: "days",
  minStay: "",
  maxStay: "",
  audience: "everyone",
  discountPercent: "10",
  fixedAmount: "",
  fixedPrice: "",
  validFrom: "",
  validTo: "",
  extraRanges: [],
  dow: [...ALL_DOW],
  roomIds: [],
  ratePlanIds: [],
  roundingMode: "none",
  pricePointing: "none",
  policyChoice: "inherit",
  policyId: null,
  copyTargets: {},
  isActive: true,
  isPublic: true,
  isStackable: false,
  terms: "",
};

function reducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case "set":
      return { ...state, ...action.patch };
    case "next":
      return { ...state, step: state.step + 1 };
    case "back":
      return { ...state, step: Math.max(0, state.step - 1) };
    case "reset":
      return { ...initialState };
    default:
      return state;
  }
}

const DEAL_CARDS: Array<{ value: DealType; icon: React.ElementType; blurb: string }> = [
  { value: "last_minute", icon: Timer, blurb: "Fill empty rooms — for guests booking a few days or hours before check-in." },
  { value: "advance_purchase", icon: CalendarClock, blurb: "Early booker deal — for guests booking well before check-in." },
  { value: "long_stay", icon: CalendarDays, blurb: "Reward longer stays with a discount from a minimum number of nights." },
  { value: "basic", icon: Percent, blurb: "A straightforward discount over a stay period." },
  { value: "package", icon: Gift, blurb: "Bundle inclusions into a package offer." },
];

const STEP_TITLES = [
  "Deal type",
  "Bookable period",
  "Audience & discount",
  "Stay dates",
  "Applies to",
  "Cancellation policy",
  "Copy to properties",
  "Review",
];

export const SpecialWizard: React.FC<SpecialWizardProps> = ({
  open,
  onOpenChange,
  propertyId,
  category,
  roomTypes = [],
  onSaved,
}) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [ratePlans, setRatePlans] = useState<RatePlanOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [policyEditorOpen, setPolicyEditorOpen] = useState(false);

  const { policies, links, createPolicy, setLinksFor, refetch: refetchPolicies } =
    useReservationPolicies(propertyId);
  const { siblings } = usePortfolioSiblings(propertyId);
  const siblingIds = useMemo(() => siblings.map((s) => s.id), [siblings]);
  const { portfolioPolicies } = usePortfolioPolicies(propertyId, siblingIds);

  useEffect(() => {
    if (open) dispatch({ type: "reset" });
  }, [open]);

  useEffect(() => {
    if (!open || !propertyId) return;
    supabase
      .from("rolos_rate_plans")
      .select("id, name")
      .eq("property_id", propertyId)
      .then(({ data }) => setRatePlans((data ?? []) as RatePlanOption[]));
  }, [open, propertyId]);

  const set = (patch: Partial<WizardState>) => dispatch({ type: "set", patch });

  const masterPolicy = policies.find((p) => p.is_master) ?? policies.find((p) => p.is_default) ?? null;

  const selectablePolicies: Array<ReservationPolicy & { external?: boolean }> = useMemo(
    () => [
      ...policies,
      ...portfolioPolicies.map((p) => ({ ...p, external: true })),
    ],
    [policies, portfolioPolicies],
  );

  const toggleIn = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const stepValid = (): boolean => {
    switch (state.step) {
      case 0:
        return !!state.dealType;
      case 1:
        if (state.dealType === "advance_purchase") return Number(state.leadDaysMin) > 0;
        if (state.dealType === "last_minute")
          return state.lastMinuteUnit === "days" ? Number(state.leadDaysMax) > 0 : Number(state.leadHoursMax) > 0;
        if (state.dealType === "long_stay") return Number(state.minStay) > 1;
        return true;
      case 2:
        if (state.specialType === "discount") {
          const pct = Number(state.discountPercent);
          return pct >= 1 && pct <= 99;
        }
        if (state.specialType === "fixed_off") return Number(state.fixedAmount) > 0;
        if (state.specialType === "fixed_price") return Number(state.fixedPrice) > 0;
        return true;
      case 3:
        return !!state.validFrom && !!state.validTo && state.dow.length > 0;
      case 7:
        return state.name.trim().length > 0;
      default:
        return true;
    }
  };

  const isLast = state.step === STEP_TITLES.length - 1;

  const buildPayload = (targetPropertyId: string, policyId: string | null) => ({
    property_id: targetPropertyId,
    category,
    name: state.name.trim(),
    description: state.description.trim() || null,
    deal_type: state.dealType,
    special_type: state.specialType,
    discount_percent: state.specialType === "discount" ? Number(state.discountPercent) : null,
    fixed_amount: state.specialType === "fixed_off" ? Number(state.fixedAmount) : null,
    fixed_price: state.specialType === "fixed_price" ? Number(state.fixedPrice) : null,
    currency: "ZAR",
    valid_from: state.validFrom || null,
    valid_to: state.validTo || null,
    stay_date_ranges: state.extraRanges,
    lead_days_min: state.dealType === "advance_purchase" && state.leadDaysMin ? Number(state.leadDaysMin) : null,
    lead_days_max:
      state.dealType === "last_minute" && state.lastMinuteUnit === "days" && state.leadDaysMax
        ? Number(state.leadDaysMax)
        : null,
    lead_hours_max:
      state.dealType === "last_minute" && state.lastMinuteUnit === "hours" && state.leadHoursMax
        ? Number(state.leadHoursMax)
        : null,
    min_stay: state.minStay ? Number(state.minStay) : null,
    max_stay: state.maxStay ? Number(state.maxStay) : null,
    dow_mask: state.dow.length === 7 ? null : state.dow,
    audience: state.audience,
    is_stackable: state.isStackable,
    rounding_mode: state.roundingMode === "none" ? null : state.roundingMode,
    price_pointing: state.pricePointing === "none" ? null : state.pricePointing,
    applicable_room_ids: state.roomIds.length ? state.roomIds : null,
    applicable_rate_plan_ids: state.ratePlanIds.length ? state.ratePlanIds : null,
    cancellation_policy_id: policyId,
    terms: state.terms.trim() || null,
    is_active: state.isActive,
    is_public: state.isPublic,
  });

  /** Ensure the chosen policy exists on the target property; copy or link when it belongs elsewhere. */
  const resolvePolicyForProperty = async (
    targetPropertyId: string,
    mode: CopyMode,
  ): Promise<string | null> => {
    if (state.policyChoice !== "existing" || !state.policyId) return null;
    const source = selectablePolicies.find((p) => p.id === state.policyId);
    if (!source) return null;
    if (source.property_id === targetPropertyId) return source.id;

    const { data: existing } = await supabase
      .from("rolos_reservation_policies")
      .select("id")
      .eq("property_id", targetPropertyId)
      .eq("name", source.name)
      .maybeSingle();
    if (existing?.id) return existing.id as string;

    const { data, error } = await supabase
      .from("rolos_reservation_policies")
      .insert({
        property_id: targetPropertyId,
        name: source.name,
        description: source.description,
        kind: source.kind,
        rule: source.rule as never,
        is_default: false,
        is_master: false,
        scope: "property",
        source_policy_id: source.id,
        linked_master_id: mode === "link" ? source.id : null,
      } as never)
      .select("id")
      .single();
    if (error) {
      console.error("[SpecialWizard] policy copy failed", error);
      return null;
    }
    return (data as { id: string }).id;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const ownPolicyId = await resolvePolicyForProperty(propertyId, "copy");
      const { error } = await supabase
        .from("property_specials" as never)
        .insert(buildPayload(propertyId, ownPolicyId) as never);
      if (error) throw error;

      const targets = Object.entries(state.copyTargets).filter(([, mode]) => !!mode) as Array<[string, CopyMode]>;
      let copied = 0;
      for (const [targetId, mode] of targets) {
        const policyId = await resolvePolicyForProperty(targetId, mode);
        const { error: copyError } = await supabase
          .from("property_specials" as never)
          .insert(buildPayload(targetId, policyId) as never);
        if (copyError) console.error("[SpecialWizard] copy to property failed", targetId, copyError);
        else copied++;
      }

      void queueChannelDiscountSync(propertyId, "special_created");
      for (const [targetId] of targets) void queueChannelDiscountSync(targetId, "special_copied");

      toast.success(copied ? `Special created and copied to ${copied} propert${copied === 1 ? "y" : "ies"}` : "Special created");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Failed to create special: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleInlinePolicySave = async (
    input: Omit<ReservationPolicy, "id" | "property_id" | "created_at" | "updated_at">,
    ratePlanIds: string[],
    channels: string[],
  ) => {
    const created = await createPolicy(input);
    if (created?.id) {
      await setLinksFor(created.id, ratePlanIds, channels);
      await refetchPolicies();
      set({ policyChoice: "existing", policyId: created.id });
    }
  };

  const summaryLine = () => {
    if (state.dealType === "last_minute") {
      return state.lastMinuteUnit === "days"
        ? `Bookable up to ${state.leadDaysMax || 0} days before check-in`
        : `Bookable up to ${state.leadHoursMax || 0} hours before check-in`;
    }
    if (state.dealType === "advance_purchase") return `Bookable at least ${state.leadDaysMin || 0} days before check-in`;
    if (state.dealType === "long_stay") return `Stays of ${state.minStay || 0} nights or more`;
    return "Applies to any booking within the stay dates";
  };

  const renderStep = () => {
    switch (state.step) {
      case 0:
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {DEAL_CARDS.map((card) => {
              const Icon = card.icon;
              const active = state.dealType === card.value;
              return (
                <button
                  key={card.value}
                  type="button"
                  onClick={() =>
                    set({
                      dealType: card.value,
                      specialType: card.value === "package" ? "package" : state.specialType,
                    })
                  }
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    active ? "border-primary bg-muted" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold">{DEAL_TYPE_LABELS[card.value]}</span>
                    {active && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{card.blurb}</p>
                </button>
              );
            })}
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">How long before check-in can this promotion be booked?</p>
            {state.dealType === "advance_purchase" && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={state.leadDaysMin}
                  onChange={(e) => set({ leadDaysMin: e.target.value })}
                  className="h-8 text-xs w-24"
                />
                <span className="text-xs">days minimum before check-in</span>
              </div>
            )}

            {state.dealType === "last_minute" && (
              <RadioGroup
                value={state.lastMinuteUnit}
                onValueChange={(v) => set({ lastMinuteUnit: v as "days" | "hours" })}
                className="space-y-2"
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="days" />
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={state.leadDaysMax}
                    disabled={state.lastMinuteUnit !== "days"}
                    onChange={(e) => set({ leadDaysMax: e.target.value })}
                    className="h-8 text-xs w-20"
                  />
                  <span className="text-xs">days maximum before check-in</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="hours" />
                  <Input
                    type="number"
                    min={1}
                    max={72}
                    value={state.leadHoursMax}
                    disabled={state.lastMinuteUnit !== "hours"}
                    onChange={(e) => set({ leadHoursMax: e.target.value })}
                    className="h-8 text-xs w-20"
                  />
                  <span className="text-xs">hours maximum before check-in</span>
                </label>
              </RadioGroup>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Minimum nights</Label>
                <Input
                  type="number"
                  min={0}
                  value={state.minStay}
                  onChange={(e) => set({ minStay: e.target.value })}
                  className="h-8 text-xs"
                  placeholder={state.dealType === "long_stay" ? "e.g. 7" : "Optional"}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Maximum nights</Label>
                <Input
                  type="number"
                  min={0}
                  value={state.maxStay}
                  onChange={(e) => set({ maxStay: e.target.value })}
                  className="h-8 text-xs"
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> Who will be able to see this promotion?
              </Label>
              <RadioGroup
                value={state.audience}
                onValueChange={(v) => set({ audience: v as "everyone" | "subscribers" })}
                className="space-y-1.5"
              >
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <RadioGroupItem value="everyone" /> Everyone
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <RadioGroupItem value="subscribers" /> Members and newsletter subscribers only — secret deal
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">How much of a discount would you like to offer?</Label>
              <Select
                value={state.specialType}
                onValueChange={(v) => set({ specialType: v as WizardState["specialType"] })}
              >
                <SelectTrigger className="h-8 text-xs w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="discount">Percentage discount</SelectItem>
                  <SelectItem value="fixed_off">Fixed amount off</SelectItem>
                  <SelectItem value="fixed_price">Fixed nightly price</SelectItem>
                  <SelectItem value="package">Package (inclusions)</SelectItem>
                </SelectContent>
              </Select>

              {state.specialType === "discount" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    value={state.discountPercent}
                    onChange={(e) => set({ discountPercent: e.target.value })}
                    className="h-8 text-xs w-24"
                  />
                  <span className="text-xs text-muted-foreground">% — set a discount between 1% and 99%</span>
                </div>
              )}
              {state.specialType === "fixed_off" && (
                <Input
                  type="number"
                  min={1}
                  value={state.fixedAmount}
                  onChange={(e) => set({ fixedAmount: e.target.value })}
                  className="h-8 text-xs w-32"
                  placeholder="Amount off"
                />
              )}
              {state.specialType === "fixed_price" && (
                <Input
                  type="number"
                  min={1}
                  value={state.fixedPrice}
                  onChange={(e) => set({ fixedPrice: e.target.value })}
                  className="h-8 text-xs w-32"
                  placeholder="Price per night"
                />
              )}
            </div>

            <div className="flex items-center justify-between p-2 rounded-md bg-muted/40">
              <div>
                <Label className="text-xs font-medium">Can stack with other specials</Label>
                <p className="text-xs text-muted-foreground">
                  Off by default — guests choose one offer when several qualify.
                </p>
              </div>
              <Switch checked={state.isStackable} onCheckedChange={(v) => set({ isStackable: v })} />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Stays start on</Label>
                <Input
                  type="date"
                  value={state.validFrom}
                  onChange={(e) => set({ validFrom: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Stays end on</Label>
                <Input
                  type="date"
                  value={state.validTo}
                  onChange={(e) => set({ validTo: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">
                Which day(s) of the week would you like to include in this promotion?
              </Label>
              <div className="flex flex-wrap gap-3">
                {ALL_DOW.map((d) => (
                  <label key={d} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox checked={state.dow.includes(d)} onCheckedChange={() => set({ dow: toggleIn(state.dow, d) })} />
                    {DOW_LABEL[d]}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Additional stay date ranges</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => set({ extraRanges: [...state.extraRanges, { start: "", end: "" }] })}
                >
                  Add a new date range
                </Button>
              </div>
              {state.extraRanges.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={r.start}
                    onChange={(e) => {
                      const next = [...state.extraRanges];
                      next[i] = { ...next[i], start: e.target.value };
                      set({ extraRanges: next });
                    }}
                    className="h-8 text-xs"
                  />
                  <Input
                    type="date"
                    value={r.end}
                    onChange={(e) => {
                      const next = [...state.extraRanges];
                      next[i] = { ...next[i], end: e.target.value };
                      set({ extraRanges: next });
                    }}
                    className="h-8 text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-destructive"
                    onClick={() => set({ extraRanges: state.extraRanges.filter((_, idx) => idx !== i) })}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>

            {state.validFrom && state.validTo && (
              <div className="p-2 rounded-md bg-muted/50 text-xs">
                Your discount will apply to stays between <strong>{state.validFrom}</strong> and{" "}
                <strong>{state.validTo}</strong>. {summaryLine()}.
              </div>
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Rooms / unit types</Label>
              {roomTypes.length === 0 ? (
                <p className="text-xs text-muted-foreground">All rooms (no room types loaded).</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {roomTypes.map((rt) => {
                    const active = state.roomIds.includes(rt.id);
                    return (
                      <button key={rt.id} type="button" onClick={() => set({ roomIds: toggleIn(state.roomIds, rt.id) })}>
                        <Badge variant={active ? "default" : "outline"} className="text-xs cursor-pointer">
                          {rt.name}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Leave empty to apply to all rooms.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Rate plans</Label>
              {ratePlans.length === 0 ? (
                <p className="text-xs text-muted-foreground">All rate plans (none configured).</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {ratePlans.map((rp) => {
                    const active = state.ratePlanIds.includes(rp.id);
                    return (
                      <button
                        key={rp.id}
                        type="button"
                        onClick={() => set({ ratePlanIds: toggleIn(state.ratePlanIds, rp.id) })}
                      >
                        <Badge variant={active ? "default" : "outline"} className="text-xs cursor-pointer">
                          {rp.name}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Round to the nearest</Label>
                <Select value={state.roundingMode} onValueChange={(v) => set({ roundingMode: v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Please select</SelectItem>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Price pointing</Label>
                <Select value={state.pricePointing} onValueChange={(v) => set({ pricePointing: v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="0.99">End in .99</SelectItem>
                    <SelectItem value="0.95">End in .95</SelectItem>
                    <SelectItem value="0.5">End in .50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Optionally attach a cancellation policy to this special. If you skip this, the property master policy
              applies{masterPolicy ? ` — currently "${masterPolicy.name}"` : " (none set yet)"}.
            </p>
            <RadioGroup
              value={state.policyChoice}
              onValueChange={(v) => set({ policyChoice: v as "inherit" | "existing" })}
              className="space-y-2"
            >
              <label className="flex items-start gap-2 cursor-pointer">
                <RadioGroupItem value="inherit" className="mt-0.5" />
                <div>
                  <div className="text-xs font-medium">Use the property master policy</div>
                  <p className="text-xs text-muted-foreground">
                    {masterPolicy
                      ? formatCancellationPolicy(masterPolicy.rule).summaryText
                      : "No master policy set — create one in the Policies tab."}
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <RadioGroupItem value="existing" className="mt-0.5" />
                <div className="text-xs font-medium">Attach a specific policy</div>
              </label>
            </RadioGroup>

            {state.policyChoice === "existing" && (
              <div className="space-y-2 pl-6">
                <Select value={state.policyId ?? ""} onValueChange={(v) => set({ policyId: v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select a policy" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectablePolicies.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name}
                        {p.external ? " (portfolio)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setPolicyEditorOpen(true)}
                >
                  <ShieldCheck className="h-3 w-3 mr-1" /> Create a new policy
                </Button>
                {state.policyId && (
                  <p className="text-xs text-muted-foreground">
                    {formatCancellationPolicy(
                      selectablePolicies.find((p) => p.id === state.policyId)?.rule ?? {},
                    ).summaryText}
                  </p>
                )}
              </div>
            )}
          </div>
        );

      case 6:
        return (
          <div className="space-y-3">
            {siblings.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                This property is not part of a portfolio, so there is nothing to copy to.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Which portfolio properties should also get this special? Choose how any attached policy travels.
                </p>
                {siblings.map((s) => {
                  const mode = state.copyTargets[s.id];
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-2 p-2 rounded-md border">
                      <label className="flex items-center gap-2 text-xs cursor-pointer flex-1">
                        <Checkbox
                          checked={!!mode}
                          onCheckedChange={() =>
                            set({ copyTargets: { ...state.copyTargets, [s.id]: mode ? undefined : "copy" } })
                          }
                        />
                        {s.name}
                      </label>
                      {mode && (
                        <Select
                          value={mode}
                          onValueChange={(v) => set({ copyTargets: { ...state.copyTargets, [s.id]: v as CopyMode } })}
                        >
                          <SelectTrigger className="h-7 text-xs w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="copy" className="text-xs">Independent copy</SelectItem>
                            <SelectItem value="link" className="text-xs">Linked to master</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );

      default:
        return (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Promotion name</Label>
              <Input
                value={state.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder={`${DEAL_TYPE_LABELS[state.dealType]} Deal`}
                className="h-8 text-xs"
              />
              <p className="text-xs text-muted-foreground">This name is for you — guests see the offer label.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Guest-facing description</Label>
              <Textarea
                value={state.description}
                onChange={(e) => set({ description: e.target.value })}
                className="text-xs min-h-[60px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Terms shown to guests</Label>
              <Textarea
                value={state.terms}
                onChange={(e) => set({ terms: e.target.value })}
                className="text-xs min-h-[60px]"
              />
            </div>

            <div className="rounded-md border p-3 space-y-1 text-xs">
              <div className="font-semibold flex items-center gap-1">
                <Tag className="h-3.5 w-3.5" /> {DEAL_TYPE_LABELS[state.dealType]}
              </div>
              <div className="text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> {summaryLine()}
              </div>
              <div className="text-muted-foreground">
                {state.specialType === "discount" && `${state.discountPercent}% off`}
                {state.specialType === "fixed_off" && `${state.fixedAmount} off`}
                {state.specialType === "fixed_price" && `Fixed nightly rate ${state.fixedPrice}`}
                {state.specialType === "package" && "Package offer"}
                {state.validFrom && state.validTo ? ` · stays ${state.validFrom} → ${state.validTo}` : ""}
              </div>
              <div className="text-muted-foreground">
                Cancellation:{" "}
                {state.policyChoice === "existing" && state.policyId
                  ? selectablePolicies.find((p) => p.id === state.policyId)?.name
                  : `property master${masterPolicy ? ` (${masterPolicy.name})` : ""}`}
              </div>
              <div className="text-muted-foreground">
                Audience: {state.audience === "everyone" ? "Everyone" : "Subscribers only"} ·{" "}
                {state.isStackable ? "Stackable" : "One-of-N offer"}
              </div>
              {Object.values(state.copyTargets).filter(Boolean).length > 0 && (
                <div className="text-muted-foreground">
                  Also copied to {Object.values(state.copyTargets).filter(Boolean).length} portfolio propert
                  {Object.values(state.copyTargets).filter(Boolean).length === 1 ? "y" : "ies"}
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={state.isActive} onCheckedChange={(v) => set({ isActive: v })} /> Active
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={state.isPublic} onCheckedChange={(v) => set({ isPublic: v })} /> Show publicly
              </label>
            </div>
          </div>
        );
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              Create a {DEAL_TYPE_LABELS[state.dealType].toLowerCase()} deal
            </DialogTitle>
            <DialogDescription className="text-xs">
              Step {state.step + 1} of {STEP_TITLES.length} — {STEP_TITLES[state.step]}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-1 mb-1">
            {STEP_TITLES.map((t, i) => (
              <div
                key={t}
                className={`h-1 flex-1 rounded-full ${i <= state.step ? "bg-primary" : "bg-muted"}`}
                aria-hidden
              />
            ))}
          </div>

          <div className="py-1">{renderStep()}</div>

          <DialogFooter className="gap-2">
            {state.step > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => dispatch({ type: "back" })} className="h-8 text-xs">
                Back
              </Button>
            )}
            {!isLast ? (
              <Button
                type="button"
                size="sm"
                onClick={() => dispatch({ type: "next" })}
                disabled={!stepValid()}
                className="h-8 text-xs"
              >
                Continue
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={handleSave} disabled={!stepValid() || saving} className="h-8 text-xs">
                {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Create special
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReservationPolicyDialog
        open={policyEditorOpen}
        onOpenChange={setPolicyEditorOpen}
        propertyId={propertyId}
        policy={null}
        existingLinks={links}
        onSave={handleInlinePolicySave}
      />
    </>
  );
};
