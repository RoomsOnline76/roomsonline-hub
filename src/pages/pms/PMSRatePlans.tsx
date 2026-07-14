import { useEffect, useState, useCallback, useMemo } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, TrendingUp, RefreshCw, Pencil, Link2, DollarSign, Trash2, ChevronLeft, ChevronRight, LayoutGrid, Building2, Ban } from "lucide-react";
import { RatePlanStopSellDialog } from "@/components/restrictions/RatePlanStopSellDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  requires_deposit: boolean;
  deposit_percentage: number | null;
  base_rate: number | null;
  pricing_model: string;
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
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<RatePlan | null>(null);
  const [stopSellPlan, setStopSellPlan] = useState<RatePlan | null>(null);
  const [form, setForm] = useState({
    name: "", code: "", description: "", min_stay: "1", requires_deposit: false,
    base_rate: "",
    pricing_model: "per_room",
    linkedRoomTypeIds: [] as string[],
    target_property_id: "" as string,
  });

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
      .select("id, property_id, name, code, description, is_active, min_stay, requires_deposit, deposit_percentage, base_rate, pricing_model")
      .in("property_id", activePropertyIds)
      .order("name");
    const roomTypesQ = supabase
      .from("rolos_room_types")
      .select("id, property_id, name")
      .in("property_id", activePropertyIds)
      .eq("is_active", true)
      .order("name");

    const [plansRes, roomTypesRes] = await Promise.all([plansQ, roomTypesQ]);
    const planIds = (plansRes.data || []).map((p: any) => p.id);
    const linksRes = planIds.length
      ? await supabase
          .from("rolos_rate_plan_room_types")
          .select("rate_plan_id, room_type_id")
          .in("rate_plan_id", planIds)
      : { data: [] as RatePlanRoomLink[] };

    setPlans((plansRes.data || []) as RatePlan[]);
    setRoomTypes((roomTypesRes.data || []) as RoomType[]);
    setLinks((linksRes.data || []) as RatePlanRoomLink[]);
    setLoading(false);
  }, [activePropertyIds, isPortfolio, syncFromAmenities]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getLinkedRoomTypes = (planId: string) =>
    links.filter(l => l.rate_plan_id === planId).map(l => l.room_type_id);

  const getRoomTypeName = (id: string) =>
    roomTypes.find(rt => rt.id === id)?.name || id;

  const resetForm = () => {
    setForm({ name: "", code: "", description: "", min_stay: "1", requires_deposit: false, base_rate: "", pricing_model: "per_room", linkedRoomTypeIds: [], target_property_id: "" });
    setEditingPlan(null);
  };

  const handleOpenDialog = (plan?: RatePlan) => {
    if (plan) {
      setEditingPlan(plan);
      setForm({
        name: plan.name,
        code: plan.code || "",
        description: plan.description || "",
        min_stay: String(plan.min_stay || 1),
        requires_deposit: plan.requires_deposit,
        base_rate: plan.base_rate ? String(plan.base_rate) : "",
        pricing_model: plan.pricing_model || "per_room",
        linkedRoomTypeIds: getLinkedRoomTypes(plan.id),
        target_property_id: plan.property_id,
      });
    } else {
      resetForm();
      // Pre-select current property when not in portfolio view
      if (!isPortfolio && propertyId) {
        setForm(p => ({ ...p, target_property_id: propertyId }));
      }
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    // When editing in portfolio view, the plan's own property_id must be preserved.
    const targetPropertyId = editingPlan?.property_id || propertyId;
    if (!targetPropertyId || !form.name) return;

    const baseRate = form.base_rate ? parseFloat(form.base_rate) : 0;

    const payload = {
      property_id: targetPropertyId,
      name: form.name,
      code: form.code || null,
      description: form.description || null,
      min_stay: parseInt(form.min_stay) || 1,
      requires_deposit: form.requires_deposit,
      base_rate: baseRate,
      pricing_model: form.pricing_model || "per_room",
    };

    let planId: string;
    let error;

    if (editingPlan) {
      planId = editingPlan.id;
      ({ error } = await supabase.from("rolos_rate_plans").update(payload).eq("id", planId));
    } else {
      const res = await supabase.from("rolos_rate_plans").insert(payload).select("id").single();
      error = res.error;
      planId = res.data?.id || "";
    }

    if (error) { toast.error(error.message); return; }

    // Sync room type links
    await supabase.from("rolos_rate_plan_room_types").delete().eq("rate_plan_id", planId);
    if (form.linkedRoomTypeIds.length > 0) {
      const linkRows = form.linkedRoomTypeIds.map(rtId => ({
        rate_plan_id: planId,
        room_type_id: rtId,
      }));
      const { error: linkError } = await supabase.from("rolos_rate_plan_room_types").insert(linkRows);
      if (linkError) { toast.error("Saved rate plan but failed to link room types: " + linkError.message); }
    }

    // Write-back to amenities.pms_rate_types (last save wins)
    try {
      const { data: property } = await supabase
        .from("properties")
        .select("amenities")
        .eq("id", targetPropertyId)
        .single();

      if (property) {
        const amenities = (property as any).amenities || {};
        const pmsRateTypes: any[] = Array.isArray(amenities.pms_rate_types) ? [...amenities.pms_rate_types] : [];

        // Find matching rate type by plan UUID, code, or name
        const matchIdx = pmsRateTypes.findIndex((rt: any) => {
          if (rt.id === planId) return true;
          const code = typeof rt.id === 'string' ? rt.id.substring(0, 20) : String(rt.id);
          return code === form.code || (rt.name || '').toLowerCase() === form.name.toLowerCase();
        });

        const rateData = { 
          baseRate: baseRate, 
          name: form.name, 
          description: form.description || undefined,
          pricingModel: form.pricing_model,
          minStayDays: parseInt(form.min_stay) || 1,
        };

        if (matchIdx >= 0) {
          pmsRateTypes[matchIdx] = { ...pmsRateTypes[matchIdx], ...rateData };
        } else {
          // Rate plan exists in rolos_rate_plans but not in amenities — add it
          pmsRateTypes.push({ id: planId, priceType: 'UnitRate', ...rateData });
        }

        await supabase
          .from("properties")
          .update({ amenities: { ...amenities, pms_rate_types: pmsRateTypes } })
          .eq("id", targetPropertyId);
      }
    } catch (wbErr) {
      console.warn("[PMSRatePlans] Write-back to amenities warning:", wbErr);
    }

    toast.success(editingPlan ? "Rate plan updated" : "Rate plan created");
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

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

  const toggleRoomType = (roomTypeId: string) => {
    setForm(prev => ({
      ...prev,
      linkedRoomTypeIds: prev.linkedRoomTypeIds.includes(roomTypeId)
        ? prev.linkedRoomTypeIds.filter(id => id !== roomTypeId)
        : [...prev.linkedRoomTypeIds, roomTypeId],
    }));
  };

  if (propertyLoading) return <p className="text-muted-foreground">Loading property…</p>;
  if (!isPortfolio && !propertyId) return <p className="text-muted-foreground">Select a property first.</p>;

  const propertySections = isPortfolio
    ? scopeProperties.map((p) => ({ id: p.id, name: p.name, plans: plans.filter((pl) => pl.property_id === p.id) }))
    : [{ id: propertyId!, name: scopeProperties.find((p) => p.id === propertyId)?.name || "", plans }];

  const renderPlanCard = (plan: RatePlan) => {
    const linkedIds = getLinkedRoomTypes(plan.id);
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
                title="Stop Sell"
                onClick={() => setStopSellPlan(plan)}
              >
                <Ban className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleOpenDialog(plan)}>
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
        <CardContent>
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
            <span>Min stay: {plan.min_stay}n</span>
            {plan.requires_deposit && <Badge variant="outline" className="text-xs">Deposit</Badge>}
          </div>
          {linkedIds.length > 0 ? (
            <div className="flex flex-wrap gap-1 mt-2">
              {linkedIds.map(rtId => (
                <Badge key={rtId} variant="secondary" className="text-xs">
                  {getRoomTypeName(rtId)}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 mt-2 italic">Not linked to any room types</p>
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
              Create rate plans and link them to room types. Changes sync with Property Overview.
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
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()} disabled={isPortfolio} title={isPortfolio ? "Switch to a single property to create a new rate plan" : undefined}>
                  <Plus className="h-4 w-4 mr-2" />New Rate Plan
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>{editingPlan ? "Edit Rate Plan" : "Create Rate Plan"}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
                  <div><Label>Code</Label><Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="e.g. BAR, PROMO" /></div>
                  <div><Label>Description</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
                  <div>
                    <Label>Pricing Model *</Label>
                    <Select value={form.pricing_model} onValueChange={v => setForm(p => ({ ...p, pricing_model: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRICING_MODELS.map(m => (
                          <SelectItem key={m.value} value={m.value}>
                            <span>{m.label}</span>
                            <span className="text-muted-foreground ml-1 text-xs">— {m.desc}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Base Rate (ZAR)</Label><Input type="number" min={0} value={form.base_rate} onChange={e => setForm(p => ({ ...p, base_rate: e.target.value }))} placeholder="0.00" /></div>
                    <div><Label>Min Stay (nights)</Label><Input type="number" value={form.min_stay} onChange={e => setForm(p => ({ ...p, min_stay: e.target.value }))} /></div>
                  </div>
                  <div className="flex items-center gap-2"><Switch checked={form.requires_deposit} onCheckedChange={v => setForm(p => ({ ...p, requires_deposit: v }))} /><Label>Requires Deposit</Label></div>

                  {/* Room type linking */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><Link2 className="h-4 w-4" />Linked Room Types</Label>
                    {(() => {
                      const scopePropId = editingPlan?.property_id || propertyId;
                      const scopedRoomTypes = roomTypes.filter(rt => rt.property_id === scopePropId);
                      if (scopedRoomTypes.length === 0) {
                        return <p className="text-sm text-muted-foreground">No room types found. Add room types first.</p>;
                      }
                      return (
                        <div className="space-y-2 rounded-md border border-border p-3">
                          {scopedRoomTypes.map(rt => (
                            <label key={rt.id} className="flex items-center gap-2 cursor-pointer">
                              <Checkbox
                                checked={form.linkedRoomTypeIds.includes(rt.id)}
                                onCheckedChange={() => toggleRoomType(rt.id)}
                              />
                              <span className="text-sm">{rt.name}</span>
                            </label>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  <Button onClick={handleSave} className="w-full">{editingPlan ? "Update" : "Create"}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? <p className="text-muted-foreground">Loading...</p> : plans.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">No rate plans configured.</p>
              <p className="text-sm text-muted-foreground">
                Create rate plans and link them to your room types.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {propertySections.map((section) => (
              <div key={section.id} className="space-y-3">
                {isPortfolio && (
                  <div className="flex items-center gap-2 sticky top-0 z-10 bg-background/95 backdrop-blur py-2 border-b">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">{section.name}</h2>
                    <Badge variant="outline" className="text-xs">{section.plans.length} plan{section.plans.length === 1 ? "" : "s"}</Badge>
                  </div>
                )}
                {section.plans.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No rate plans for this property.</p>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {section.plans.map(renderPlanCard)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
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
