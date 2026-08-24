import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/**
 * Portfolio identity sync.
 *
 * Company Information (legal entity, banking, Rentals United company profile) is
 * authored per property but is in practice identical for every property in a
 * portfolio. This helper copies the *completed* identity fields of one property
 * onto its portfolio siblings, leaving anything blank on the source untouched on
 * the targets (a blank source field never wipes a populated sibling value).
 */

export interface PortfolioSibling {
  id: string;
  name: string;
  slug: string | null;
}

export interface IdentityPayload {
  registered_business_name?: string | null;
  registration_number?: string | null;
  vat_number?: string | null;
  has_vat?: boolean;
  mobile_number?: string | null;
  postal_address?: string | null;
  key_representative?: string | null;
  ru_company_profile?: Record<string, unknown> | null;
  banking?: Record<string, unknown> | null;
  ru_location_id?: number | null;
}

type Amenities = Record<string, unknown>;

const isBlank = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && value.trim() === "") ||
  (typeof value === "number" && Number.isNaN(value));

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};

/** Deep merge that only writes non-blank source values over the target. */
function mergeCompleted(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (isBlank(value)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = mergeCompleted(value as Record<string, unknown>, asRecord(out[key]));
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Human-readable list of the identity fields that will be copied. */
export function describeIdentityPayload(payload: IdentityPayload): string[] {
  const labels: string[] = [];
  if (!isBlank(payload.registered_business_name)) labels.push("Registered business name");
  if (!isBlank(payload.registration_number)) labels.push("Registration number");
  if (payload.has_vat && !isBlank(payload.vat_number)) labels.push("VAT number");
  if (!isBlank(payload.mobile_number)) labels.push("Mobile number");
  if (!isBlank(payload.postal_address)) labels.push("Postal address");
  if (!isBlank(payload.key_representative)) labels.push("Key representative");
  const banking = asRecord(payload.banking);
  const bankingFilled = Object.entries(banking).filter(
    ([key, value]) => key !== "has_vat" && key !== "accepts_bitcoin" && !isBlank(value),
  );
  if (bankingFilled.length > 0) labels.push(`Banking (${bankingFilled.length} fields)`);
  const profile = asRecord(payload.ru_company_profile);
  const profileFilled = Object.entries(profile).filter(([, value]) =>
    value && typeof value === "object" ? Object.values(asRecord(value)).some((v) => !isBlank(v)) : !isBlank(value),
  );
  if (profileFilled.length > 0) labels.push(`Channel Manager profile (${profileFilled.length} fields)`);
  if (!isBlank(payload.ru_location_id)) labels.push("RU location ID");
  return labels;
}

/** Active portfolio siblings of a property (excludes the property itself). */
export async function fetchPortfolioSiblings(propertyId: string): Promise<PortfolioSibling[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from("property_portfolio_members")
    .select("portfolio_id")
    .eq("property_id", propertyId);
  if (membershipError) throw membershipError;
  const portfolioIds = [...new Set((memberships ?? []).map((m) => m.portfolio_id))];
  if (portfolioIds.length === 0) return [];

  const { data: siblingMemberships, error: siblingError } = await supabase
    .from("property_portfolio_members")
    .select("property_id")
    .in("portfolio_id", portfolioIds)
    .neq("property_id", propertyId);
  if (siblingError) throw siblingError;
  const siblingIds = [...new Set((siblingMemberships ?? []).map((m) => m.property_id))];
  if (siblingIds.length === 0) return [];

  const { data: siblings, error: propertiesError } = await supabase
    .from("properties")
    .select("id, name, slug")
    .in("id", siblingIds)
    .eq("is_active", true)
    .order("name");
  if (propertiesError) throw propertiesError;

  return (siblings ?? []).map((s) => ({ id: s.id, name: s.name ?? "Unnamed property", slug: s.slug ?? null }));
}

/**
 * Copy the completed identity fields onto the given target properties.
 * Returns the number of properties updated.
 */
export async function copyIdentityToProperties(
  payload: IdentityPayload,
  targetIds: string[],
): Promise<number> {
  if (targetIds.length === 0) return 0;

  const { data: targets, error: fetchError } = await supabase
    .from("properties")
    .select("id, amenities")
    .in("id", targetIds);
  if (fetchError) throw fetchError;

  let updated = 0;
  for (const target of targets ?? []) {
    const amenities: Amenities = asRecord(target.amenities);

    const rootFields: Array<[keyof IdentityPayload, string]> = [
      ["registered_business_name", "registered_business_name"],
      ["registration_number", "registration_number"],
      ["mobile_number", "mobile_number"],
      ["postal_address", "postal_address"],
      ["key_representative", "key_representative"],
    ];
    for (const [source, dest] of rootFields) {
      const value = payload[source];
      if (!isBlank(value)) amenities[dest] = value as Json;
    }
    if (payload.has_vat && !isBlank(payload.vat_number)) amenities.vat_number = payload.vat_number as Json;

    if (payload.banking) {
      amenities.banking = mergeCompleted(asRecord(payload.banking), asRecord(amenities.banking)) as Json;
    }
    if (payload.ru_company_profile) {
      amenities.ru_company_profile = mergeCompleted(
        asRecord(payload.ru_company_profile),
        asRecord(amenities.ru_company_profile),
      ) as Json;
    }

    const update: Record<string, unknown> = { amenities: amenities as Json };
    if (!isBlank(payload.ru_location_id)) update.ru_location_id = payload.ru_location_id;

    const { error } = await supabase.from("properties").update(update as never).eq("id", target.id);
    if (error) throw error;
    updated += 1;
  }
  return updated;
}
