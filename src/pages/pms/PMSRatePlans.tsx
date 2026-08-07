import { useEffect, useState, useCallback, useMemo } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, TrendingUp, RefreshCw, Pencil, DollarSign, Trash2, ChevronLeft, ChevronRight,
  LayoutGrid, Building2, Ban, CalendarRange, Copy, BedDouble,
} from "lucide-react";
import { RatePlanStopSellDialog } from "@/components/restrictions/RatePlanStopSellDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PmsPageSkeleton } from "@/components/pms/PmsPageSkeleton";
import { PackagesManager } from "@/components/pms/packages/PackagesManager";
import { BREAKFAST_BASIS_LABELS } from "@/components/charges/ChargeCalculator";
import { RatePlanEditor } from "@/components/pms/rateplans/RatePlanEditor";
import { RatePlanSyncToOthersDialog } from "@/components/pms/rateplans/RatePlanSyncToOthersDialog";

const PRICING_MODELS = [
  { value: "per_room", label: "Per Room", suffix: "/room", desc: "Flat rate per room per night" },
  { value: "per_person", label: "Per Person", suffix: "/pp", desc: "Rate × guests × nights" },
  { value: "per_person_sharing", label: "Per Person Sharing", suffix: "/pps", desc: "Base for 2 guests, extra per additional" },
  { value: "per_unit", label: "Per Unit", suffix: "/unit", desc: "Rate × units × nights" },
] as const;

interface RatePlan {
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

export default function PMSRatePlans() {
  const { propertyId, properties, portfolioProperties, switchProperty, loading: propertyLoading } = usePmsPropertyId();
  const scopeProperties = portfolioProperties && portfolioProperties.length > 0 ? portfolioProperties : properties;
  const currentIndex = scopeProperties.findIndex((p) => p.id === propertyId);
  const goToProperty = (offset: number) => {
    if (scopeProperties.length === 0) return;
    const next = (currentIndex + offset + scopeProperties.length) % scopeProperties.length;
    switchProperty(scopeProperties[next].id);
  };

  const [viewMode, setViewMode] = useState<"portfolio" | "single" | null>(null);
  const [userOverrode, setUserOverrode] = useState(false);

  // Default to portfolio once portfolio context is known; don't override user choice
  useEffect(() => {
    if (userOverrode || propertyLoading) return;
    if (portfolioProperties && portfolioProperties.length > 1) {
      setViewMode("portfolio");
    } else if (viewMode === null) {
      setViewMode("single");
    }
  }, [portfolioProperties, propertyLoading, userOverrode, viewMode]);

  const setViewModeManual = (m: "portfolio" | "single") => {
    setUserOverrode(true);
    setViewMode(m);
  };

  const isPortfolio = viewMode === "portfolio" && scopeProperties.length > 1;
  const activePropertyIds = useMemo(
    () => {
      if (viewMode === null || propertyLoading) return [];
      return isPortfolio ? scopeProperties.map((p) => p.id) : propertyId ? [propertyId] : [];
    },
    [viewMode, propertyLoading, isPortfolio, scopeProperties, propertyId]
  );

  const [plans, setPlans] = useState<RatePlan[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [links, setLinks] = useState<RatePlanRoomLink[]>([]);
  const [seasonCounts, setSeasonCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [stopSellPlan, setStopSellPlan] = useState<RatePlan | null>(null);
  const [syncPlan, setSyncPlan] = useState<RatePlan | null>(null);

  /** Which plan (or new plan, on which property) the full configurator is open for. */
  const [editor, setEditor] = useState<{ propertyId: string; ratePlanId: string | null } | null>(null);

  // Auto-sync rate plans from amenities.pms_rate_types on load
  const syncFromAmenities = useCallback(async () => {
    if (!propertyId) return;

    const { data: property } = await supabase
      .from("properties")
      .select("amenities, is_rol_property")
      .eq("id", propertyId)
      .single();

    if (!(property as any)?.is_rol_property) return;

    const amenities = (property as any)?.amenities || {};
    const pmsRateTypes: any[] = Array.isArray(amenities.pms_rate_types) ? amenities.pms_rate_types : [];
    const roomTypesAmenities: any[] = Array.isArray(amenities.room_types) ? amenities.room_types : [];

    if (pmsRateTypes.length === 0) return;

    // Get existing plans
    const { data: existingPlans } = await supabase
      .from("rolos_rate_plans")
      .select("id, code, name, description")
      .eq("property_id", propertyId);

    const existingCodes = new Set((existingPlans || []).map(p => p.code));
    const existingNames = new Set((existingPlans || []).map(p => p.name.toLowerCase()));

    const missingRates = pmsRateTypes.filter(rt => {
      const code = typeof rt.id === 'string' ? rt.id.substring(0, 20) : String(rt.id);
      return !existingCodes.has(code) && !existingNames.has((rt.name || '').toLowerCase());
    });

    if (missingRates.length > 0) {
      const rows = missingRates.map(rt => {
        const desc = rt.description || '';
        const cleanDesc = desc.toLowerCase().includes('configure rate amount') ? '' : desc;
        return {
          property_id: propertyId,
          name: rt.name || 'Unnamed Rate',
          code: typeof rt.id === 'string' ? rt.id.substring(0, 20) : String(rt.id),
          description: cleanDesc || null,
          is_active: true,
          min_stay: rt.minStayDays || 1,
          pricing_model: rt.pricingModel || 'per_room',
          requires_deposit: false,
          base_rate: rt.baseRate || 0,
        };
      });

      const { error } = await supabase.from("rolos_rate_plans").insert(rows);
      if (!error) {
        toast.success(`Synced ${missingRates.length} rate plan${missingRates.length !== 1 ? 's' : ''} from Property Overview`);
      }
    }

    // Remove rate plans that no longer exist in amenities
    const amenityCodes = new Set(pmsRateTypes.map((rt: any) => typeof rt.id === 'string' ? rt.id.substring(0, 20) : String(rt.id)));
    const amenityNames = new Set(pmsRateTypes.map((rt: any) => (rt.name || '').toLowerCase()));
    const stalePlans = (existingPlans || []).filter(p =>
      !amenityCodes.has(p.code) && !amenityNames.has(p.name.toLowerCase())
    );
    for (const stale of stalePlans) {
      // Deactivate rather than delete to preserve history
      await supabase
        .from("rolos_rate_plans")
        .update({ is_active: false })
        .eq("id", stale.id);
    }
    if (stalePlans.length > 0) {
      toast.info(`Deactivated ${stalePlans.length} rate plan${stalePlans.length !== 1 ? 's' : ''} removed from Property Overview`);
    }

    // Clean stale "configure rate amount" descriptions on existing plans
    for (const plan of (existingPlans || [])) {
      if (plan.description && typeof plan.description === 'string' && plan.description.toLowerCase().includes('configure rate amount')) {
        await supabase
          .from("rolos_rate_plans")
          .update({ description: null })
          .eq("id", plan.id);
      }
    }

    // Update base_rate and pricing_model for existing plans
    for (const rt of pmsRateTypes) {
      const code = typeof rt.id === 'string' ? rt.id.substring(0, 20) : String(rt.id);
      const matchingPlan = (existingPlans || []).find(
        p => p.code === code || p.name.toLowerCase() === (rt.name || '').toLowerCase()
      );
      if (matchingPlan) {
        const updates: Record<string, any> = {};
        if (rt.baseRate) updates.base_rate = rt.baseRate;
        // Detect pricing model from amenity data or name convention
        const detectedModel = rt.pricingModel
          || ((rt.name || '').toLowerCase().includes('per person') ? 'per_person' : null);
        if (detectedModel) updates.pricing_model = detectedModel;
        if (Object.keys(updates).length > 0) {
          await supabase
            .from("rolos_rate_plans")
            .update(updates)
            .eq("id", matchingPlan.id);
        }
      }
    }

    // Auto-link rate plans to room types based on amenities linkedRateTypes / linkedRoomId
    const { data: allPlans } = await supabase
      .from("rolos_rate_plans")
      .select("id, code, name")
      .eq("property_id", propertyId);

    const { data: allRolosRoomTypes } = await supabase
      .from("rolos_room_types")
      .select("id, name")
      .eq("property_id", propertyId)
      .eq("is_active", true);

    if (allPlans && allRolosRoomTypes) {
      const planByCode = new Map(allPlans.map(p => [p.code, p.id]));
      const rolosRtByName = new Map(allRolosRoomTypes.map(rt => [rt.name.toLowerCase(), rt.id]));

      const linkRows: { rate_plan_id: string; room_type_id: string }[] = [];

      // Match by linkedRoomId in pmsRateTypes
      for (const rt of pmsRateTypes) {
        const code = typeof rt.id === 'string' ? rt.id.substring(0, 20) : String(rt.id);
        const planId = planByCode.get(code);
        if (!planId) continue;

        // Find linked room by linkedRoomId
        if (rt.linkedRoomId) {
          const room = roomTypesAmenities.find((r: any) => r.id === rt.linkedRoomId);
          if (room) {
            const rolosRtId = rolosRtByName.get((room.name || '').toLowerCase());
            if (rolosRtId) {
              linkRows.push({ rate_plan_id: planId, room_type_id: rolosRtId });

              // Also update default_rate on room type if null
              if (rt.baseRate) {
                await supabase
                  .from("rolos_room_types")
                  .update({ default_rate: rt.baseRate })
                  .eq("id", rolosRtId)
                  .is("default_rate", null);
              }
            }
          }
        }
      }

      // Deduplicate and upsert
      const uniqueLinks = Array.from(
        new Map(linkRows.map(l => [`${l.rate_plan_id}-${l.room_type_id}`, l])).values()
      );
      if (uniqueLinks.length > 0) {
        await supabase
          .from("rolos_rate_plan_room_types")
          .upsert(uniqueLinks, { onConflict: "rate_plan_id,room_type_id" });
      }
    }
  }, [propertyId]);

  const fetchData = useCallback(async () => {
    if (activePropertyIds.length === 0) return;
    setLoading(true);

    // Auto-sync from amenities only in single-property mode (expensive per-property work)
    if (!isPortfolio) {
      await syncFromAmenities();
    }

    const plansQ = supabase
      .from("rolos_rate_plans")
      .select("id, property_id, name, code, description, is_active, min_stay, max_stay, min_advance_days, requires_deposit, deposit_percentage, base_rate, pricing_model, breakfast_included, breakfast_amount, breakfast_basis")
      .in("property_id", activePropertyIds)
      .is("deleted_at", null)
      .order("name");
    const roomTypesQ = supabase
      .from("rolos_room_types")
      .select("id, property_id, name")
      .in("property_id", activePropertyIds)
      .eq("is_active", true)
      .order("name");

    const [plansRes, roomTypesRes] = await Promise.all([plansQ, roomTypesQ]);
    const planIds = (plansRes.data || []).map((p: any) => p.id);

    const [linksRes, seasonRatesRes] = planIds.length
      ? await Promise.all([
          supabase.from("rolos_rate_plan_room_types").select("rate_plan_id, room_type_id").in("rate_plan_id", planIds),
          supabase
            .from("rolos_rate_plan_season_rates")
            .select("rate_plan_id, shared_season_id")
            .in("rate_plan_id", planIds)
            .is("deleted_at", null),
        ])
      : [{ data: [] as RatePlanRoomLink[] }, { data: [] as { rate_plan_id: string; shared_season_id: string | null }[] }];

    const counts: Record<string, number> = {};
    for (const row of (seasonRatesRes.data || []) as { rate_plan_id: string }[]) {
      counts[row.rate_plan_id] = (counts[row.rate_plan_id] ?? 0) + 1;
    }

    setPlans((plansRes.data || []) as RatePlan[]);
    setRoomTypes((roomTypesRes.data || []) as RoomType[]);
    setLinks((linksRes.data || []) as RatePlanRoomLink[]);
    setSeasonCounts(counts);
    setLoading(false);
  }, [activePropertyIds, isPortfolio, syncFromAmenities]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getLinkedRoomTypes = (planId: string) =>
    links.filter(l => l.rate_plan_id === planId).map(l => l.room_type_id);

  const getRoomTypeName = (id: string) =>
    roomTypes.find(rt => rt.id === id)?.name || id;

  const handleToggleActive = async (plan: RatePlan) => {
    const { error } = await supabase
      .from("rolos_rate_plans")
      .update({ is_active: !plan.is_active })
      .eq("id", plan.id);
    if (error) { toast.error(error.message); return; }
    fetchData();
  };

  const handleDeletePlan = async (plan: RatePlan) => {
    // Delete linked room types first, then seasons/prices, then the plan itself
    await supabase.from("rolos_rate_plan_room_types").delete().eq("rate_plan_id", plan.id);
    await supabase.from("rolos_rate_plan_season_rates").delete().eq("rate_plan_id", plan.id);
    const { data: seasons } = await supabase.from("rolos_rate_seasons").select("id").eq("rate_plan_id", plan.id);
    if (seasons?.length) {
      await supabase.from("rolos_rate_prices").delete().in("season_id", seasons.map(s => s.id));
      await supabase.from("rolos_rate_seasons").delete().eq("rate_plan_id", plan.id);
    }
    const { error } = await supabase.from("rolos_rate_plans").delete().eq("id", plan.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Rate plan "${plan.name}" deleted`);
    fetchData();
  };

  const editorRoomTypes = useMemo(
    () => (editor ? roomTypes.filter((rt) => rt.property_id === editor.propertyId).map((rt) => ({ id: rt.id, name: rt.name })) : []),
    [editor, roomTypes]
  );

  if (propertyLoading) return <PmsPageSkeleton rows={3} />;
  if (!isPortfolio && !propertyId) return <p className="text-muted-foreground">Select a property first.</p>;

  const propertySections = isPortfolio
    ? scopeProperties.map((p) => ({ id: p.id, name: p.name, plans: plans.filter((pl) => pl.property_id === p.id) }))
    : [{ id: propertyId!, name: scopeProperties.find((p) => p.id === propertyId)?.name || "", plans }];

  const renderPlanCard = (plan: RatePlan) => {
    const linkedIds = getLinkedRoomTypes(plan.id);
    const pricedSeasons = seasonCounts[plan.id] ?? 0;
    return (
      <Card key={plan.id} className={`group ${plan.is_active === false ? "opacity-50" : ""}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{plan.name}{plan.is_active === false && <Badge variant="outline" className="ml-2 text-xs text-muted-foreground">Inactive</Badge>}</CardTitle>
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
                onClick={() => setEditor({ propertyId: plan.property_id, ratePlanId: plan.id })}
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
          </div>
          {plan.code && <p className="text-xs text-muted-foreground font-mono">{plan.code}</p>}
        </CardHeader>
        <CardContent
          className="cursor-pointer"
          onClick={() => setEditor({ propertyId: plan.property_id, ratePlanId: plan.id })}
        >
          {plan.description && !plan.description.toLowerCase().includes('configure rate amount') && <p className="text-sm text-muted-foreground mb-2">{plan.description}</p>}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
            <Badge variant="outline" className="text-xs capitalize">{PRICING_MODELS.find(m => m.value === plan.pricing_model)?.label || plan.pricing_model}</Badge>
            {plan.base_rate && plan.base_rate > 0 ? (
              <div className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                <span className="font-semibold text-foreground">R{plan.base_rate.toLocaleString()}{PRICING_MODELS.find(m => m.value === plan.pricing_model)?.suffix || ''}</span>
              </div>
            ) : (
              <span className="text-muted-foreground/60 italic">No base rate set</span>
            )}
            <span className="flex items-center gap-1">
              <CalendarRange className="h-3 w-3" />
              {pricedSeasons > 0 ? `${pricedSeasons} season${pricedSeasons === 1 ? "" : "s"} priced` : "Base rate only"}
            </span>
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
          {linkedIds.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <BedDouble className="h-3 w-3 text-muted-foreground" />
              {linkedIds.map(rtId => (
                <Badge key={rtId} variant="secondary" className="text-xs">
                  {getRoomTypeName(rtId)}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 mt-2 italic">Not linked to any units</p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Rate Plans</h1>
            <p className="text-sm text-muted-foreground">
              The single place rates are configured. Seasons and their dates stay owned by the Calendar.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {scopeProperties.length > 1 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewModeManual(viewMode === "portfolio" ? "single" : "portfolio")}
                  title={viewMode === "portfolio" ? "Switch to single property" : "Switch to portfolio view"}
                >
                  {viewMode === "portfolio" ? <Building2 className="h-4 w-4 mr-1" /> : <LayoutGrid className="h-4 w-4 mr-1" />}
                  {viewMode === "portfolio" ? "Portfolio" : "Single"}
                </Button>
                {!isPortfolio && (
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goToProperty(-1)} title="Previous property">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Select value={propertyId ?? undefined} onValueChange={(v) => switchProperty(v)}>
                      <SelectTrigger className="h-8 w-[220px]"><SelectValue placeholder="Select property" /></SelectTrigger>
                      <SelectContent>
                        {scopeProperties.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goToProperty(1)} title="Next property">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground ml-1">
                      {currentIndex >= 0 ? currentIndex + 1 : "—"} / {scopeProperties.length}
                    </span>
                  </div>
                )}
              </>
            )}
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />Refresh
            </Button>
            <Button
              onClick={() => setEditor({ propertyId: propertyId ?? scopeProperties[0]?.id ?? "", ratePlanId: null })}
              disabled={!propertyId && scopeProperties.length === 0}
            >
              <Plus className="h-4 w-4 mr-2" />New Rate Plan
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {plans.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-2">No rate plans configured.</p>
                  <p className="text-sm text-muted-foreground">
                    Create a rate plan, price your Calendar seasons, and link the units it sells.
                  </p>
                </CardContent>
              </Card>
            )}
            {propertySections.map((section) => (
              <div key={section.id} className="space-y-3">
                {isPortfolio && (
                  <div className="flex items-center gap-2 sticky top-0 z-10 bg-background/95 backdrop-blur py-2 border-b">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">{section.name}</h2>
                    <Badge variant="outline" className="text-xs">{section.plans.length} plan{section.plans.length === 1 ? "" : "s"}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setEditor({ propertyId: section.id, ratePlanId: null })}
                    >
                      <Plus className="h-4 w-4 mr-1" />New plan
                    </Button>
                  </div>
                )}
                {section.plans.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No rate plans for this property.</p>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {section.plans.map(renderPlanCard)}
                  </div>
                )}
                <div className="pt-4 border-t">
                  <PackagesManager
                    propertyId={section.id}
                    ratePlans={section.plans.map((p) => ({ id: p.id, name: p.name }))}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full configurator */}
      <Dialog open={!!editor} onOpenChange={(open) => { if (!open) setEditor(null); }}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editor?.ratePlanId ? "Edit rate plan" : "New rate plan"}</DialogTitle>
          </DialogHeader>
          {editor && !editor.ratePlanId && scopeProperties.length > 1 && (
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Property</span>
              <Select
                value={editor.propertyId}
                onValueChange={(v) => setEditor({ propertyId: v, ratePlanId: null })}
              >
                <SelectTrigger><SelectValue placeholder="Select a property" /></SelectTrigger>
                <SelectContent>
                  {scopeProperties.map((p) => (
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
              propertyName={scopeProperties.find((p) => p.id === editor.propertyId)?.name}
              ratePlanId={editor.ratePlanId}
              roomTypes={editorRoomTypes}
              onSaved={() => { setEditor(null); fetchData(); }}
              onCancel={() => setEditor(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {syncPlan && (
        <RatePlanSyncToOthersDialog
          open={!!syncPlan}
          onOpenChange={(o) => { if (!o) setSyncPlan(null); }}
          ratePlanId={syncPlan.id}
          ratePlanName={syncPlan.name}
          sourcePropertyId={syncPlan.property_id}
          properties={scopeProperties.map((p) => ({ id: p.id, name: p.name }))}
          onCopied={fetchData}
        />
      )}

      {stopSellPlan && (
        <RatePlanStopSellDialog
          open={!!stopSellPlan}
          onOpenChange={(o) => { if (!o) setStopSellPlan(null); }}
          propertyId={stopSellPlan.property_id}
          propertyName={scopeProperties.find((p) => p.id === stopSellPlan.property_id)?.name}
          ratePlanId={stopSellPlan.id}
          ratePlanName={stopSellPlan.name}
          ratePlanCode={stopSellPlan.code}
          portfolioProperties={isPortfolio ? scopeProperties.map((p) => ({ id: p.id, name: p.name })) : undefined}
        />
      )}
    </>
  );
}
