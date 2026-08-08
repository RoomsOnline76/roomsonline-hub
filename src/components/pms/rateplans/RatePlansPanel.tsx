import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, RefreshCw, Cloud } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RatePlansSurface, type RatePlansSurfaceHandle } from "@/components/pms/rateplans/RatePlansSurface";

export interface RatePlansPanelProps {
  /** Properties in scope. One entry = single-property mode, more = grouped sections. */
  properties: { id: string; name: string }[];
  /** Extra controls rendered in the header (portfolio toggle / property stepper). */
  headerExtra?: ReactNode;
  /** Property whose legacy rate types are seeded into plans (single-property mode). */
  seedPropertyId?: string | null;
  showSectionHeadings?: boolean;
  showPackages?: boolean;
  /** Connected external system, when the property is not on ROL'OS. */
  pmsSystem?: string | null;
}

/**
 * Shared Rate Plans page body — header (New Rate Plan / Refresh) + the surface +
 * the legacy rate-type seeding. Used by /pms/rate-plans and by Admin → Edit
 * property → Rate Plans so both are literally the same page and source of truth.
 */
export function RatePlansPanel({
  properties,
  headerExtra,
  seedPropertyId,
  showSectionHeadings = false,
  showPackages = true,
  pmsSystem,
}: RatePlansPanelProps) {
  const surfaceRef = useRef<RatePlansSurfaceHandle>(null);
  const primaryPropertyId = seedPropertyId ?? properties[0]?.id ?? null;

  const externalSystem =
    pmsSystem && !["roomsonline", "rolos", "none", ""].includes(pmsSystem.toLowerCase()) ? pmsSystem : null;

  /**
   * Seeds any legacy rate types held on properties.amenities into real rate plans so
   * the page is never empty for a property that was configured before Rate Plans.
   * Rate Plans stays the sole author of pricing_model / base_rate.
   */
  const seedFromLegacyRateTypes = useCallback(async (propertyId: string) => {
    const { data: property } = await supabase
      .from("properties")
      .select("amenities")
      .eq("id", propertyId)
      .single();

    const amenities = (property as any)?.amenities || {};
    const pmsRateTypes: any[] = Array.isArray(amenities.pms_rate_types) ? amenities.pms_rate_types : [];
    const roomTypesAmenities: any[] = Array.isArray(amenities.room_types) ? amenities.room_types : [];
    if (pmsRateTypes.length === 0) return;

    const { data: existingPlans } = await supabase
      .from("rolos_rate_plans")
      .select("id, code, name, description")
      .eq("property_id", propertyId);

    const existingCodes = new Set((existingPlans || []).map((p) => p.code));
    const existingNames = new Set((existingPlans || []).map((p) => p.name.toLowerCase()));

    const codeOf = (rt: any) => (typeof rt.id === "string" ? rt.id.substring(0, 20) : String(rt.id));

    const missingRates = pmsRateTypes.filter(
      (rt) => !existingCodes.has(codeOf(rt)) && !existingNames.has((rt.name || "").toLowerCase()),
    );

    if (missingRates.length > 0) {
      const rows = missingRates.map((rt) => {
        const desc: string = rt.description || "";
        const cleanDesc = desc.toLowerCase().includes("configure rate amount") ? "" : desc;
        return {
          property_id: propertyId,
          name: rt.name || "Unnamed Rate",
          code: codeOf(rt),
          description: cleanDesc || null,
          is_active: true,
          min_stay: rt.minStayDays || 1,
          pricing_model: rt.pricingModel || "per_room",
          requires_deposit: false,
          base_rate: rt.baseRate || 0,
        };
      });
      const { error } = await supabase.from("rolos_rate_plans").insert(rows);
      if (!error) {
        toast.success(`Synced ${missingRates.length} rate plan${missingRates.length !== 1 ? "s" : ""} from Property Overview`);
      }
    }

    // Deactivate plans whose legacy rate type is gone (never delete — keep history)
    const amenityCodes = new Set(pmsRateTypes.map(codeOf));
    const amenityNames = new Set(pmsRateTypes.map((rt: any) => (rt.name || "").toLowerCase()));
    const stalePlans = (existingPlans || []).filter(
      (p) => !amenityCodes.has(p.code) && !amenityNames.has(p.name.toLowerCase()),
    );
    for (const stale of stalePlans) {
      await supabase.from("rolos_rate_plans").update({ is_active: false }).eq("id", stale.id);
    }
    if (stalePlans.length > 0) {
      toast.info(`Deactivated ${stalePlans.length} rate plan${stalePlans.length !== 1 ? "s" : ""} removed from Property Overview`);
    }

    // Clean stale placeholder descriptions
    for (const plan of existingPlans || []) {
      if (typeof plan.description === "string" && plan.description.toLowerCase().includes("configure rate amount")) {
        await supabase.from("rolos_rate_plans").update({ description: null }).eq("id", plan.id);
      }
    }

    // Auto-link plans to room types from the legacy linkedRoomId mapping
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
      const planByCode = new Map(allPlans.map((p) => [p.code, p.id]));
      const rolosRtByName = new Map(allRolosRoomTypes.map((rt) => [rt.name.toLowerCase(), rt.id]));
      const linkRows: { rate_plan_id: string; room_type_id: string }[] = [];

      for (const rt of pmsRateTypes) {
        const planId = planByCode.get(codeOf(rt));
        if (!planId || !rt.linkedRoomId) continue;
        const room = roomTypesAmenities.find((r: any) => r.id === rt.linkedRoomId);
        if (!room) continue;
        const rolosRtId = rolosRtByName.get((room.name || "").toLowerCase());
        if (!rolosRtId) continue;
        linkRows.push({ rate_plan_id: planId, room_type_id: rolosRtId });
        if (rt.baseRate) {
          await supabase
            .from("rolos_room_types")
            .update({ default_rate: rt.baseRate })
            .eq("id", rolosRtId)
            .is("default_rate", null);
        }
      }

      const uniqueLinks = Array.from(
        new Map(linkRows.map((l) => [`${l.rate_plan_id}-${l.room_type_id}`, l])).values(),
      );
      if (uniqueLinks.length > 0) {
        await supabase
          .from("rolos_rate_plan_room_types")
          .upsert(uniqueLinks, { onConflict: "rate_plan_id,room_type_id" });
      }
    }
  }, []);

  useEffect(() => {
    if (!primaryPropertyId || properties.length !== 1) return;
    let cancelled = false;
    (async () => {
      await seedFromLegacyRateTypes(primaryPropertyId);
      if (!cancelled) surfaceRef.current?.refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [primaryPropertyId, properties.length, seedFromLegacyRateTypes]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Rate Plans</h2>
          <p className="text-xs text-muted-foreground">
            The single place rates are configured — this is what widgets, OTAs and the booking engine read.
            Seasons and their dates stay owned by the Calendar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {headerExtra}
          <Button variant="outline" size="sm" onClick={() => surfaceRef.current?.refresh()}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => surfaceRef.current?.openNewPlan(primaryPropertyId ?? undefined)}
            disabled={properties.length === 0}
          >
            <Plus className="h-4 w-4 mr-2" />New Rate Plan
          </Button>
        </div>
      </div>

      {externalSystem && (
        <Alert>
          <Cloud className="h-4 w-4" />
          <AlertDescription className="text-xs">
            This property is connected to <span className="font-medium">{externalSystem}</span>. Rates that the
            connected system sends stay authoritative for those plans; everything it does not price is authored
            here and is what widgets and OTAs read.
          </AlertDescription>
        </Alert>
      )}

      <RatePlansSurface
        ref={surfaceRef}
        properties={properties}
        showPackages={showPackages}
        showSectionHeadings={showSectionHeadings}
      />
    </div>
  );
}
