import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save } from "lucide-react";
import { BREAKFAST_BASIS_LABELS, normalizeBreakfastBasis } from "@/components/charges/ChargeCalculator";
import { useReservationPolicies } from "@/hooks/useReservationPolicies";
import { RatePlanSeasonPricingTable } from "./RatePlanSeasonPricingTable";
import { RatePlanUnitsSection } from "./RatePlanUnitsSection";
import { RatePlanEffectivePreview } from "./RatePlanEffectivePreview";
import {
  draftToPayload,
  emptyDraft,
  ratePlanDraftReducer,
  readCalendarSeasons,
  readLegacySeasonRates,
  type CalendarSeason,
  type DifferentialType,
  type DraftSeasonRate,
  type RatePlanDraft,
} from "./ratePlanDraft";


const PRICING_MODELS = [
  { value: "per_room", label: "Per room", desc: "Flat rate per room per night" },
  { value: "per_person", label: "Per person", desc: "Rate x guests x nights" },
  { value: "per_person_sharing", label: "Per person sharing", desc: "Base for 2 guests, extra per additional" },
  { value: "per_unit", label: "Per unit", desc: "Rate x units x nights" },
];

interface Props {
  propertyId: string;
  propertyName?: string;
  ratePlanId: string | null;
  roomTypes: { id: string; name: string }[];
  onSaved: () => void;
  onCancel: () => void;
}

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export function RatePlanEditor({ propertyId, propertyName, ratePlanId, roomTypes, onSaved, onCancel }: Props) {
  const [draft, dispatch] = useReducer(ratePlanDraftReducer, emptyDraft());
  const [seasons, setSeasons] = useState<CalendarSeason[]>([]);
  const [legacySeasonRates, setLegacySeasonRates] = useState<Map<string, number[]>>(() => new Map());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { policies } = useReservationPolicies(propertyId);

  const setField = useCallback(
    <K extends keyof RatePlanDraft>(key: K, value: RatePlanDraft[K]) =>
      dispatch({ type: "field", key, value: value as RatePlanDraft[keyof RatePlanDraft] }),
    [],
  );
  const onSeasonChange = useCallback(
    (calendarSeasonId: string, patch: Partial<DraftSeasonRate>) =>
      dispatch({ type: "season", calendarSeasonId, patch }),
    [],
  );
  const onToggleUnit = useCallback((roomTypeId: string) => dispatch({ type: "toggle_unit", roomTypeId }), []);
  const onUnitDifferential = useCallback(
    (roomTypeId: string, patch: { differential_type?: DifferentialType; differential_value?: string }) =>
      dispatch({ type: "unit_differential", roomTypeId, ...patch }),
    [],
  );

  // Load Calendar seasons (read-only) plus the plan being edited.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const [{ data: property }, seasonRows] = await Promise.all([
        supabase.from("properties").select("amenities").eq("id", propertyId).maybeSingle(),
        supabase.from("rolos_shared_seasons").select("id, calendar_season_id").eq("property_id", propertyId),
      ]);
      const calendarSeasons = readCalendarSeasons(property?.amenities);
      const legacyRates = readLegacySeasonRates(property?.amenities, ratePlanId);

      const calendarIdBySharedId = new Map<string, string>(
        (seasonRows.data ?? [])
          .filter((r) => r.calendar_season_id)
          .map((r) => [String(r.id), String(r.calendar_season_id)]),
      );

      let next = emptyDraft();

      if (ratePlanId) {
        const [{ data: plan }, { data: links }, { data: seasonRates }, { data: policyLink }] = await Promise.all([
          supabase.from("rolos_rate_plans").select("*").eq("id", ratePlanId).maybeSingle(),
          supabase
            .from("rolos_rate_plan_room_types")
            .select("room_type_id, differential_type, differential_value")
            .eq("rate_plan_id", ratePlanId),
          supabase
            .from("rolos_rate_plan_season_rates")
            .select("shared_season_id, base_rate, differential_type, differential_value, extra_adult_rate")
            .eq("rate_plan_id", ratePlanId)
            .is("deleted_at", null),
          supabase.from("rolos_policy_rate_links").select("policy_id").eq("rate_plan_id", ratePlanId).maybeSingle(),
        ]);

        if (plan) {
          next = {
            ...next,
            rate_plan_id: ratePlanId,
            name: str(plan.name),
            code: str(plan.code),
            description: str(plan.description),
            pricing_model: str(plan.pricing_model) || "per_room",
            base_rate: str(plan.base_rate),
            is_active: plan.is_active !== false,
            min_stay: str(plan.min_stay ?? 1),
            max_stay: str(plan.max_stay),
            min_advance_days: str(plan.min_advance_days),
            max_advance_days: str(plan.max_advance_days),
            requires_deposit: !!plan.requires_deposit,
            breakfast_included: !!plan.breakfast_included,
            breakfast_amount: str(plan.breakfast_amount),
            breakfast_basis: normalizeBreakfastBasis(plan.breakfast_basis) ?? "per_person_per_night",
            policy_id: policyLink?.policy_id ?? null,
            units: (links ?? []).map((l) => ({
              room_type_id: String(l.room_type_id),
              differential_type: (l.differential_type as DifferentialType) ?? "none",
              differential_value: str(l.differential_value),
            })),
            season_rates: (seasonRates ?? [])
              .map((sr) => {
                const calendarSeasonId = calendarIdBySharedId.get(String(sr.shared_season_id ?? ""));
                if (!calendarSeasonId) return null;
                const isDifferential = sr.differential_type && sr.differential_type !== "none";
                return {
                  calendar_season_id: calendarSeasonId,
                  mode: isDifferential ? "differential" : "absolute",
                  base_rate: str(sr.base_rate),
                  differential_type: (isDifferential ? sr.differential_type : "amount") as "amount" | "percent",
                  differential_value: str(sr.differential_value),
                  extra_adult_rate: str(sr.extra_adult_rate),
                } as DraftSeasonRate;
              })
              .filter((s): s is DraftSeasonRate => s !== null),
          };
        }
      } else {
        // A brand-new plan sells every unit by default — the common case.
        next = { ...next, units: roomTypes.map((rt) => ({ room_type_id: rt.id, differential_type: "none", differential_value: "" })) };
      }

      if (cancelled) return;
      setSeasons(calendarSeasons);
      dispatch({ type: "reset", draft: next });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId, ratePlanId, roomTypes]);

  // Mirror the Calendar's seasons into the shared season table so saves can reference them.
  useEffect(() => {
    if (!propertyId) return;
    void supabase.functions.invoke("rolos-rate-plans", {
      body: { action: "sync_seasons", property_id: propertyId },
    });
  }, [propertyId]);

  const pricedSeasons = useMemo(() => draft.season_rates.filter((s) => s.mode !== "none").length, [draft.season_rates]);

  const handleSave = useCallback(async () => {
    if (!draft.name.trim()) {
      toast.error("Give the rate plan a name");
      return;
    }
    if (draft.units.length === 0) {
      toast.error("Link at least one unit to this rate plan");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("rolos-rate-plans", {
      body: { action: "save_plan", property_id: propertyId, draft: draftToPayload(draft) },
    });
    setSaving(false);
    const failure = (data as { error?: string } | null)?.error || error?.message;
    if (failure) {
      toast.error(failure);
      return;
    }
    toast.success(ratePlanId ? "Rate plan updated" : "Rate plan created");
    onSaved();
  }, [draft, propertyId, ratePlanId, onSaved]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. Basics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1. Basics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rp-name">Name</Label>
            <Input
              id="rp-name"
              value={draft.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="e.g. Standard Rate"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-code">Short code (optional)</Label>
            <Input id="rp-code" value={draft.code} onChange={(e) => setField("code", e.target.value)} placeholder="STD" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="rp-desc">Description</Label>
            <Textarea
              id="rp-desc"
              rows={2}
              value={draft.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="Shown to guests during checkout"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Pricing model</Label>
            <Select value={draft.pricing_model} onValueChange={(v) => setField("pricing_model", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRICING_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label} — <span className="text-muted-foreground">{m.desc}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-base">Base nightly rate</Label>
            <Input
              id="rp-base"
              type="number"
              min={0}
              inputMode="decimal"
              value={draft.base_rate}
              onChange={(e) => setField("base_rate", e.target.value)}
              placeholder="Used whenever no season is priced"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cancellation policy</Label>
            <Select
              value={draft.policy_id ?? "none"}
              onValueChange={(v) => setField("policy_id", v === "none" ? null : v)}
            >
              <SelectTrigger><SelectValue placeholder="Property default" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Property default</SelectItem>
                {policies.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-6">
            <label className="flex items-center gap-2">
              <Switch checked={draft.is_active} onCheckedChange={(v) => setField("is_active", v)} />
              <span className="text-sm">Active</span>
            </label>
            <label className="flex items-center gap-2">
              <Switch checked={draft.requires_deposit} onCheckedChange={(v) => setField("requires_deposit", v)} />
              <span className="text-sm">Deposit required</span>
            </label>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="flex items-center gap-2">
              <Switch checked={draft.breakfast_included} onCheckedChange={(v) => setField("breakfast_included", v)} />
              <span className="text-sm">Breakfast included in the rate</span>
            </label>
            {draft.breakfast_included && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rp-bf">Breakfast value</Label>
                  <Input
                    id="rp-bf"
                    type="number"
                    min={0}
                    inputMode="decimal"
                    value={draft.breakfast_amount}
                    onChange={(e) => setField("breakfast_amount", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Charged</Label>
                  <Select value={draft.breakfast_basis} onValueChange={(v) => setField("breakfast_basis", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(BREAKFAST_BASIS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2. Pricing by Season */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            2. Pricing by season {pricedSeasons > 0 && <span className="text-muted-foreground">({pricedSeasons} priced)</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RatePlanSeasonPricingTable draft={draft} seasons={seasons} onChange={onSeasonChange} />
        </CardContent>
      </Card>

      {/* 3. Restrictions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">3. Restrictions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="rp-min">Minimum stay (nights)</Label>
            <Input id="rp-min" type="number" min={1} value={draft.min_stay} onChange={(e) => setField("min_stay", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-max">Maximum stay</Label>
            <Input id="rp-max" type="number" min={1} value={draft.max_stay} onChange={(e) => setField("max_stay", e.target.value)} placeholder="No limit" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-minadv">Book at least (days ahead)</Label>
            <Input id="rp-minadv" type="number" min={0} value={draft.min_advance_days} onChange={(e) => setField("min_advance_days", e.target.value)} placeholder="Any time" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-maxadv">Book at most (days ahead)</Label>
            <Input id="rp-maxadv" type="number" min={0} value={draft.max_advance_days} onChange={(e) => setField("max_advance_days", e.target.value)} placeholder="No limit" />
          </div>
        </CardContent>
      </Card>

      {/* 4. Linked Units */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">4. Linked units ({draft.units.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <RatePlanUnitsSection
            draft={draft}
            roomTypes={roomTypes}
            onToggle={onToggleUnit}
            onDifferential={onUnitDifferential}
          />
        </CardContent>
      </Card>

      {/* 5. Live preview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">5. Effective rates {propertyName ? `— ${propertyName}` : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          <RatePlanEffectivePreview propertyId={propertyId} draft={draft} />
        </CardContent>
      </Card>

      <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background py-3">
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {ratePlanId ? "Save changes" : "Create rate plan"}
        </Button>
      </div>
    </div>
  );
}
