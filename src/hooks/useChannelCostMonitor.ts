import { useCallback, useEffect, useMemo, useState } from "react";
import { applyAdminScope } from "@/lib/adminScope";
import { useAuth } from "@/hooks/useAuth";
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
import { pushReportedOn } from "@/lib/channelDistributionGate";

export type ChannelSyncState = "live" | "paused" | "archived" | "pending";

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
  /**
   * Deactivated unit records that still carry a channel listing id — duplicates
   * that were never removed at the channel manager and can still bill.
   */
  duplicateListings: number;
  /** Live units only. Deactivated mirrors never appear here. */
  units: ChannelUnitRow[];
  /** Deactivated mirrors that still hold a channel listing id, pending removal. */
  duplicates: ChannelUnitRow[];
  buildingListingId: string | null;
  archivedAt: string | null;
  lastPushAt: string | null;
  monthlyCostEur: number;
  /** Counts in dashboards/metrics: staff-flagged trading and not sandbox. */
  isTrading: boolean;
  /** Push is switched on but nothing was ever created at the channel manager. */
  neverPushed: boolean;
  /** RU owner account id (OwnerID) linked to this property. */
  ownerId: string | null;
  /** RU sub-user account id (UserID) linked to this property. */
  subUserId: string | null;
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
  /** Deactivated unit records still holding a channel listing id across all properties. */
  duplicateListings: number;
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
  /** Channel-manager sub-accounts configured for the platform. */
  subAccounts: number;
  /** Sub-account properties that actually carry a channel-manager footprint. */
  subAccountProperties: number;
  /** Sub-account properties with nothing on the channel manager yet. */
  subAccountPropertiesWithoutFootprint: number;
  /** Trading properties inside the sub-account footprint with channel pushing on. */
  pushEnabledProperties: number;
  /** Trading properties pushing without any linked sub-account. */
  pushEnabledOutsideAccounts: number;
}


interface PropertyRecord {
  id: string;
  name: string | null;
  is_active: boolean | null;
  is_trading: boolean | null;
  is_sandbox: boolean | null;
  ru_push_enabled: boolean | null;
  ru_archived: boolean | null;
  ru_archived_at: string | null;
  rentalsunited_property_id: string | null;
  owner_email?: string | null;
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
  const { scopedPropertyIds } = useAuth();
  const [properties, setProperties] = useState<ChannelPropertyRow[]>([]);
  const [events, setEvents] = useState<ArchiveEventRow[]>([]);
  const [fx, setFx] = useState<FxRate | null>(null);
  const [rolPerListingZar, setRolPerListingZar] = useState<number | null>(null);
  const [accountFootprint, setAccountFootprint] = useState({
    subAccounts: 0,
    subAccountProperties: 0,
    subAccountPropertiesWithoutFootprint: 0,
    pushEnabledProperties: 0,
    pushEnabledOutsideAccounts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [propsRes, unitsRes, membersRes, portfoliosRes, runsRes, eventsRes, fxRate, defaultsRes, accountsRes] =
        await Promise.all([
        applyAdminScope(
          supabase
            .from("properties")
            .select("id, name, is_active, is_trading, is_sandbox, ru_push_enabled, ru_archived, ru_archived_at, rentalsunited_property_id, owner_email"),
          "id",
          scopedPropertyIds,
        ),
        applyAdminScope(
          supabase
            .from("hostfully_room_types")
            .select("id, property_id, name, is_active, rentalsunited_property_id"),
          "property_id",
          scopedPropertyIds,
        ),
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
        // FX resolves in the background: an external rate lookup must never hold up the page.
        Promise.resolve(null as FxRate | null),
        supabase
          .from("billing_global_defaults")
          .select("channel_manager_per_unit_fee, sort_order")
          .order("sort_order", { ascending: true }),
        supabase
          .from("ru_owner_accounts")
          .select(
            "id, portfolio_id, property_id, owner_email, ru_owner_id, ru_user_id, ru_api_access_key, company_details_sent",
          ),
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

      // Properties with a channel footprint — plus properties that have push
      // switched on yet nothing upstream, so a failed first push stays visible
      // instead of silently vanishing from the monitor.
      const relevant = allProps.filter((p) => {
        const units = unitsByProperty.get(p.id) || [];
        const hasFootprint =
          !!p.rentalsunited_property_id ||
          !!p.ru_archived ||
          units.some((u) => !!u.rentalsunited_property_id);
        return hasFootprint || (p.ru_push_enabled === true && p.is_active !== false);
      });

      // Map each property to its RU owner/sub-user credentials. Prefer a direct
      // property_id match, then a portfolio match, then an owner_email match.
      const ruAccounts = (accountsRes?.data || []) as Array<{
        portfolio_id: string | null;
        property_id: string | null;
        owner_email: string | null;
        ru_owner_id: string | null;
        ru_user_id: string | null;
        ru_api_access_key: string | null;
        company_details_sent: boolean | null;
      }>;
      const ownerIds = [...new Set(ruAccounts.map((a) => a.ru_owner_id).filter(Boolean))] as string[];
      const { data: credRows } = ownerIds.length
        ? await supabase.from("ru_api_credentials").select("ru_owner_id, access_key").in("ru_owner_id", ownerIds)
        : { data: [] as { ru_owner_id: string; access_key: string | null }[] };
      const ownersWithKeys = new Set(
        (credRows ?? [])
          .filter((c) => !!c.access_key)
          .map((c) => String(c.ru_owner_id)),
      );
      const credsOf = (acc?: (typeof ruAccounts)[number]) => ({
        ownerId: acc?.ru_owner_id ?? null,
        // A sub-user id equal to the OwnerID is the same single account, not a second one.
        subUserId:
          acc?.ru_user_id && String(acc.ru_user_id) !== String(acc.ru_owner_id ?? "")
            ? acc.ru_user_id
            : null,

        keysCaptured: !!acc?.ru_api_access_key || (!!acc?.ru_owner_id && ownersWithKeys.has(String(acc.ru_owner_id))),
        companyDetailsSent: acc?.company_details_sent === true,
      });
      const accountByProperty = new Map<
        string,
        { ownerId: string | null; subUserId: string | null; keysCaptured: boolean; companyDetailsSent: boolean }
      >();
      for (const p of allProps) {
        const direct = ruAccounts.find((a) => a.property_id === p.id);
        if (direct) {
          accountByProperty.set(p.id, credsOf(direct));
          continue;
        }
        const portfolioId = (membersRes.data || []).find((m) => m.property_id === p.id)?.portfolio_id;
        const portfolioMatch = portfolioId
          ? ruAccounts.find((a) => a.portfolio_id === portfolioId)
          : undefined;
        if (portfolioMatch) {
          accountByProperty.set(p.id, credsOf(portfolioMatch));
          continue;
        }
        const emailMatch = p.owner_email
          ? ruAccounts.find((a) => (a.owner_email || "").toLowerCase() === p.owner_email!.toLowerCase())
          : undefined;
        accountByProperty.set(p.id, credsOf(emailMatch));
      }

      const draft = relevant.map((p) => {
        // Only records that carry a channel listing id have a channel footprint.
        // Deactivated records without one are pure local artefacts — never shown.
        const withListing = (unitsByProperty.get(p.id) || []).filter((u) => !!u.rentalsunited_property_id);
        const liveUnits = withListing.filter((u) => u.is_active !== false);
        const duplicateUnits = withListing.filter((u) => u.is_active === false);
        const archived = !!p.ru_archived || p.is_active === false;
        const activeUnitListings = archived ? 0 : liveUnits.length;
        // A building-level listing with no unit rows still bills as one listing.
        const listings =
          withListing.length > 0
            ? activeUnitListings
            : archived || !p.rentalsunited_property_id
              ? 0
              : 1;
        const creds = accountByProperty.get(p.id) ?? {
          ownerId: null,
          subUserId: null,
          keysCaptured: false,
          companyDetailsSent: false,
        };
        const pushOn = pushReportedOn({
          ruPushEnabled: p.ru_push_enabled,
          ruOwnerId: creds.ownerId,
          keysCaptured: creds.keysCaptured,
          companyDetailsSent: creds.companyDetailsSent,
        });
        // Nothing upstream at all: not a live listing, not archived — the first
        // push either never ran or failed.
        const neverPushed =
          !archived && !p.rentalsunited_property_id && withListing.length === 0;
        const state: ChannelSyncState = archived
          ? "archived"
          : neverPushed
            ? "pending"
            : pushOn
              ? "live"
              : "paused";
        const toRow = (u: UnitRecord): ChannelUnitRow => ({
          id: u.id,
          name: u.name || "Unit",
          isActive: u.is_active !== false,
          listingId: u.rentalsunited_property_id,
        });

        return {
          id: p.id,
          name: p.name || "Untitled property",
          portfolioName: portfolioByProperty.get(p.id) ?? null,
          state,
          listings,
          duplicateListings: duplicateUnits.length,
          units: liveUnits.map(toRow),
          duplicates: duplicateUnits.map(toRow),
          buildingListingId: p.rentalsunited_property_id,
          archivedAt: p.ru_archived_at,
          lastPushAt: lastPush.get(p.id) ?? null,
          monthlyCostEur: 0,
          isTrading: p.is_trading === true,
          neverPushed,
          ownerId: creds.ownerId,
          subUserId: creds.subUserId,
        } satisfies ChannelPropertyRow;
      });

      const totalListings = draft.reduce((sum, r) => sum + r.listings, 0);
      const priced = draft
        .map((r) => ({ ...r, monthlyCostEur: costContributionEur(r.listings, totalListings) }))
        .sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name));

      setProperties(priced);
      setEvents((eventsRes.data || []) as ArchiveEventRow[]);
      setFx(fxRate);
      void resolveEurToZar().then((rate) => {
        if (rate) setFx(rate);
      });
      const defaultsRows = (defaultsRes?.data || []) as Array<{ channel_manager_per_unit_fee: number | null }>;
      const perUnit = defaultsRows.find((r) => (r.channel_manager_per_unit_fee ?? 0) > 0)?.channel_manager_per_unit_fee;
      setRolPerListingZar(perUnit != null ? Number(perUnit) : null);

      // Sub-account footprint — mirrors the Portfolio Management → Rentals United counters.
      const membersRows = (membersRes.data || []) as Array<{ property_id: string; portfolio_id: string }>;
      // Trading scope: only the Trading toggle gates counters — test rows count normally.
      const isTradingProp = (p: PropertyRecord) => p.is_trading === true;
      const tradingProps = allProps.filter(isTradingProp);
      const tradingIds = new Set(tradingProps.map((p) => p.id));

      const subAccountPropertyIds = new Set<string>();
      for (const acc of ruAccounts) {
        if (acc.portfolio_id) {
          membersRows
            .filter((m) => m.portfolio_id === acc.portfolio_id && tradingIds.has(m.property_id))
            .forEach((m) => subAccountPropertyIds.add(m.property_id));
        } else if (acc.property_id) {
          if (tradingIds.has(acc.property_id)) subAccountPropertyIds.add(acc.property_id);
        } else if (acc.owner_email) {
          tradingProps
            .filter((p) => (p.owner_email || "").toLowerCase() === acc.owner_email!.toLowerCase())
            .forEach((p) => subAccountPropertyIds.add(p.id));
        }
      }

      // Only properties with an actual channel footprint belong in these counters —
      // portfolio siblings with nothing on the channel manager would otherwise pad
      // the denominator and make a healthy account look half-connected.
      const footprintIds = new Set(relevant.map((p) => p.id));
      const footprintSubAccountIds = new Set(
        [...subAccountPropertyIds].filter((id) => footprintIds.has(id)),
      );

      const pushEnabled = tradingProps.filter((p) => {
        const creds = accountByProperty.get(p.id);
        return pushReportedOn({
          ruPushEnabled: p.ru_push_enabled,
          ruOwnerId: creds?.ownerId,
          keysCaptured: creds?.keysCaptured,
          companyDetailsSent: creds?.companyDetailsSent,
        });
      });
      setAccountFootprint({
        // Count distinct OwnerIDs: one sub-account is one account even if several
        // local rows (portfolio + property scope) point at it.
        subAccounts: ownerIds.length,

        subAccountProperties: footprintSubAccountIds.size,
        subAccountPropertiesWithoutFootprint:
          subAccountPropertyIds.size - footprintSubAccountIds.size,
        pushEnabledProperties: pushEnabled.filter((p) => footprintSubAccountIds.has(p.id)).length,
        pushEnabledOutsideAccounts: pushEnabled.filter((p) => !footprintSubAccountIds.has(p.id)).length,
      });

    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load channel cost data");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedPropertyIds.join(",")]);

  useEffect(() => {
    void load();
  }, [load]);

  const derived = useMemo(() => {
    const billableListings = properties.reduce((sum, r) => sum + r.listings, 0);
    const thisMonth = monthKey(new Date());
    // Unique, not cumulative: a unit toggled archived → active → archived must
    // count once. Keep only the latest event per property for the month and
    // count its units when that final state is "archived".
    const latestByProperty = new Map<string, ArchiveEventRow>();
    for (const e of events) {
      if (monthKey(new Date(e.created_at)) !== thisMonth) continue;
      const current = latestByProperty.get(e.property_id);
      if (!current || new Date(e.created_at) > new Date(current.created_at)) {
        latestByProperty.set(e.property_id, e);
      }
    }
    const unitsArchivedThisMonth = Array.from(latestByProperty.values())
      .filter((e) => e.direction === "archived")
      .reduce((sum, e) => sum + (e.unit_count || 0), 0);


    const forecast = forecastForDate(billableListings);
    const schedule = forecastSchedule(billableListings, new Date(), 8);
    const nextStep = schedule.find((row) => row.month > forecast.month && row.minimumEur > forecast.minimumEur) ?? null;
    const gap = listingsToNextTier(billableListings);

    return {
      billableListings,
      // Live AND trading — parked/stale inventory must not read as active spend.
      activeProperties: properties.filter((r) => r.state === "live" && r.isTrading).length,
      pausedProperties: properties.filter((r) => r.state === "paused").length,
      archivedProperties: properties.filter((r) => r.state === "archived").length,
      duplicateListings: properties.reduce((sum, r) => sum + r.duplicateListings, 0),
      unitsArchivedThisMonth,
      forecast,
      schedule,
      nextStep,
      nextTier: gap ? { needed: gap.needed, rateEur: gap.tier.rateEur } : null,
      currentTier: tierFor(billableListings),
      effectiveRateEur: tierFor(billableListings)?.rateEur ?? null,
    };
  }, [properties, events]);

  const rolRevenueZar =
    rolPerListingZar != null ? Math.round(rolPerListingZar * derived.billableListings * 100) / 100 : null;

  return {
    loading,
    error,
    refresh: load,
    properties,
    events,
    fx,
    rolPerListingZar,
    rolRevenueZar,
    ...accountFootprint,
    ...derived,
  };

}
