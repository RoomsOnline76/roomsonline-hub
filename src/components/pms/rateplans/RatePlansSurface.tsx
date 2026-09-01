import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus, TrendingUp, Pencil, DollarSign, Trash2, Building2, Ban, CalendarRange, Copy, BedDouble,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { pushRatePlanRates } from "@/lib/channelSavePush";
import { RatePlanStopSellDialog } from "@/components/restrictions/RatePlanStopSellDialog";
import { PackagesManager } from "@/components/pms/packages/PackagesManager";
import { BREAKFAST_BASIS_LABELS } from "@/components/charges/ChargeCalculator";
import { RatePlanEditor } from "@/components/pms/rateplans/RatePlanEditor";
import { RatePlanSyncToOthersDialog } from "@/components/pms/rateplans/RatePlanSyncToOthersDialog";
import { PropertyLegacyRatesBanner } from "@/components/pms/rateplans/PropertyLegacyRatesBanner";
import { RatePlanRateMatrix } from "@/components/pms/rateplans/RatePlanRateMatrix";
import { RatePlanExtrasSummary } from "@/components/pms/rateplans/RatePlanExtrasSummary";

import { type SeasonRateRow } from "@/components/pms/rateplans/RatePlanSeasonGrid";

import { buildSeasonColorMap, type SeasonColorMap } from "@/lib/seasonColors";
import { canonicalPricingModel, pricingNoun } from "@/components/pms/rateplans/ratePlanDraft";

export const PRICING_MODELS = [
  { value: "per_room", label: "Per Room", suffix: "/room", desc: "Flat rate per room per night" },
  { value: "per_person", label: "Per Person", suffix: "/pp", desc: "Rate × guests × nights" },
  { value: "per_person_sharing", label: "Per Person Sharing", suffix: "/pps", desc: "Base for 2 guests, extra per additional" },
  { value: "per_unit", label: "Per Unit", suffix: "/unit", desc: "Rate × units × nights" },
] as const;

export interface RatePlan {
  id: string;
  property_id: string;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  min_stay: number;
  max_stay: number | null;
  min_advance_days: number | null;
  requires_deposit: boolean;
  deposit_percentage: number | null;
  base_rate: number | null;
  pricing_model: string;
  breakfast_included: boolean | null;
  breakfast_amount: number | null;
  breakfast_basis: string | null;
  is_primary_sell?: boolean | null;
  push_to_channels?: boolean | null;
  sell_priority?: number | null;
  los_enabled?: boolean | null;
  fsp_enabled?: boolean | null;
}

interface RoomType {
  id: string;
  property_id: string;
  name: string;
}

interface RatePlanRoomLink {
  rate_plan_id: string;
  room_type_id: string;
}

export interface RatePlansSurfaceHandle {
  refresh: () => void;
  openNewPlan: (propertyId?: string) => void;
}

export interface RatePlansSurfaceProps {
  /** Properties in scope. One entry = single-property mode, more = grouped sections. */
  properties: { id: string; name: string }[];
  /** Read-only mirror: no create / edit / delete / toggle / sync / stop-sell, and no writes at all. */
  readOnly?: boolean;
  /** Render the Packages manager under each property section. */
  showPackages?: boolean;
  /** Show a per-section heading (used by portfolio views). */
  showSectionHeadings?: boolean;
  /** Empty-state CTA replacement (e.g. the "Manage in ROL'OS" button). */
  emptyStateExtra?: React.ReactNode;
  onLoadingChange?: (loading: boolean) => void;
}

/**
 * Shared Rate Plans surface — the card list plus the full configurator.
 *
 * Used by the ROL'OS Rate Plans page (editable) and by Admin → Rates & Pricing
 * (editable for admin-managed properties, read-only for ROL'OS properties).
 */
export const RatePlansSurface = forwardRef<RatePlansSurfaceHandle, RatePlansSurfaceProps>(
  function RatePlansSurface(
    { properties, readOnly = false, showPackages = false, showSectionHeadings = false, emptyStateExtra, onLoadingChange },
    ref,
  ) {
    const [plans, setPlans] = useState<RatePlan[]>([]);
    const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
    const [links, setLinks] = useState<RatePlanRoomLink[]>([]);
    const [seasonCounts, setSeasonCounts] = useState<Record<string, number>>({});
    const [seasonRates, setSeasonRates] = useState<Record<string, { name: string; min: number; max: number }[]>>({});
    /** Raw authored season rates (plan-wide + per unit) powering the card grid. */
    const [seasonRateRows, setSeasonRateRows] = useState<SeasonRateRow[]>([]);
    /** Season name -> Calendar-authored colour, so cards match the Calendar. */
    const [seasonColors, setSeasonColors] = useState<SeasonColorMap>({});
    const [loading, setLoading] = useState(true);
    const [stopSellPlan, setStopSellPlan] = useState<RatePlan | null>(null);
    const [syncPlan, setSyncPlan] = useState<RatePlan | null>(null);
    const [editor, setEditor] = useState<{ propertyId: string; ratePlanId: string | null } | null>(null);

    const propertyIdsKey = useMemo(() => properties.map((p) => p.id).sort().join(","), [properties]);

    const fetchData = useCallback(async () => {
      const ids = propertyIdsKey ? propertyIdsKey.split(",") : [];
      if (ids.length === 0) {
        setPlans([]);
        setRoomTypes([]);
        setLinks([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      onLoadingChange?.(true);

      const [plansRes, roomTypesRes, propsRes] = await Promise.all([
        supabase
          .from("rolos_rate_plans")
          .select("id, property_id, name, code, description, is_active, min_stay, max_stay, min_advance_days, requires_deposit, deposit_percentage, base_rate, pricing_model, breakfast_included, breakfast_amount, breakfast_basis, is_primary_sell, push_to_channels, sell_priority, los_enabled, fsp_enabled")
          .in("property_id", ids)
          .is("deleted_at", null)
          .order("name"),
        supabase
          .from("rolos_room_types")
          .select("id, property_id, name")
          .in("property_id", ids)
          .eq("is_active", true)
          .order("name"),
        supabase.from("properties").select("id, amenities").in("id", ids),
      ]);

      // Season colours are authored in the Calendar (amenities.seasons[].color).
      const colorMap: SeasonColorMap = {};
      for (const row of (propsRes.data || []) as { amenities: unknown }[]) {
        const seasons = (row?.amenities as { seasons?: unknown } | null)?.seasons;
        if (Array.isArray(seasons)) Object.assign(colorMap, buildSeasonColorMap(seasons as never));
      }
      setSeasonColors(colorMap);

      const planIds = (plansRes.data || []).map((p: { id: string }) => p.id);
      const [linksRes, seasonRatesRes] = planIds.length
        ? await Promise.all([
            supabase.from("rolos_rate_plan_room_types").select("rate_plan_id, room_type_id").in("rate_plan_id", planIds),
            supabase
              .from("rolos_rate_plan_season_rates")
              .select("rate_plan_id, shared_season_id, room_type_id, base_rate, rolos_shared_seasons(name)")
              .in("rate_plan_id", planIds)
              .is("deleted_at", null),
          ])
        : [{ data: [] as RatePlanRoomLink[] }, { data: [] as { rate_plan_id: string }[] }];

      const counts: Record<string, number> = {};
      const rateSummary: Record<string, Record<string, { name: string; min: number; max: number }>> = {};
      type RawSeasonRateRow = {
        rate_plan_id: string;
        room_type_id?: string | null;
        base_rate: number | null;
        rolos_shared_seasons?: { name: string | null } | null;
      };
      const rawSeasonRates = (seasonRatesRes.data || []) as RawSeasonRateRow[];
      setSeasonRateRows(
        rawSeasonRates.map((row) => ({
          rate_plan_id: row.rate_plan_id,
          room_type_id: row.room_type_id ?? null,
          base_rate: row.base_rate,
          season_name: row.rolos_shared_seasons?.name ?? null,
        })),
      );
      for (const row of rawSeasonRates) {
        counts[row.rate_plan_id] = (counts[row.rate_plan_id] ?? 0) + 1;
        const name = row.rolos_shared_seasons?.name?.trim();
        const rate = Number(row.base_rate ?? 0);
        if (!name || !(rate > 0)) continue;
        const bucket = (rateSummary[row.rate_plan_id] ??= {});
        const hit = bucket[name];
        bucket[name] = hit
          ? { name, min: Math.min(hit.min, rate), max: Math.max(hit.max, rate) }
          : { name, min: rate, max: rate };
      }
      setSeasonRates(
        Object.fromEntries(
          Object.entries(rateSummary).map(([planId, byName]) => [
            planId,
            Object.values(byName).sort((a, b) => a.min - b.min),
          ]),
        ),
      );

      setPlans((plansRes.data || []) as RatePlan[]);
      setRoomTypes((roomTypesRes.data || []) as RoomType[]);
      setLinks((linksRes.data || []) as RatePlanRoomLink[]);
      setSeasonCounts(counts);
      setLoading(false);
      onLoadingChange?.(false);
      // onLoadingChange is intentionally excluded — parents pass inline callbacks.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [propertyIdsKey]);

    useEffect(() => {
      fetchData();
    }, [fetchData]);

    useImperativeHandle(
      ref,
      () => ({
        refresh: fetchData,
        openNewPlan: (propertyId?: string) => {
          if (readOnly) return;
          const target = propertyId ?? properties[0]?.id;
          if (target) setEditor({ propertyId: target, ratePlanId: null });
        },
      }),
      [fetchData, properties, readOnly],
    );

    const getLinkedRoomTypes = (planId: string) =>
      links.filter((l) => l.rate_plan_id === planId).map((l) => l.room_type_id);
    // Links can outlive a unit (renamed, archived or removed). Never leak the raw
    // UUID into the UI — show a neutral label instead.
    const getRoomTypeName = (id: string) => roomTypes.find((rt) => rt.id === id)?.name || "Archived unit";

    const handleToggleActive = async (plan: RatePlan) => {
      const { error } = await supabase
        .from("rolos_rate_plans")
        .update({ is_active: !plan.is_active })
        .eq("id", plan.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      // Activating or retiring a plan changes the sellable price at the channel.
      void pushRatePlanRates(plan.property_id, "rate_plan_toggle", { label: "Rates" });
      fetchData();
    };

    const handleDeletePlan = async (plan: RatePlan) => {
      await supabase.from("rolos_rate_plan_room_types").delete().eq("rate_plan_id", plan.id);
      await supabase.from("rolos_rate_plan_season_rates").delete().eq("rate_plan_id", plan.id);
      const { data: seasons } = await supabase.from("rolos_rate_seasons").select("id").eq("rate_plan_id", plan.id);
      if (seasons?.length) {
        await supabase.from("rolos_rate_prices").delete().in("season_id", seasons.map((s) => s.id));
        await supabase.from("rolos_rate_seasons").delete().eq("rate_plan_id", plan.id);
      }
      const { error } = await supabase.from("rolos_rate_plans").delete().eq("id", plan.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(`Rate plan "${plan.name}" deleted`);
      void pushRatePlanRates(plan.property_id, "rate_plan_delete", { label: "Rates" });
      fetchData();
    };

    const editorRoomTypes = useMemo(
      () =>
        editor
          ? roomTypes.filter((rt) => rt.property_id === editor.propertyId).map((rt) => ({ id: rt.id, name: rt.name }))
          : [],
      [editor, roomTypes],
    );

    const propertySections = useMemo(
      () => properties.map((p) => ({ id: p.id, name: p.name, plans: plans.filter((pl) => pl.property_id === p.id) })),
      [properties, plans],
    );

    const renderPlanCard = (plan: RatePlan) => {
      const linkedIds = getLinkedRoomTypes(plan.id).filter((id) => roomTypes.some((rt) => rt.id === id));
      const pricedSeasons = seasonCounts[plan.id] ?? 0;
      const planRateRows = seasonRateRows.filter((r) => r.rate_plan_id === plan.id);
      const gridUnits = linkedIds.map((id) => ({ id, name: getRoomTypeName(id) }));
      // Warn when a property sells several plans but none is nominated as the live rate.
      const siblingActive = plans.filter(
        (pl) => pl.property_id === plan.property_id && pl.is_active !== false,
      );
      const needsPrimaryChoice =
        plan.is_active !== false && siblingActive.length > 1 && !siblingActive.some((pl) => pl.is_primary_sell);
      
      const openEditor = readOnly
        ? undefined
        : () => setEditor({ propertyId: plan.property_id, ratePlanId: plan.id });
      return (
        <div key={plan.id} className="flex items-stretch gap-2">
        <Card className={`group min-w-0 flex-1 ${plan.is_active === false ? "opacity-50" : ""}`}>
          <CardHeader className="px-4 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="shrink-0 text-base">
                {plan.name}
                <Badge variant="secondary" className="ml-2 align-middle text-xs font-normal">
                  {PRICING_MODELS.find((m) => m.value === canonicalPricingModel(plan.pricing_model))?.label}
                </Badge>
                {plan.is_primary_sell && (
                  <Badge className="ml-2 align-middle text-xs font-normal" title="Prices the website and checkout">
                    Live rate
                  </Badge>
                )}
                {plan.push_to_channels !== false ? (
                  <Badge variant="outline" className="ml-2 align-middle text-xs font-normal" title="Priced for the Channel Manager and OTAs">
                    Channels
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ml-2 align-middle text-xs font-normal text-muted-foreground">
                    Direct only
                  </Badge>
                )}
                {needsPrimaryChoice && (
                  <Badge variant="destructive" className="ml-2 align-middle text-xs font-normal" title="Several active plans and no live rate chosen — open the plan and set the live/direct rate">
                    No live rate set
                  </Badge>
                )}
                {plan.los_enabled && (
                  <Badge variant="outline" className="ml-2 align-middle text-xs font-normal text-muted-foreground" title="Length-of-stay rungs are authored on this plan">
                    LOS
                  </Badge>
                )}
                {plan.fsp_enabled && (
                  <Badge variant="outline" className="ml-2 align-middle text-xs font-normal text-muted-foreground" title="Full-stay cells are authored on this plan">
                    Full stay
                  </Badge>
                )}
                {plan.is_active === false && (
                  <Badge variant="outline" className="ml-2 text-xs text-muted-foreground">Inactive</Badge>
                )}
              </CardTitle>


              {readOnly ? (
                <Badge variant="outline" className="text-xs">
                  {plan.is_active === false ? "Inactive" : "Active"}
                </Badge>
              ) : (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Sync to other properties"
                    onClick={() => setSyncPlan(plan)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Stop Sell"
                    onClick={() => setStopSellPlan(plan)}
                  >
                    <Ban className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Edit rate plan"
                    onClick={openEditor}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{plan.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete this rate plan, its seasons, prices, and room type links. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeletePlan(plan)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Switch checked={plan.is_active ?? true} onCheckedChange={() => handleToggleActive(plan)} />
                </div>
              )}
            </div>
            {plan.code && <p className="text-[11px] leading-tight text-muted-foreground font-mono">{plan.code}</p>}
          </CardHeader>
          <CardContent className={`px-4 pb-3 pt-0 ${readOnly ? "" : "cursor-pointer"}`} onClick={openEditor}>
            {plan.description && !plan.description.toLowerCase().includes("configure rate amount") && (
              <p className="text-xs text-muted-foreground mb-1.5">{plan.description}</p>
            )}
            {/* Two columns: plan meta on the left, property-level extras on the right. */}
            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  {pricedSeasons > 0 && (
                    <span className="flex items-center gap-1">
                      <CalendarRange className="h-3 w-3" />
                      {`${pricedSeasons} season${pricedSeasons === 1 ? "" : "s"} priced`}
                    </span>
                  )}
                  <span>Min stay: {plan.min_stay}n</span>

                  {plan.max_stay ? <span>Max stay: {plan.max_stay}n</span> : null}
                  {plan.min_advance_days ? <span>{plan.min_advance_days}d advance</span> : null}
                  {plan.requires_deposit && <Badge variant="outline" className="text-xs">Deposit</Badge>}
                  {plan.breakfast_included && (
                    <Badge variant="outline" className="text-xs border-success-border text-success">
                      Breakfast included{plan.breakfast_amount ? ` · R${Number(plan.breakfast_amount).toLocaleString()} ${BREAKFAST_BASIS_LABELS[plan.breakfast_basis || "per_person_per_night"] || ""}` : ""}
                    </Badge>
                  )}
                </div>
                {plan.base_rate && plan.base_rate > 0 ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                    <span className="flex items-center gap-1 rounded border border-dashed px-1.5 py-0.5 text-muted-foreground">
                      {pricingNoun(plan.pricing_model).Singular} Base fallback Rate
                      <span className="font-mono font-semibold text-foreground">R{plan.base_rate.toLocaleString()}</span>
                    </span>
                  </div>
                ) : null}
                {/* One row per unit: authored season prices and live sample nights aligned in the same row. */}
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <BedDouble className="h-3 w-3" />
                  <span>{gridUnits.length} {gridUnits.length === 1 ? "unit" : "units"} · rate by season</span>
                </div>
              </div>
              <div className="min-w-0">
                <RatePlanExtrasSummary propertyId={plan.property_id} ratePlanId={plan.id} />
              </div>
            </div>

            {/* Own click space: date navigation must not bubble up to the card's edit handler. */}
            <div onClick={(e) => e.stopPropagation()} role="presentation">
              <RatePlanRateMatrix
                ratePlanId={plan.id}
                units={gridUnits}
                rows={planRateRows}
                baseRate={plan.base_rate}
                seasonColors={seasonColors}
              />
            </div>
          </CardContent>
        </Card>
        </div>
      );
    };



    if (loading) {
      return (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      );
    }

    return (
      <>
        <div className="space-y-3">
          {plans.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-2">No rate plans configured.</p>
                <p className="text-sm text-muted-foreground">
                  {readOnly
                    ? "Rate plans for this property are configured in ROL'OS."
                    : "Create a rate plan, price your Calendar seasons, and link the units it sells."}
                </p>
                {emptyStateExtra ? <div className="mt-4 flex justify-center">{emptyStateExtra}</div> : null}
              </CardContent>
            </Card>
          )}
          {propertySections.map((section) => (
            <div key={section.id} className="space-y-2">
              {showSectionHeadings && (
                <div className="flex items-center gap-2 sticky top-0 z-10 bg-background/95 backdrop-blur py-2 border-b">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">{section.name}</h2>
                  <Badge variant="outline" className="text-xs">
                    {section.plans.length} plan{section.plans.length === 1 ? "" : "s"}
                  </Badge>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setEditor({ propertyId: section.id, ratePlanId: null })}
                    >
                      <Plus className="h-4 w-4 mr-1" />New plan
                    </Button>
                  )}
                </div>
              )}
              {!readOnly && section.plans.length > 0 && (
                <PropertyLegacyRatesBanner propertyId={section.id} onMigrated={fetchData} />
              )}



              {section.plans.length === 0 ? (
                plans.length > 0 ? <p className="text-sm text-muted-foreground italic">No rate plans for this property.</p> : null
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {section.plans.map(renderPlanCard)}
                </div>
              )}
              {showPackages && (
                <div className="pt-4 border-t">
                  <PackagesManager
                    propertyId={section.id}
                    ratePlans={section.plans.map((p) => ({ id: p.id, name: p.name }))}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {!readOnly && (
          <Dialog open={!!editor} onOpenChange={(open) => { if (!open) setEditor(null); }}>
            <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-[min(72rem,calc(100vw-1.5rem))] flex-col gap-4 overflow-hidden p-4 sm:p-6">
              <DialogHeader>
                <DialogTitle>{editor?.ratePlanId ? "Edit rate plan" : "New rate plan"}</DialogTitle>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1">
                {editor && !editor.ratePlanId && properties.length > 1 && (
                  <div className="space-y-1.5">
                    <span className="text-sm font-medium">Property</span>
                    <Select
                      value={editor.propertyId}
                      onValueChange={(v) => setEditor({ propertyId: v, ratePlanId: null })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
                      <SelectContent>
                        {properties.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {editor?.propertyId && (
                  <RatePlanEditor
                    key={`${editor.propertyId}:${editor.ratePlanId ?? "new"}`}
                    propertyId={editor.propertyId}
                    propertyName={properties.find((p) => p.id === editor.propertyId)?.name}
                    ratePlanId={editor.ratePlanId}
                    roomTypes={editorRoomTypes}
                    onSaved={() => { setEditor(null); fetchData(); }}
                    onCancel={() => setEditor(null)}
                  />
                )}
              </div>
            </DialogContent>

          </Dialog>
        )}

        {!readOnly && syncPlan && (
          <RatePlanSyncToOthersDialog
            open={!!syncPlan}
            onOpenChange={(o) => { if (!o) setSyncPlan(null); }}
            ratePlanId={syncPlan.id}
            ratePlanName={syncPlan.name}
            sourcePropertyId={syncPlan.property_id}
            properties={properties}
            onCopied={fetchData}
          />
        )}

        {!readOnly && stopSellPlan && (
          <RatePlanStopSellDialog
            open={!!stopSellPlan}
            onOpenChange={(o) => { if (!o) setStopSellPlan(null); }}
            propertyId={stopSellPlan.property_id}
            propertyName={properties.find((p) => p.id === stopSellPlan.property_id)?.name}
            ratePlanId={stopSellPlan.id}
            ratePlanName={stopSellPlan.name}
            ratePlanCode={stopSellPlan.code}
            portfolioProperties={properties.length > 1 ? properties : undefined}
          />
        )}
      </>
    );
  },
);
