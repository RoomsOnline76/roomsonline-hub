import { createClient } from "npm:@supabase/supabase-js@2";
import { safeParseResponse, AvailabilityResponseSchema } from "../_shared/validate.ts";
import { canonicalPricingModel, priceTypeForModel } from "../_shared/ratePricing.ts";
import { addDays as addDaysIso, createRateResolver, type DayRate } from "../_shared/rateResolution.ts";
import { closedDates, offerEligibility, offerReasonText, stayRuleWindow, type OfferPlan, type OfferStay, type OfferWindow, type StayRule } from "../_shared/rateOffers.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-warm, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function ok(data: unknown, validate = false) {
  const out = validate
    ? safeParseResponse(AvailabilityResponseSchema, data, "booking-orchestrator")
    : data;
  return new Response(JSON.stringify({ success: true, data: out }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(msg: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── helpers ───────────────────────────────────────────────────────────

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function generateDailyRates(
  startDate: string,
  endDate: string,
  baseRate: number,
  seasons: any[],
  seasonRates: any[],
  roomId: string,
) {
  const rates: any[] = [];
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur < end) {
    const dateStr = cur.toISOString().split("T")[0];
    let dayRate = baseRate;
    if (seasons.length > 0) {
      for (const s of seasons) {
        const sStart = s.start_date || s.startDate;
        const sEnd = s.end_date || s.endDate;
        if (sStart && sEnd && dateStr >= sStart && dateStr <= sEnd) {
          const sr = seasonRates?.find(
            (r: any) =>
              (r.room_id === roomId || r.room_type_id === roomId) &&
              r.season_id === s.id,
          );
          if (sr?.rate || sr?.daily_rate) {
            dayRate = sr.rate || sr.daily_rate;
          } else if (s.rate_multiplier) {
            dayRate = baseRate * (s.rate_multiplier || 1);
          }
          break;
        }
      }
    }
    rates.push({ date: dateStr, room_amount: dayRate });
    cur.setDate(cur.getDate() + 1);
  }
  return rates;
}

function transformCacheToAvailability(
  cacheData: any[],
  roomAliases: Map<string, string[]>,
  activeRoomTypes?: Map<string, string>, // id -> current canonical name
) {
  const roomTypeMap = new Map<string, any>();
  for (const row of cacheData) {
    const rtId = row.external_room_type_id;

    // Drop cache rows that no longer belong to an active room type on this property.
    // Prevents ghost rows (like the stale "Property" entry that leaked into ONE46 ON M)
    // from ever reaching the calendar UI.
    if (activeRoomTypes && !activeRoomTypes.has(rtId)) continue;

    if (!roomTypeMap.has(rtId)) {
      const aliases: string[] = [rtId];
      for (const [origId, slugArr] of roomAliases) {
        if (slugArr.includes(rtId)) aliases.push(origId);
      }
      // Prefer the live canonical name from hostfully_room_types over anything the
      // cache may have stored (which can be stale or a placeholder like "Property").
      const canonicalName = activeRoomTypes?.get(rtId);
      roomTypeMap.set(rtId, {
        room_type_id: rtId,
        room_type_aliases: aliases,
        room_type_name: canonicalName || row.raw_data?.roomTypeName || rtId,
        rooms_available_per_night: [],
        rate_types: [],
      });
    }
    const rt = roomTypeMap.get(rtId)!;
    rt.rooms_available_per_night.push({
      date: row.date,
      available_units: row.available_units,
      ...(row.restrictions || {}),
    });
    const ratesData = row.rates;
    if (ratesData) {
      const ratesArray = Array.isArray(ratesData) ? ratesData : [ratesData];
      for (const rate of ratesArray) {
        const rateTypeId = rate.rate_type_id || "default";
        let rateType = rt.rate_types.find((r: any) => r.rate_type_id === rateTypeId);
        if (!rateType) {
          rateType = {
            rate_type_id: rateTypeId,
            rate_type_name: rate.rate_type_name || "Standard",
            price_type: rate.price_type || "PER_ROOM",
            rate_key: rate.rate_key,
            rates: [],
          };
          rt.rate_types.push(rateType);
        }
        rateType.rates.push({
          date: row.date,
          room_amount: rate.room_amount,
          adult_amounts: rate.adult_amounts,
          teen_amount: rate.teen_amount,
          child_amount: rate.child_amount,
          infant_amount: rate.infant_amount,
          currency: rate.currency,
        });
      }
    }
  }
  return { room_types: Array.from(roomTypeMap.values()) };
}


// ─── PMS adapter dispatch ──────────────────────────────────────────────

function getPmsFunctionName(ext: string) {
  switch (ext) {
    case "benson": return "benson-api";
    case "hostfully": return "hostfully-api";
    case "hotelbeds": return "hotelbeds-api";
    case "hyperguest": return "hyperguest-api";
    case "little_hotelier": return "little-hotelier-api";
    default: return "roomsonline-pms-api";
  }
}

async function callPmsAdapter(
  supabaseUrl: string,
  serviceKey: string,
  externalSystem: string,
  propertyId: string,
  startDate: string,
  endDate: string,
) {
  const fnName = getPmsFunctionName(externalSystem);
  const body: Record<string, unknown> = {
    action: "fetch_availability",
    property_id: propertyId,
    start_date: startDate,
    end_date: endDate,
  };
  if (externalSystem === "hotelbeds") {
    body.startDate = startDate;
    body.endDate = endDate;
  }
  const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PMS adapter ${fnName} returned ${res.status}`);
  const json = await res.json();
  return json?.data || json;
}

// ─── availability resolvers ────────────────────────────────────────────

async function resolveFromCache(
  supabase: any,
  propertyId: string,
  startDate: string,
  endDate: string,
  roomTypes: any[],
) {
  const { data: cacheData, error } = await supabase
    .from("pms_availability_cache")
    .select("*")
    .eq("property_id", propertyId)
    .gte("date", startDate)
    .lt("date", endDate)
    .order("date");
  if (error) throw error;
  if (!cacheData || cacheData.length === 0) return null;

  const roomAliases = new Map<string, string[]>();
  for (const rt of roomTypes) {
    roomAliases.set(String(rt.id), [slugify(rt.name)]);
  }

  // Load the property's live active room types so we can drop stale/ghost cache rows
  // and always show the current canonical name (see ONE46 ON M incident, 2026-07).
  const activeRoomTypes = new Map<string, string>();
  const { data: hfRooms } = await supabase
    .from("hostfully_room_types")
    .select("id, name")
    .eq("property_id", propertyId)
    .eq("is_active", true);
  if (hfRooms) {
    for (const r of hfRooms as any[]) activeRoomTypes.set(String(r.id), r.name);
  }

  return transformCacheToAvailability(
    cacheData,
    roomAliases,
    activeRoomTypes.size > 0 ? activeRoomTypes : undefined,
  );
}


async function resolveRolosRates(
  supabase: any,
  propertyId: string,
  startDate: string,
  endDate: string,
  embedRate?: number,
  embedRoomTypeId?: string,
  embedPricingModel?: string,
  embedLinkedRolosId?: string,
  occupancy?: { adults: number; teens: number; children: number; units: number },
) {
  const { data: hfRoomRows } = await supabase
    .from("hostfully_room_types")
    .select("id, name, linked_rolos_id, daily_rate, max_guests, is_active")
    .eq("property_id", propertyId)
    .eq("is_active", true);

  // Native ROL'OS properties whose unit mirror has no active rows still have
  // sellable ROL'OS room types with Rate Plan prices — use those as the units.
  let hfRooms: any[] = (hfRoomRows || []) as any[];
  if (hfRooms.length === 0) {
    const { data: nativeRooms } = await supabase
      .from("rolos_room_types")
      .select("id, name, max_occupancy")
      .eq("property_id", propertyId)
      .eq("is_active", true);
    hfRooms = ((nativeRooms || []) as any[]).map((r) => ({
      id: r.id,
      name: r.name,
      linked_rolos_id: r.id,
      daily_rate: null,
      max_guests: r.max_occupancy ?? null,
      is_active: true,
    }));
  }

  const rolosIds = (hfRooms || []).filter((r: any) => r.linked_rolos_id).map((r: any) => r.linked_rolos_id);
  const ratePlanMap: Record<string, any> = {};
  const closedDatesByRoom: Record<string, Set<string>> = {};
  /** Every live plan↔unit link, used to build the length-of-stay offer list. */
  const planLinkRows: any[] = [];

  if (rolosIds.length > 0) {
    const { data: rpRoomTypes } = await supabase
      .from("rolos_rate_plan_room_types")
      .select("room_type_id, rate_plan_id, rolos_rate_plans!inner(id, name, base_rate, pricing_model, adult_1_rate, adult_2_rate, teen_rate, child_rate, infant_rate, is_active, min_stay, max_stay, sell_priority)")
      .in("room_type_id", rolosIds)
      .eq("rolos_rate_plans.is_active", true);

    if (rpRoomTypes) {
      planLinkRows.push(...(rpRoomTypes as any[]));
      for (const entry of rpRoomTypes) {
        const plan = (entry as any).rolos_rate_plans;
        if (plan?.base_rate != null) {
          ratePlanMap[entry.room_type_id] = {
            base_rate: Number(plan.base_rate),
            pricing_model: plan.pricing_model || "per_unit",
            adult_1_rate: plan.adult_1_rate ? Number(plan.adult_1_rate) : undefined,
            adult_2_rate: plan.adult_2_rate ? Number(plan.adult_2_rate) : undefined,
            teen_rate: plan.teen_rate != null ? Number(plan.teen_rate) : undefined,
            child_rate: plan.child_rate != null ? Number(plan.child_rate) : undefined,
            infant_rate: plan.infant_rate != null ? Number(plan.infant_rate) : undefined,
            rate_plan_id: plan.id,
            rate_plan_name: plan.name || null,
          };
        }
      }

      // Fetch rate-plan stop-sell closures overlapping the requested range
      const planIds = rpRoomTypes.map((e: any) => e.rate_plan_id).filter(Boolean);
      if (planIds.length > 0) {
        const { data: closures } = await supabase
          .from("rolos_rate_plan_stop_sell")
          .select("rate_plan_id, date")
          .in("rate_plan_id", planIds)
          .gte("date", startDate)
          .lte("date", endDate);
        if (closures && closures.length > 0) {
          const planToRooms: Record<string, string[]> = {};
          for (const entry of rpRoomTypes) {
            const pid = (entry as any).rate_plan_id;
            if (!pid) continue;
            (planToRooms[pid] ||= []).push(entry.room_type_id);
          }
          for (const c of closures) {
            const rooms = planToRooms[c.rate_plan_id] || [];
            for (const rid of rooms) {
              (closedDatesByRoom[rid] ||= new Set<string>()).add(c.date);
            }
          }
        }
      }
    }
  }

  // Embed rate override
  if (embedRate && embedRoomTypeId) {
    const matched = (hfRooms || []).find((r: any) => r.id === embedRoomTypeId);
    if (matched?.linked_rolos_id) {
      ratePlanMap[matched.linked_rolos_id] = {
        base_rate: embedRate,
        pricing_model: embedPricingModel || "per_unit",
      };
    } else if (embedLinkedRolosId) {
      ratePlanMap[embedLinkedRolosId] = {
        base_rate: embedRate,
        pricing_model: embedPricingModel || "per_unit",
      };
    }
  }

  // ── Load property amenities (seasons + per-room seasonal rates from admin calendar)
  const { data: propRow } = await supabase
    .from("properties")
    .select("amenities")
    .eq("id", propertyId)
    .maybeSingle();
  const amenities: any = propRow?.amenities || {};
  const seasons: any[] = Array.isArray(amenities.seasons) ? amenities.seasons : [];
  const seasonRates: Record<string, any> = (amenities.season_rates && typeof amenities.season_rates === "object")
    ? amenities.season_rates
    : {};
  const amenityRoomIdByName: Record<string, string> = {};
  if (Array.isArray(amenities.room_types)) {
    for (const room of amenities.room_types) {
      if (room?.name && room?.id) {
        amenityRoomIdByName[String(room.name).trim().toLowerCase()] = String(room.id);
      }
    }
  }

  // Build linked_rolos_id → amenity room id (linked_overview_id) map
  const rolosToOverview: Record<string, string> = {};
  const rolosIdToName: Record<string, string> = {};
  if (rolosIds.length > 0) {
    const { data: rrt } = await supabase
      .from("rolos_room_types")
      .select("id, linked_overview_id, name")
      .in("id", rolosIds);
    if (rrt) {
      for (const r of rrt as any[]) {
        if (r.linked_overview_id) rolosToOverview[r.id] = String(r.linked_overview_id);
        if (r.name) rolosIdToName[r.id] = r.name;
      }
    }
  }

  function findSeasonForDate(dateStr: string): any | null {
    for (const s of seasons) {
      const periods = Array.isArray(s.periods) && s.periods.length > 0
        ? s.periods
        : [{ from: s.from || s.start_date || s.startDate, to: s.to || s.end_date || s.endDate }];
      for (const period of periods) {
        const sStart = period?.from || period?.start_date || period?.startDate;
        const sEnd = period?.to || period?.end_date || period?.endDate;
        if (sStart && sEnd && dateStr >= sStart && dateStr <= sEnd) return s;
      }
    }
    return null;
  }

  function resolveSeasonalRoomAmount(
    dateStr: string,
    keys: string[],
    preferredRatePlanId?: string,
  ): number | null {
    const season = findSeasonForDate(dateStr);
    if (!season) return null;
    const seasonId = String(season.id);
    for (const k of keys) {
      if (!k) continue;
      const bucket = seasonRates[k];
      if (!bucket || typeof bucket !== "object") continue;
      // 1) Preferred rate plan key
      if (preferredRatePlanId) {
        const v = bucket[`${seasonId}-${preferredRatePlanId}`];
        if (v && Number(v.roomAmount) > 0) return Number(v.roomAmount);
      }
      // 2) Any sub-key starting with `${seasonId}-` with a positive roomAmount
      for (const subKey of Object.keys(bucket)) {
        if (!subKey.startsWith(`${seasonId}-`)) continue;
        const v = bucket[subKey];
        if (v && Number(v.roomAmount) > 0) return Number(v.roomAmount);
      }
    }
    return null;
  }

  // ── Shared rate resolver (single source of truth for native ROL'OS pricing).
  // Tier order: daily override → rate-plan season rate → calendar season →
  // relational season → rack rate → unit daily rate. See _shared/rateResolution.ts.
  let resolver: Awaited<ReturnType<typeof createRateResolver>> | null = null;
  try {
    resolver = await createRateResolver(supabase, propertyId, {
      amenities,
      window: { from: startDate, to: endDate },
      audience: "direct",
    });
  } catch (e) {
    console.warn("[orchestrator] rate resolver unavailable, using calendar fallback:", e);
  }

  /**
   * Build one room-type block. `res`/`planOverride` let the offers pass below
   * re-price the same unit from another eligible rate plan without changing the
   * default (winning-plan) result.
   */
  const buildRoomType = (
    room: any,
    res: typeof resolver,
    planOverride: any | null,
  ) => {
    const rolosPlan = planOverride ?? (room.linked_rolos_id ? ratePlanMap[room.linked_rolos_id] : null);
    const fallbackRate = rolosPlan?.base_rate ?? (room.daily_rate ? Number(room.daily_rate) : 0);
    const pricingModel = canonicalPricingModel(rolosPlan?.pricing_model ?? "per_unit");
    const isPerPerson = pricingModel === "per_person";
    const isSharing = pricingModel === "per_person_sharing";


    // Amenity/room identifiers used to look into season_rates
    const overviewId = room.linked_rolos_id ? rolosToOverview[room.linked_rolos_id] : undefined;
    const rolosName = room.linked_rolos_id ? rolosIdToName[room.linked_rolos_id] : undefined;
    const amenityIdFromName = room.name ? amenityRoomIdByName[String(room.name).trim().toLowerCase()] : undefined;
    const lookupKeys = [overviewId, amenityIdFromName, room.linked_rolos_id, rolosName, room.name].filter(Boolean) as string[];
    const preferredPlanId = rolosPlan?.rate_plan_id;

    // Resolver prices for this unit, keyed by night. `endDate` is the checkout
    // date (exclusive), so the resolver window ends the night before.
    const resolvedByDate = new Map<string, DayRate>();
    if (res) {
      const lastNight = addDaysIso(endDate, -1);
      if (lastNight >= startDate) {
        for (const day of res.resolveDays(
          { id: room.id, name: room.name, linked_rolos_id: room.linked_rolos_id },
          startDate,
          lastNight,
        )) {
          resolvedByDate.set(day.date, day);
        }
      }
    }
    // An embed rate override must not be overwritten by the rack tier.
    const hasEmbedOverride = Boolean(embedRate) && rolosPlan?.base_rate === embedRate;

    // Stay-shape quote for the same window. Length-of-stay ladders adjust the
    // published nightly series; full-stay cells are applied at book time only
    // (availability must still paint a nightly number), so we only publish the
    // additive `stay_quote` descriptor for them.
    let stayQuoteBlock:
      | { shape: string; nights: number; source: string; display_per_night: number; stay_total: number }
      | null = null;
    const losByDate = new Map<string, number>();
    if (res) {
      const lastNight = addDaysIso(endDate, -1);
      if (lastNight >= startDate) {
        try {
          const quote = res.quoteStay(
            { id: room.id, name: room.name, linked_rolos_id: room.linked_rolos_id },
            {
              from: startDate,
              to: lastNight,
              adults: occupancy?.adults ?? 2,
              teens: occupancy?.teens ?? 0,
              children: occupancy?.children ?? 0,
              units: occupancy?.units ?? 1,
            },
          );
          stayQuoteBlock = {
            shape: quote.shape,
            nights: quote.nights,
            source: String(quote.source),
            display_per_night: quote.display_per_night,
            stay_total: quote.stay_total,
          };
          if (quote.shape === "los_nightly" && Array.isArray(quote.nightly)) {
            const dates = [...resolvedByDate.keys()].sort();
            if (dates.length === quote.nightly.length) {
              dates.forEach((d, i) => losByDate.set(d, Number(quote.nightly![i])));
            }
          }
        } catch {
          stayQuoteBlock = null;
        }
      }
    }


    const dailyRates: any[] = [];
    const availArr: any[] = [];
    const cur = new Date(startDate);
    const end = new Date(endDate);
    const closedSet = room.linked_rolos_id ? closedDatesByRoom[room.linked_rolos_id] : undefined;
    while (cur < end) {
      const ds = cur.toISOString().split("T")[0];
      const isClosed = closedSet?.has(ds) ?? false;
      let resolvedRate: number | null = null;
      if (!isClosed) {
        const day = resolvedByDate.get(ds);
        if (day && Number(day.price) > 0) {
          const isSeasonalTier = day.source !== "rack_rate" && day.source !== "unit_daily_rate";
          if (isSeasonalTier || !hasEmbedOverride) resolvedRate = Number(day.price);
        }
        if (resolvedRate === null) {
          resolvedRate = resolveSeasonalRoomAmount(ds, lookupKeys, preferredPlanId);
        }
      }
      const effectiveRate = resolvedRate ?? fallbackRate;
      // A matching length-of-stay rung replaces the nightly for resolver-priced
      // nights only; fallback/embed nights keep today's number.
      const losRate = losByDate.get(ds);
      const shapedRate = (!isClosed && losRate !== undefined && losRate > 0 && resolvedByDate.has(ds))
        ? losRate
        : effectiveRate;
      const nightly = isClosed ? 0 : shapedRate;
      // Per-person models must publish occupancy amounts, otherwise checkout
      // (which reads adult_amounts for PER_PERSON) resolves the stay to zero.
      const perPersonAmounts = isPerPerson
        ? {
            adult_amounts: {
              adult_amount_1: rolosPlan?.adult_1_rate ?? nightly,
              adult_amount_2: rolosPlan?.adult_2_rate ?? nightly * 2,
            },
            extra_adult_amount: rolosPlan?.adult_1_rate ?? nightly,
            teen_amount: rolosPlan?.teen_rate ?? nightly,
            child_amount: rolosPlan?.child_rate ?? nightly,
            infant_amount: rolosPlan?.infant_rate ?? 0,
          }
        : isSharing
          ? {
              // Base rate covers 2 guests; extra adults are billed separately.
              adult_amounts: {
                adult_amount_1: rolosPlan?.adult_1_rate ?? nightly,
                adult_amount_2: nightly,
              },
              extra_adult_amount: rolosPlan?.adult_1_rate ?? nightly / 2,
              teen_amount: rolosPlan?.teen_rate ?? 0,
              child_amount: rolosPlan?.child_rate ?? 0,
              infant_amount: rolosPlan?.infant_rate ?? 0,
            }
          : {};
      dailyRates.push({ date: ds, room_amount: nightly, stop_sell: isClosed || undefined, ...perPersonAmounts });
      availArr.push({ date: ds, available_units: isClosed ? 0 : 99 });
      cur.setDate(cur.getDate() + 1);
    }

    return {
      room_type_id: room.id,
      room_type_name: room.name,
      rate_types: [{
        // Publish the real ROL'OS rate plan identity so consumers (calendar,
        // widgets) label prices with the plan the operator actually authored.
        rate_type_id: rolosPlan?.rate_plan_id ? String(rolosPlan.rate_plan_id) : "rolos-rate",
        rate_type_name: rolosPlan?.rate_plan_name || "Standard Rate",
        price_type: priceTypeForModel(pricingModel),
        rates: dailyRates,
        ...(stayQuoteBlock ? { stay_quote: stayQuoteBlock } : {}),
      }],
      rooms_available_per_night: availArr,
    };
  };

  const syntheticRoomTypes = (hfRooms || []).map((room: any) => buildRoomType(room, resolver, null));

  // ── Length-of-stay aware offers ─────────────────────────────────────────
  // Each unit publishes every rate plan that accepts the searched stay length:
  // a 1-night search only sees the plans with no minimum, a 3-night search sees
  // the 3-night plans too. The plan that wins today stays first in the list.
  const stayNights = Math.max(
    1,
    Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000),
  );
  const lastStayNight = addDaysIso(endDate, -1);
  if (resolver && planLinkRows.length > 0 && lastStayNight >= startDate) {
    try {
      const planMeta = new Map<string, { plan: any; rooms: Set<string> }>();
      for (const link of planLinkRows) {
        const plan = (link as any).rolos_rate_plans;
        if (!plan?.id) continue;
        const key = String(plan.id);
        const entry = planMeta.get(key) ?? { plan, rooms: new Set<string>() };
        entry.rooms.add(String(link.room_type_id));
        planMeta.set(key, entry);
      }

      // Dated event windows (a LOS rung carrying a minimum-nights value).
      const windowsByPlan: Record<string, OfferWindow[]> = {};
      try {
        const { data: rungRows } = await supabase
          .from("rolos_rate_plan_los_rungs")
          .select("rate_plan_id, room_type_id, start_date, end_date, min_stay_nights")
          .in("rate_plan_id", [...planMeta.keys()]);
        for (const row of (rungRows ?? []) as any[]) {
          if (!row.min_stay_nights) continue;
          (windowsByPlan[String(row.rate_plan_id)] ||= []).push({
            start_date: row.start_date ?? null,
            end_date: row.end_date ?? null,
            room_type_id: row.room_type_id ? String(row.room_type_id) : null,
            min_stay_nights: Number(row.min_stay_nights),
          });
        }
      } catch (_) { /* column/table missing on a preview branch — no dated windows */ }

      // Operator-authored stay rules (Minimum Stay Entry). A rule with no rate
      // plan applies to every plan; a plan-scoped rule binds only that plan.
      const stayRules: { rule: StayRule; rate_plan_id: string | null }[] = [];
      try {
        const { data: ruleRows } = await supabase
          .from("rolos_stay_restrictions")
          .select("rate_plan_id, room_type_id, start_date, end_date, min_stay, max_stay, other_days_min_stay, days_of_week, ignore_within_days, closed_to_arrival, closed_to_departure, is_active")
          .eq("property_id", propertyId)
          .eq("is_active", true);
        for (const row of (ruleRows ?? []) as any[]) {
          stayRules.push({ rule: row as StayRule, rate_plan_id: row.rate_plan_id ? String(row.rate_plan_id) : null });
        }
      } catch (_) { /* advisory store unavailable — plan minimums still apply */ }

      const offerPlans: OfferPlan[] = [...planMeta.entries()].map(([id, entry]) => ({
        rate_plan_id: id,
        name: entry.plan?.name ?? null,
        min_stay: entry.plan?.min_stay ?? null,
        max_stay: entry.plan?.max_stay ?? null,
        room_type_ids: [...entry.rooms],
        windows: windowsByPlan[id] ?? [],
      }));

      // One resolver per offered plan, so each offer is priced from its own plan.
      const MAX_OFFERS = 6;
      const offeredIds = offerPlans.slice(0, MAX_OFFERS).map((p) => p.rate_plan_id);
      const resolverByPlan = new Map<string, typeof resolver>();
      for (const planId of offeredIds) {
        try {
          resolverByPlan.set(
            planId,
            await createRateResolver(supabase, propertyId, {
              amenities,
              window: { from: startDate, to: endDate },
              audience: "direct",
              preferRatePlanId: planId,
            }),
          );
        } catch (e) {
          console.warn("[orchestrator] offer resolver failed for plan", planId, e);
        }
      }

      for (const roomBlock of syntheticRoomTypes) {
        const room = (hfRooms || []).find((r: any) => r.id === roomBlock.room_type_id);
        const unitId = room?.linked_rolos_id ? String(room.linked_rolos_id) : null;
        if (!room || !unitId) continue;
        const stay: OfferStay = {
          from: startDate,
          to: lastStayNight,
          nights: stayNights,
          room_type_id: unitId,
        };
        const todayIso = new Date().toISOString().slice(0, 10);
        const ruleWindowsByPlan: Record<string, OfferWindow[]> = {};
        for (const entry of stayRules) {
          const win = stayRuleWindow(entry.rule, stay, todayIso);
          if (!win) continue;
          for (const planId of offeredIds) {
            if (entry.rate_plan_id && entry.rate_plan_id !== planId) continue;
            (ruleWindowsByPlan[planId] ||= []).push(win);
          }
        }
        const defaultId = String(roomBlock.rate_types[0]?.rate_type_id ?? "");
        const entries: any[] = [];
        for (const offer of offerPlans) {
          if (!offeredIds.includes(offer.rate_plan_id)) continue;
          const verdict = offerEligibility(
            { ...offer, windows: [...(offer.windows ?? []), ...(ruleWindowsByPlan[offer.rate_plan_id] ?? [])] },
            stay,
          );
          if (!verdict.eligible) continue;
          const planResolver = resolverByPlan.get(offer.rate_plan_id);
          if (!planResolver) continue;
          const meta = planMeta.get(offer.rate_plan_id)?.plan;
          const priced = buildRoomType(room, planResolver, {
            base_rate: meta?.base_rate != null ? Number(meta.base_rate) : undefined,
            pricing_model: meta?.pricing_model || "per_unit",
            adult_1_rate: meta?.adult_1_rate != null ? Number(meta.adult_1_rate) : undefined,
            adult_2_rate: meta?.adult_2_rate != null ? Number(meta.adult_2_rate) : undefined,
            teen_rate: meta?.teen_rate != null ? Number(meta.teen_rate) : undefined,
            child_rate: meta?.child_rate != null ? Number(meta.child_rate) : undefined,
            infant_rate: meta?.infant_rate != null ? Number(meta.infant_rate) : undefined,
            rate_plan_id: offer.rate_plan_id,
            rate_plan_name: offer.name,
          });
          const rateType = priced.rate_types[0];
          if (!rateType || !rateType.rates?.some((r: any) => Number(r.room_amount) > 0)) continue;
          entries.push({ ...rateType, min_stay: verdict.min_stay, max_stay: verdict.max_stay });
        }
        if (entries.length === 0) continue;
        entries.sort((a, b) =>
          (String(a.rate_type_id) === defaultId ? 0 : 1) - (String(b.rate_type_id) === defaultId ? 0 : 1)
        );
        roomBlock.rate_types = entries;
      }
    } catch (e) {
      console.warn("[orchestrator] rate-plan offers unavailable:", e);
    }
  }

  if (syntheticRoomTypes.length > 0 && syntheticRoomTypes.some((rt: any) => rt.rate_types[0]?.rates[0]?.room_amount > 0)) {
    return { room_types: syntheticRoomTypes, hf_rooms: (hfRooms || []).map((r: any) => ({ id: r.id, name: r.name, linked_rolos_id: r.linked_rolos_id })) };
  }

  return null;
}

async function resolveWizardRates(
  supabase: any,
  propertyId: string,
  startDate: string,
  endDate: string,
  amenities: any,
) {
  const wizardRooms = amenities?.room_types || [];
  const seasons = amenities?.seasons || [];
  const seasonRates = amenities?.season_rates || [];
  const pmsRateTypes = amenities?.pms_rate_types || [];

  if (wizardRooms.length === 0) return null;

  // Fetch manual availability overrides
  const { data: manualOverrides } = await supabase
    .from("property_availability")
    .select("*")
    .eq("property_id", propertyId)
    .gte("date", startDate)
    .lt("date", endDate);

  const blockedDatesMap = new Map<string, Set<string>>();
  if (manualOverrides?.length) {
    for (const ov of manualOverrides) {
      if (ov.is_stop_sell || ov.available_units === 0) {
        const key = ov.room_type;
        if (!blockedDatesMap.has(key)) blockedDatesMap.set(key, new Set());
        blockedDatesMap.get(key)!.add(ov.date);
      }
    }
  }

  const syntheticRoomTypes = wizardRooms.map((room: any) => {
    const roomId = room.id || room.room_type_id || `wizard-room-${room.name}`;
    let baseRate = 0;
    let rateUnit = room.rate_unit || room.rateUnit || "per_night";
    let pricingModel = "";
    let adult1Rate = 0, adult2Rate = 0, childRate = 0, teenRate = 0, infantRate = 0;

    if (room.linkedRateTypes?.length > 0 && pmsRateTypes.length > 0) {
      const linked = pmsRateTypes.find((rt: any) => rt.id === room.linkedRateTypes[0]);
      if (linked) {
        baseRate = linked.baseRate || 0;
        pricingModel = linked.pricingModel || linked.priceType || "";
        adult1Rate = linked.adult1Rate || 0;
        adult2Rate = linked.adult2Rate || 0;
        childRate = linked.childRate || 0;
        teenRate = linked.teenRate || 0;
        infantRate = linked.infantRate || 0;
        if (pricingModel.toLowerCase().includes("person")) rateUnit = "per_person";
      }
    }
    if (!baseRate) baseRate = room.base_rate || room.baseRate || room.daily_rate || 0;

    const isPerPerson = canonicalPricingModel(rateUnit) === "per_person";
    let dailyRates: any[];

    if (isPerPerson && (adult1Rate > 0 || adult2Rate > 0)) {
      dailyRates = [];
      const cur = new Date(startDate);
      const end = new Date(endDate);
      while (cur < end) {
        const ds = cur.toISOString().split("T")[0];
        dailyRates.push({
          date: ds,
          room_amount: baseRate,
          adult_amount_1: adult1Rate || baseRate,
          adult_amount_2: adult2Rate || baseRate * 2,
          teen_amount: teenRate,
          child_amount: childRate,
          infant_amount: infantRate,
        });
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      dailyRates = generateDailyRates(startDate, endDate, baseRate, seasons, seasonRates, roomId);
    }

    const blockedDates = blockedDatesMap.get(room.name) || new Set();
    const availArr: any[] = [];
    const cur2 = new Date(startDate);
    const end2 = new Date(endDate);
    while (cur2 < end2) {
      const ds = cur2.toISOString().split("T")[0];
      availArr.push({ date: ds, available_units: blockedDates.has(ds) ? 0 : 99 });
      cur2.setDate(cur2.getDate() + 1);
    }

    return {
      room_type_id: roomId,
      room_type_name: room.name,
      rate_types: [{
        rate_type_id: "wizard-rate",
        rate_type_name: "Standard Rate",
        price_type: isPerPerson ? "PER_PERSON" : rateUnit === "per_stay" ? "PerStay" : "PER_NIGHT",
        rates: dailyRates,
      }],
      rooms_available_per_night: availArr,
    };
  });

  return { room_types: syntheticRoomTypes };
}

// ─── main handler ──────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Keep-warm probe — returns before any ARI work; never touches availability.
  if (req.headers.get("x-warm") === "1") {
    return new Response(JSON.stringify({ success: true, warm: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {

    const body = await req.json();
    const { action } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── validate_voucher ─────────────────────────────────────────────
    if (action === "validate_voucher") {
      const res = await fetch(`${supabaseUrl}/functions/v1/validate-voucher`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          code: body.code,
          property_id: body.property_id,
          subtotal: body.subtotal,
        }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── fetch_availability ───────────────────────────────────────────
    if (action === "fetch_availability") {
      const {
        property_id,
        start_date,
        end_date,
        embed_rate,
        embed_room_type_id,
        embed_pricing_model,
        embed_linked_rolos_id,
        room_types: clientRoomTypes,
      } = body;

      // Optional guest occupancy for stay-shape quoting. Omitted fields keep
      // today's defaults so callers that send no pax get an identical result.
      const occupancy = {
        adults: Math.max(1, Number(body.adults) || 2),
        teens: Math.max(0, Number(body.teens) || 0),
        children: Math.max(0, Number(body.children) || 0),
        units: Math.max(1, Number(body.units) || 1),
      };

      if (!property_id || !start_date || !end_date) {
        return fail("Missing property_id, start_date, or end_date");
      }

      // 1. Look up property
      const { data: prop, error: propErr } = await supabase
        .from("properties")
        .select("id, external_system, is_rol_property, amenities")
        .eq("id", property_id)
        .single();
      if (propErr || !prop) return fail("Property not found", 404);

      const ext = (prop.external_system || "").toLowerCase();
      const amenities = prop.amenities as any;
      const roomTypes = clientRoomTypes || amenities?.room_types || [];

      // 2. Route to correct adapter
      const liveAdapters = ["benson", "hostfully", "hotelbeds", "hyperguest"];

      if (liveAdapters.includes(ext)) {
        const requestedDays = Math.ceil(
          (new Date(end_date).getTime() - new Date(start_date).getTime()) / (1000 * 60 * 60 * 24)
        );

        // Cache-first window: 30 min for short ranges (checkout), 24 h for long ranges (calendar view).
        const maxCacheAgeMin = requestedDays <= 31 ? 30 : 24 * 60;

        // Inspect cache: how old is the oldest row in the window, and is coverage full?
        const { data: cacheMeta } = await supabase
          .from("pms_availability_cache")
          .select("fetched_at, date")
          .eq("property_id", property_id)
          .gte("date", start_date)
          .lt("date", end_date)
          .order("fetched_at", { ascending: false });

        const cached = await resolveFromCache(supabase, property_id, start_date, end_date, roomTypes);
        const hasCacheData = !!(cached && cached.room_types?.length > 0);
        const newestAgeMin = cacheMeta?.[0]?.fetched_at
          ? (Date.now() - new Date(cacheMeta[0].fetched_at).getTime()) / 60000
          : Infinity;
        const oldestAgeMin = cacheMeta?.length
          ? (Date.now() - new Date(cacheMeta[cacheMeta.length - 1].fetched_at).getTime()) / 60000
          : Infinity;
        const isStale = oldestAgeMin >= maxCacheAgeMin;

        // Distinct dates covered in window
        const distinctDates = new Set((cacheMeta || []).map((r: any) => r.date));
        const fullCoverage = distinctDates.size >= requestedDays;

        // If we have any cached data and it covers the window, serve it.
        // If stale, fire a background refresh so next view is fresh.
        if (hasCacheData && fullCoverage) {
          if (isStale) {
            console.log(`[orchestrator] Serving stale cache for ${ext} (oldest ${Math.round(oldestAgeMin)}min) + background refresh`);
            // Refresh a broader window so subsequent views (calendar) also benefit
            const refreshEnd = new Date(end_date);
            refreshEnd.setDate(refreshEnd.getDate() + 90);
            const refreshEndStr = refreshEnd.toISOString().split("T")[0];
            const refreshPromise = callPmsAdapter(supabaseUrl, serviceKey, ext, property_id, start_date, refreshEndStr)
              .catch((e) => console.warn(`[orchestrator] Background refresh failed:`, e));
            // @ts-ignore EdgeRuntime available in Supabase Edge
            if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
              // @ts-ignore
              EdgeRuntime.waitUntil(refreshPromise);
            }
          } else {
            console.log(`[orchestrator] Cache hit for ${ext} (${requestedDays}d, newest ${Math.round(newestAgeMin)}min old, ${cached!.room_types.length} room types)`);
          }
          return ok(cached);
        }

        // Cache empty or doesn't cover the window → live call (also re-hydrates cache)
        try {
          const availability = await callPmsAdapter(supabaseUrl, serviceKey, ext, property_id, start_date, end_date);
          // If live returned thin data but cache has richer multi-room data, prefer cache
          const liveRoomCount = availability?.room_types?.length || 0;
          const cachedRoomCount = cached?.room_types?.length || 0;
          if (hasCacheData && cachedRoomCount > liveRoomCount) {
            console.log(`[orchestrator] Live returned ${liveRoomCount} rooms, cache has ${cachedRoomCount} — preferring cache`);
            return ok(cached);
          }
          return ok(availability);
        } catch (liveErr) {
          console.warn(`[orchestrator] Live call failed, falling back to cache:`, liveErr);
          if (hasCacheData) return ok(cached);
          throw liveErr;
        }
      }


      // 3. Try PMS availability cache (for synced PMS systems)
      if (ext && ext !== "none" && ext !== "roomsonline" && ext !== "manual") {
        const cached = await resolveFromCache(supabase, property_id, start_date, end_date, roomTypes);
        if (cached) return ok(cached);
      }

      // 4. No PMS / manual / roomsonline → ROL'OS rate plans or wizard
      if (!ext || ext === "none" || ext === "roomsonline" || ext === "manual") {
        const isRolProperty = !!prop.is_rol_property;

        // Check for linked ROL'OS rooms
        let hasLinkedRolos = false;
        if (!isRolProperty && !embed_rate) {
          const { data: linked } = await supabase
            .from("hostfully_room_types")
            .select("id")
            .eq("property_id", property_id)
            .eq("is_active", true)
            .not("linked_rolos_id", "is", null)
            .limit(1);
          hasLinkedRolos = !!(linked && linked.length > 0);
        }

        if (isRolProperty || embed_rate || hasLinkedRolos) {
          const rolosResult = await resolveRolosRates(
            supabase, property_id, start_date, end_date,
            embed_rate, embed_room_type_id, embed_pricing_model, embed_linked_rolos_id,
            occupancy,
          );
          if (rolosResult) return ok(rolosResult);
        }

        // Wizard fallback
        const wizardResult = await resolveWizardRates(supabase, property_id, start_date, end_date, amenities);
        if (wizardResult) return ok(wizardResult);
      }

      // 5. Try cache as last resort
      const cached = await resolveFromCache(supabase, property_id, start_date, end_date, roomTypes);
      if (cached) return ok(cached);

      // Nothing found
      return ok(safeParseResponse(AvailabilityResponseSchema, { room_types: [] }, "orchestrator-empty"));
    }

    return fail("Unknown action: " + action);
  } catch (err) {
    console.error("booking-orchestrator-api error:", err);
    return fail(String(err), 500);
  }
});
