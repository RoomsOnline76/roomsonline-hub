import { supabase } from "@/integrations/supabase/client";

/**
 * Authored season rates as captured in ROL'OS Rate Plans.
 *
 * Rate Plans is the sole author of nightly rates. The dashboard used to rebuild
 * rates from the legacy calendar blob, which stores one entry per plan and could
 * pick the wrong plan's amount (e.g. R1 000 instead of the authored R940).
 */
export interface AuthoredSeasonRates {
  /** `${propertyId}|${calendarSeasonId}|${roomKey}` -> nightly amount */
  rates: Map<string, number>;
  /** property id -> active rate plan ids, primary sell plan first */
  planIdsByProperty: Map<string, string[]>;
}

export const emptyAuthoredSeasonRates: AuthoredSeasonRates = {
  rates: new Map(),
  planIdsByProperty: new Map(),
};

const rateKey = (propertyId: string, calendarSeasonId: string, roomKey: string) =>
  `${propertyId}|${calendarSeasonId}|${roomKey}`;

export async function fetchAuthoredSeasonRates(propertyIds: string[]): Promise<AuthoredSeasonRates> {
  const ids = Array.from(new Set(propertyIds.filter(Boolean)));
  if (ids.length === 0) return emptyAuthoredSeasonRates;

  const [{ data: plans }, { data: roomTypes }] = await Promise.all([
    supabase
      .from("rolos_rate_plans")
      .select("id, property_id, is_primary_sell, sell_priority")
      .in("property_id", ids)
      .eq("is_active", true),
    supabase.from("rolos_room_types").select("id, name, property_id").in("property_id", ids),
  ]);

  const planIdsByProperty = new Map<string, string[]>();
  const propertyByPlan = new Map<string, string>();
  const ordered = (plans || []).slice().sort((a, b) => {
    const primary = Number(Boolean((b as any).is_primary_sell)) - Number(Boolean((a as any).is_primary_sell));
    if (primary !== 0) return primary;
    return Number((a as any).sell_priority ?? 100) - Number((b as any).sell_priority ?? 100);
  });
  for (const plan of ordered) {
    const propertyId = String((plan as any).property_id);
    propertyByPlan.set(String(plan.id), propertyId);
    const list = planIdsByProperty.get(propertyId) || [];
    list.push(String(plan.id));
    planIdsByProperty.set(propertyId, list);
  }

  const rates = new Map<string, number>();
  const planIds = ordered.map((plan) => String(plan.id));
  if (planIds.length === 0) return { rates, planIdsByProperty };

  const nameById = new Map<string, string>();
  for (const roomType of roomTypes || []) {
    nameById.set(String(roomType.id), String(roomType.name || "").trim().toLowerCase());
  }

  const { data: seasonRates } = await supabase
    .from("rolos_rate_plan_season_rates")
    .select("rate_plan_id, room_type_id, base_rate, rolos_shared_seasons(calendar_season_id)")
    .in("rate_plan_id", planIds)
    .eq("is_active", true)
    .is("deleted_at", null);

  /* Plans are visited in preference order, so the first authored amount wins. */
  const planRank = new Map(planIds.map((id, index) => [id, index]));
  const sortedRates = (seasonRates || []).slice().sort(
    (a, b) => (planRank.get(String(a.rate_plan_id)) ?? 999) - (planRank.get(String(b.rate_plan_id)) ?? 999),
  );

  for (const row of sortedRates) {
    const amount = Number((row as any).base_rate);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const calendarSeasonId = (row as any).rolos_shared_seasons?.calendar_season_id;
    if (!calendarSeasonId) continue;
    const propertyId = propertyByPlan.get(String(row.rate_plan_id));
    if (!propertyId) continue;
    const roomTypeId = row.room_type_id ? String(row.room_type_id) : null;
    if (!roomTypeId) continue;

    const idKey = rateKey(propertyId, String(calendarSeasonId), roomTypeId);
    if (!rates.has(idKey)) rates.set(idKey, amount);
    const name = nameById.get(roomTypeId);
    if (name) {
      const nameKey = rateKey(propertyId, String(calendarSeasonId), `name:${name}`);
      if (!rates.has(nameKey)) rates.set(nameKey, amount);
    }
  }

  return { rates, planIdsByProperty };
}

/** The calendar season covering a date, honouring multi-period seasons. */
export function findCalendarSeasonIdForDate(amenities: any, dateStr: string): string | null {
  const seasons = amenities?.seasons;
  if (!Array.isArray(seasons)) return null;
  for (const season of seasons) {
    const periods = season?.periods?.length
      ? season.periods
      : [{ from: season?.from || season?.startDate, to: season?.to || season?.endDate }];
    const inSeason = periods.some((period: any) => period?.from && period?.to && dateStr >= period.from && dateStr <= period.to);
    if (inSeason && season?.id) return String(season.id);
  }
  return null;
}

export function authoredRateFor(
  authored: AuthoredSeasonRates | undefined,
  propertyId: string | null | undefined,
  calendarSeasonId: string | null,
  roomTypeId: string,
  roomName?: string | null,
): number | null {
  if (!authored || !propertyId || !calendarSeasonId) return null;
  const byId = authored.rates.get(rateKey(propertyId, calendarSeasonId, roomTypeId));
  if (byId != null) return byId;
  const name = String(roomName || "").trim().toLowerCase();
  if (!name) return null;
  return authored.rates.get(rateKey(propertyId, calendarSeasonId, `name:${name}`)) ?? null;
}
