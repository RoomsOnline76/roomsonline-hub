import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, RefreshCw, ChevronLeft, ChevronRight, LayoutGrid, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PmsPageSkeleton } from "@/components/pms/PmsPageSkeleton";
import { RatePlansSurface, type RatePlansSurfaceHandle } from "@/components/pms/rateplans/RatePlansSurface";

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
  const surfaceRef = useRef<RatePlansSurfaceHandle>(null);

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

  const surfaceProperties = useMemo(() => {
    if (viewMode === null || propertyLoading) return [];
    if (isPortfolio) return scopeProperties.map((p) => ({ id: p.id, name: p.name }));
    if (!propertyId) return [];
    return [{ id: propertyId, name: scopeProperties.find((p) => p.id === propertyId)?.name || "" }];
  }, [viewMode, propertyLoading, isPortfolio, scopeProperties, propertyId]);

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

  // Single-property mode keeps the legacy amenity sync; the surface reloads after it.
  useEffect(() => {
    if (propertyLoading || isPortfolio || !propertyId) return;
    let cancelled = false;
    (async () => {
      await syncFromAmenities();
      if (!cancelled) surfaceRef.current?.refresh();
    })();
    return () => { cancelled = true; };
  }, [propertyLoading, isPortfolio, propertyId, syncFromAmenities]);

  if (propertyLoading) return <PmsPageSkeleton rows={3} />;
  if (!isPortfolio && !propertyId) return <p className="text-muted-foreground">Select a property first.</p>;

  return (
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
          <Button variant="outline" size="sm" onClick={() => surfaceRef.current?.refresh()}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button
            onClick={() => surfaceRef.current?.openNewPlan(propertyId ?? scopeProperties[0]?.id)}
            disabled={!propertyId && scopeProperties.length === 0}
          >
            <Plus className="h-4 w-4 mr-2" />New Rate Plan
          </Button>
        </div>
      </div>

      <RatePlansSurface
        ref={surfaceRef}
        properties={surfaceProperties}
        showPackages
        showSectionHeadings={isPortfolio}
      />
    </div>
  );
}
