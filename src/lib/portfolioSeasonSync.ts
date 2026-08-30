import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

interface SeasonPeriod {
  from: string;
  to: string;
}

export interface PortfolioSeason {
  id: string;
  name?: string;
  title?: string;
  from?: string;
  to?: string;
  periods?: SeasonPeriod[];
  color?: string;
  minStay?: number;
  maxStay?: number;
  [key: string]: unknown;
}

const seasonName = (season: PortfolioSeason) => (season.name || season.title || "").trim().toLowerCase();

/** Replace season definitions while retaining target IDs so target price keys remain valid. */
export function mergePortfolioSeasonDates(
  sourceSeasons: PortfolioSeason[],
  targetSeasons: PortfolioSeason[],
): PortfolioSeason[] {
  const targetsByName = new Map(targetSeasons.map((season) => [seasonName(season), season]));
  return sourceSeasons.map((source) => {
    const target = targetsByName.get(seasonName(source));
    const id = target?.id ?? source.id;
    return {
      ...(target ?? {}),
      id,
      name: source.name,
      title: source.title,
      from: source.from,
      to: source.to,
      periods: source.periods?.map((period) => ({ ...period })),
      color: source.color,
      minStay: source.minStay,
      maxStay: source.maxStay,
    };
  });
}

/**
 * Copy the source property's season dates onto its portfolio siblings.
 *
 * Returns the ids of the siblings that were rewritten, so the caller can mirror their shared
 * seasons and fire their own channel delta — a sibling whose season dates moved is just as
 * mispriced at the channel as the property that was edited.
 */
export async function syncPortfolioSeasonDates(propertyId: string, sourceSeasons: PortfolioSeason[]): Promise<string[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from("property_portfolio_members")
    .select("portfolio_id")
    .eq("property_id", propertyId);
  if (membershipError) throw membershipError;
  const portfolioIds = (memberships ?? []).map((membership) => membership.portfolio_id);
  if (portfolioIds.length === 0) return 0;

  const { data: siblingMemberships, error: siblingError } = await supabase
    .from("property_portfolio_members")
    .select("property_id")
    .in("portfolio_id", portfolioIds)
    .neq("property_id", propertyId);
  if (siblingError) throw siblingError;
  const siblingIds = [...new Set((siblingMemberships ?? []).map((membership) => membership.property_id))];
  if (siblingIds.length === 0) return 0;

  const { data: siblings, error: propertiesError } = await supabase
    .from("properties")
    .select("id, amenities")
    .in("id", siblingIds)
    .eq("is_active", true);
  if (propertiesError) throw propertiesError;

  let updated = 0;
  for (const sibling of siblings ?? []) {
    const amenities = sibling.amenities && typeof sibling.amenities === "object"
      ? { ...(sibling.amenities as Record<string, unknown>) }
      : {};
    const targetSeasons = Array.isArray(amenities.seasons) ? amenities.seasons as PortfolioSeason[] : [];
    amenities.seasons = mergePortfolioSeasonDates(sourceSeasons, targetSeasons);
    const { error } = await supabase.from("properties").update({ amenities: amenities as Json }).eq("id", sibling.id);
    if (error) throw error;
    updated += 1;
  }
  return updated;
}