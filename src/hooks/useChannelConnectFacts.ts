import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ConnectFacts } from "@/lib/channelConnectReadiness";

interface PropertyRow {
  name: string | null;
  property_type: string | null;
  bathrooms: number | null;
  max_guests: number | null;
  address: string | null;
  city: string | null;
  country: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  images: unknown;
  amenities: unknown;
  separate_kitchen: boolean | null;
  payment_providers: unknown;
  payment_mode: string | null;
}

interface UnitRow {
  id: string;
  name: string | null;
  rentalsunited_property_id: string | null;
  property_type: string | null;
  bathrooms: number | null;
  max_guests: number | null;
  address_street: string | null;
  address_city: string | null;
  address_country: string | null;
  address_postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  images: unknown;
  amenities: unknown;
  beds: unknown;
  bed_configuration: unknown;
  min_stay: number | null;
}

function urls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v : ((v as { url?: string })?.url ?? "")))
    .filter((u) => typeof u === "string" && u.startsWith("http"));
}

function textOf(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function bedCapacity(unit: UnitRow): number | null {
  const source = unit.bed_configuration ?? unit.beds;
  if (!source) return null;
  const sleepsFor = (name: string) => (/king|queen|double|twin(?!\s*single)|full/i.test(name) ? 2 : 1);
  if (Array.isArray(source)) {
    let total = 0;
    for (const bed of source) {
      if (typeof bed === "string") total += sleepsFor(bed);
      else if (bed && typeof bed === "object") {
        const b = bed as { type?: string; name?: string; count?: number; quantity?: number; sleeps?: number };
        const count = Number(b.count ?? b.quantity ?? 1) || 1;
        total += Number(b.sleeps ?? sleepsFor(String(b.type ?? b.name ?? ""))) * count;
      }
    }
    return total || null;
  }
  if (typeof source === "object") {
    let total = 0;
    for (const [name, count] of Object.entries(source as Record<string, unknown>)) {
      total += sleepsFor(name) * (Number(count) || 0);
    }
    return total || null;
  }
  return null;
}

/**
 * Everything the connection-eligibility grader needs, per published listing.
 * Read-only and local: no channel call, so this can render before the owner
 * presses "Get connected".
 */
export function useChannelConnectFacts(propertyId: string | null | undefined) {
  return useQuery({
    queryKey: ["channel-connect-facts", propertyId],
    enabled: !!propertyId,
    staleTime: 30_000,
    queryFn: async (): Promise<ConnectFacts[]> => {
      const today = new Date().toISOString().slice(0, 10);
      const [propRes, unitRes, availRes, priceRes, policyRes] = await Promise.all([
        supabase
          .from("properties")
          .select(
            "name, property_type, bathrooms, max_guests, address, city, country, postal_code, latitude, longitude, description, images, amenities, separate_kitchen, payment_providers, payment_mode",
          )
          .eq("id", propertyId!)
          .maybeSingle(),
        supabase
          .from("hostfully_room_types")
          .select(
            "id, name, rentalsunited_property_id, property_type, bathrooms, max_guests, address_street, address_city, address_country, address_postal_code, latitude, longitude, description, images, amenities, beds, bed_configuration, min_stay",
          )
          .eq("property_id", propertyId!)
          .eq("is_active", true),
        supabase
          .from("property_availability")
          .select("id")
          .eq("property_id", propertyId!)
          .gte("date", today)
          .limit(1),
        supabase
          .from("rolos_rate_plans")
          .select("id, base_rate, is_active")
          .eq("property_id", propertyId!)
          .eq("is_active", true),
        supabase.from("rolos_policies").select("policy_type, rule").eq("property_id", propertyId!),
      ]);

      const prop = (propRes.data ?? null) as PropertyRow | null;
      const units = (unitRes.data ?? []) as UnitRow[];
      const hasAvailability = (availRes.data ?? []).length > 0;
      const hasPrices = (priceRes.data ?? []).some((p) => Number(p.base_rate ?? 0) > 0);

      const cancellationRules = (policyRes.data ?? [])
        .filter((p) => /cancel/i.test(String(p.policy_type ?? "")))
        .flatMap((p) => {
          const rule = (p.rule ?? {}) as Record<string, unknown>;
          const tiers = Array.isArray(rule.tiers) ? rule.tiers : Array.isArray(rule.windows) ? rule.windows : [];
          return (tiers as Record<string, unknown>[]).map((t) => ({
            daysBefore: Number(t.days_before ?? t.daysBefore ?? t.days ?? 0),
            feePercent: Number(t.fee_percent ?? t.feePercent ?? t.penalty_percent ?? t.forfeit_percent ?? 0),
          }));
        });
      // A policy with no tiered structure still counts as "a policy exists".
      const policyExists = (policyRes.data ?? []).some((p) => /cancel/i.test(String(p.policy_type ?? "")));
      const rules = cancellationRules.length
        ? cancellationRules
        : policyExists
          ? [{ daysBefore: 0, feePercent: 100 }]
          : [];

      const paymentMethods = Array.isArray(prop?.payment_providers)
        ? (prop!.payment_providers as unknown[]).length
        : prop?.payment_mode
          ? 1
          : 0;

      const propPhotos = urls(prop?.images);
      const propFacilities = `${textOf(prop?.amenities)}${prop?.separate_kitchen ? " kitchen" : ""}`;

      const build = (unit: UnitRow | null): ConnectFacts => {
        const photos = unit ? (urls(unit.images).length ? urls(unit.images) : propPhotos) : propPhotos;
        const amenityText = unit ? `${textOf(unit.amenities)} ${propFacilities}` : propFacilities;
        const description = (unit?.description || prop?.description || "").trim();
        return {
          listingLabel: unit?.name || prop?.name || "Listing",
          ruListingId: unit?.rentalsunited_property_id ?? null,
          name: unit?.name || prop?.name || null,
          propertyType: unit?.property_type || prop?.property_type || null,
          bathrooms: unit?.bathrooms ?? prop?.bathrooms ?? null,
          maxGuests: unit?.max_guests ?? prop?.max_guests ?? null,
          street: unit?.address_street || prop?.address || null,
          city: unit?.address_city || prop?.city || null,
          country: unit?.address_country || prop?.country || null,
          postalCode: unit?.address_postal_code || prop?.postal_code || null,
          latitude: unit?.latitude ?? prop?.latitude ?? null,
          longitude: unit?.longitude ?? prop?.longitude ?? null,
          descriptionLength: description.length,
          hasKitchen: /kitchen/i.test(amenityText),
          bedCapacity: unit ? bedCapacity(unit) : null,
          photos,
          probes: {},
          hasPrices,
          hasAvailability,
          minStay: unit?.min_stay ?? null,
          paymentMethods,
          cancellationRules: rules,
        };
      };

      return units.length ? units.map((u) => build(u)) : [build(null)];
    },
  });
}
