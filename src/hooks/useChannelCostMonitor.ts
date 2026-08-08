import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ForecastResult,
  costContributionEur,
  forecastForDate,
  forecastSchedule,
  listingsToNextTier,
  monthKey,
  tierFor,
} from "@/lib/channelBillingForecast";

export type ChannelSyncState = "live" | "paused" | "archived";

export interface ChannelUnitRow {
  id: string;
  name: string;
  isActive: boolean;
  listingId: string | null;
}

export interface ChannelPropertyRow {
  id: string;
  name: string;
  portfolioName: string | null;
  state: ChannelSyncState;
  /** Billable listings: active units carrying a listing (or the building listing when unit-less). */
  listings: number;
  /** Inactive units that still carry a listing id. */
  archivedUnits: number;
  units: ChannelUnitRow[];
  buildingListingId: string | null;
  archivedAt: string | null;
  lastPushAt: string | null;
  monthlyCostEur: number;
}

export interface ArchiveEventRow {
  id: string;
  property_id: string;
  property_name: string | null;
  direction: "archived" | "reactivated";
  unit_count: number;
  listing_count: number;
  actor_email: string | null;
  created_at: string;
}

export interface FxRate {
  eurToZar: number;
  source: string;
  fetchedAt: string;
}

export interface ChannelCostMonitorData {
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  properties: ChannelPropertyRow[];
  events: ArchiveEventRow[];
  billableListings: number;
  activeProperties: number;
  archivedProperties: number;
  pausedProperties: number;
  archivedUnits: number;
  unitsArchivedThisMonth: number;
  forecast: ForecastResult;
  nextStep: ForecastResult | null;
  schedule: ForecastResult[];
  nextTier: { needed: number; rateEur: number } | null;
  fx: FxRate | null;
  /** ROL's default channel-manager billing value per listing per month, in ZAR. */
  rolPerListingZar: number | null;
  /** Derived ROL revenue for the current billable listing count, in ZAR. */
  rolRevenueZar: number | null;
  /** Effective per-listing cost at the current tier, in EUR (null below the tier floor). */
  effectiveRateEur: number | null;
}


interface PropertyRecord {
  id: string;
  name: string | null;
  is_active: boolean | null;
  ru_push_enabled: boolean | null;
  ru_archived: boolean | null;
  ru_archived_at: string | null;
  rentalsunited_property_id: string | null;
}

interface UnitRecord {
  id: string;
  property_id: string | null;
  name: string | null;
  is_active: boolean | null;
  rentalsunited_property_id: string | null;
}

async function resolveEurToZar(): Promise<FxRate | null> {
  // Prefer a stored rate so the page stays consistent with the rest of the platform.
  const { data } = await supabase
    .from("ru_fx_rates")
    .select("base_iso, quote_iso, rate, source, fetched_at")
    .in("base_iso", ["EUR", "ZAR"])
    .in("quote_iso", ["EUR", "ZAR"])
    .order("fetched_at", { ascending: false })
    .limit(5);

  const rows = (data || []) as Array<{
    base_iso: string;
    quote_iso: string;
    rate: number;
    source: string | null;
    fetched_at: string;
  }>;

  const direct = rows.find((r) => r.base_iso === "EUR" && r.quote_iso === "ZAR");
  if (direct?.rate) {
    return { eurToZar: Number(direct.rate), source: direct.source || "stored rate", fetchedAt: direct.fetched_at };
  }
  const inverse = rows.find((r) => r.base_iso === "ZAR" && r.quote_iso === "EUR");
  if (inverse?.rate) {
    return {
      eurToZar: 1 / Number(inverse.rate),
      source: inverse.source || "stored rate",
      fetchedAt: inverse.fetched_at,
    };
  }

  // Live fallback so the ZAR column is never blank.
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/EUR");
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: Record<string, number>; time_last_update_utc?: string };
    const rate = json?.rates?.ZAR;
    if (!rate) return null;
    return {
      eurToZar: rate,
      source: "open.er-api.com",
      fetchedAt: json.time_last_update_utc || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function useChannelCostMonitor(): ChannelCostMonitorData {
  const [properties, setProperties] = useState<ChannelPropertyRow[]>([]);
  const [events, setEvents] = useState<ArchiveEventRow[]>([]);
  const [fx, setFx] = useState<FxRate | null>(null);
  const [rolPerListingZar, setRolPerListingZar] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [propsRes, unitsRes, membersRes, portfoliosRes, runsRes, eventsRes, fxRate] = await Promise.all([
        supabase
          .from("properties")
          .select("id, name, is_active, ru_push_enabled, ru_archived, ru_archived_at, rentalsunited_property_id"),
        supabase
          .from("hostfully_room_types")
          .select("id, property_id, name, is_active, rentalsunited_property_id"),
        supabase.from("property_portfolio_members").select("property_id, portfolio_id"),
        supabase.from("property_portfolios").select("id, name"),
        supabase
          .from("ru_sync_runs")
          .select("property_id, created_at, success, action")
          .eq("success", true)
          .order("created_at", { ascending: false })
          .limit(600),
        supabase
          .from("ru_archive_events")
          .select("id, property_id, property_name, direction, unit_count, listing_count, actor_email, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        resolveEurToZar(),
      ]);

      if (propsRes.error) throw propsRes.error;

      const allProps = (propsRes.data || []) as PropertyRecord[];
      const allUnits = ((unitsRes.data || []) as UnitRecord[]).filter((u) => !!u.property_id);

      const portfolioNames = new Map<string, string>();
      for (const p of (portfoliosRes.data || []) as Array<{ id: string; name: string | null }>) {
        if (p.name) portfolioNames.set(p.id, p.name);
      }
      const portfolioByProperty = new Map<string, string>();
      for (const m of (membersRes.data || []) as Array<{ property_id: string; portfolio_id: string }>) {
        const name = portfolioNames.get(m.portfolio_id);
        if (name && !portfolioByProperty.has(m.property_id)) portfolioByProperty.set(m.property_id, name);
      }

      const lastPush = new Map<string, string>();
      for (const r of (runsRes.data || []) as Array<{ property_id: string | null; created_at: string }>) {
        if (r.property_id && !lastPush.has(r.property_id)) lastPush.set(r.property_id, r.created_at);
      }

      const unitsByProperty = new Map<string, UnitRecord[]>();
      for (const u of allUnits) {
        const list = unitsByProperty.get(u.property_id as string) || [];
        list.push(u);
        unitsByProperty.set(u.property_id as string, list);
      }

      // Only properties with a channel footprint belong on this page.
      const relevant = allProps.filter((p) => {
        const units = unitsByProperty.get(p.id) || [];
        return (
          !!p.rentalsunited_property_id ||
          !!p.ru_archived ||
          units.some((u) => !!u.rentalsunited_property_id)
        );
      });

      const draft = relevant.map((p) => {
        const units = (unitsByProperty.get(p.id) || []).filter((u) => !!u.rentalsunited_property_id);
        const archived = !!p.ru_archived || p.is_active === false;
        const activeUnitListings = archived ? 0 : units.filter((u) => u.is_active !== false).length;
        // A building-level listing with no unit rows still bills as one listing.
        const listings =
          units.length > 0
            ? activeUnitListings
            : archived || !p.rentalsunited_property_id
              ? 0
              : 1;
        const state: ChannelSyncState = archived ? "archived" : p.ru_push_enabled ? "live" : "paused";

        return {
          id: p.id,
          name: p.name || "Untitled property",
          portfolioName: portfolioByProperty.get(p.id) ?? null,
          state,
          listings,
          archivedUnits: units.filter((u) => u.is_active === false).length,
          units: units.map((u) => ({
            id: u.id,
            name: u.name || "Unit",
            isActive: u.is_active !== false,
            listingId: u.rentalsunited_property_id,
          })),
          buildingListingId: p.rentalsunited_property_id,
          archivedAt: p.ru_archived_at,
          lastPushAt: lastPush.get(p.id) ?? null,
          monthlyCostEur: 0,
        } satisfies ChannelPropertyRow;
      });

      const totalListings = draft.reduce((sum, r) => sum + r.listings, 0);
      const priced = draft
        .map((r) => ({ ...r, monthlyCostEur: costContributionEur(r.listings, totalListings) }))
        .sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name));

      setProperties(priced);
      setEvents((eventsRes.data || []) as ArchiveEventRow[]);
      setFx(fxRate);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load channel cost data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const derived = useMemo(() => {
    const billableListings = properties.reduce((sum, r) => sum + r.listings, 0);
    const thisMonth = monthKey(new Date());
    const unitsArchivedThisMonth = events
      .filter((e) => e.direction === "archived" && monthKey(new Date(e.created_at)) === thisMonth)
      .reduce((sum, e) => sum + (e.unit_count || 0), 0);

    const forecast = forecastForDate(billableListings);
    const schedule = forecastSchedule(billableListings, new Date(), 8);
    const nextStep = schedule.find((row) => row.month > forecast.month && row.minimumEur > forecast.minimumEur) ?? null;
    const gap = listingsToNextTier(billableListings);

    return {
      billableListings,
      activeProperties: properties.filter((r) => r.state === "live").length,
      pausedProperties: properties.filter((r) => r.state === "paused").length,
      archivedProperties: properties.filter((r) => r.state === "archived").length,
      archivedUnits: properties.reduce((sum, r) => sum + r.archivedUnits, 0),
      unitsArchivedThisMonth,
      forecast,
      schedule,
      nextStep,
      nextTier: gap ? { needed: gap.needed, rateEur: gap.tier.rateEur } : null,
      currentTier: tierFor(billableListings),
    };
  }, [properties, events]);

  return {
    loading,
    error,
    refresh: load,
    properties,
    events,
    fx,
    ...derived,
  };
}
