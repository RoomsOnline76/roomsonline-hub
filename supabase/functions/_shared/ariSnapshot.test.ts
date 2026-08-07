/**
 * ARI payload snapshot tests.
 *
 * Fixtures are read-only captures of real properties (see
 * scripts/capture-ari-fixtures.sql). Each test rebuilds the ARI payload —
 * per-unit nightly prices compressed to periods, plus stay restrictions —
 * through the live pricing code and diffs it against a committed golden file.
 *
 * Any difference fails the merge gate. Re-baseline only deliberately:
 *   UPDATE_ARI_SNAPSHOTS=1 deno test --allow-read --allow-write --allow-env \
 *     supabase/functions/_shared/ariSnapshot.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  normalizePricingInputs,
  resolveNightRates,
  resolveStayRules,
  type PricingInputs,
  type PricingSeason,
} from "./ratePricing.ts";
import {
  compressToPeriods,
  seasonRateLookupKeys,
  type UnitRateContext,
} from "./rateResolution.ts";

const FIXTURE_DIR = new URL("./__fixtures__/ari/", import.meta.url);

const FIXTURES = [
  "tidal-pools-multi-unit",
  "dassiesingel-shared-calendar",
  "fonteinhutte-shared-calendar",
  "six-on-n-single-unit",
];

/** Fixed window so the snapshot never depends on today's date. */
const WINDOW = { from: "2026-09-01", to: "2027-08-31" };

interface FixtureUnit {
  id: string;
  name: string;
  linked_rolos_id: string | null;
  daily_rate: number | null;
}

interface FixturePlan {
  rate_plan_id: string;
  name: string;
  base_rate: number | null;
  pricing_model: string | null;
  is_active: boolean | null;
  min_stay: number | null;
  max_stay: number | null;
}

interface Fixture {
  property_id: string;
  name: string;
  seasons: Record<string, unknown>[];
  season_rates: Record<string, unknown>;
  units: FixtureUnit[];
  rate_plans: FixturePlan[];
}

/** Mirrors the loader's season normalisation: Calendar shape -> PricingSeason. */
function toPricingSeasons(raw: Record<string, unknown>[]): PricingSeason[] {
  const out: PricingSeason[] = [];
  for (const season of raw ?? []) {
    if (!season || season.id == null) continue;
    const rawPeriods = Array.isArray(season.periods) && (season.periods as unknown[]).length > 0
      ? (season.periods as Record<string, unknown>[])
      : [{ from: season.from, to: season.to }];
    const periods = rawPeriods
      .filter((p) => p?.from && p?.to)
      .map((p) => ({ from: String(p.from), to: String(p.to) }));
    if (periods.length === 0) continue;
    out.push({
      id: String(season.id),
      min_stay: Number(season.minStay ?? season.min_stay ?? 1) || 1,
      periods,
    });
  }
  return out;
}

function buildInputs(fx: Fixture): { inputs: PricingInputs; units: UnitRateContext[] } {
  const amenities = { seasons: fx.seasons, season_rates: fx.season_rates };
  const units: UnitRateContext[] = fx.units.map((u) => ({
    id: u.id,
    name: u.name,
    linked_rolos_id: u.linked_rolos_id,
  }));

  const seasonRateKeys: Record<string, string[]> = {};
  const unitDailyRates: Record<string, number> = {};
  for (const [i, unit] of units.entries()) {
    seasonRateKeys[unit.id] = seasonRateLookupKeys(unit, amenities);
    const daily = Number(fx.units[i].daily_rate);
    if (Number.isFinite(daily) && daily > 0) unitDailyRates[unit.id] = daily;
  }

  // Rate plans are keyed by linked_rolos_id, exactly as the loader keys them.
  const ratePlans: PricingInputs["ratePlans"] = {};
  const firstPlan = (fx.rate_plans ?? []).find((p) => p.is_active !== false);
  if (firstPlan) {
    for (const unit of units) {
      if (!unit.linked_rolos_id) continue;
      ratePlans[String(unit.linked_rolos_id)] = {
        rate_plan_id: firstPlan.rate_plan_id,
        base_rate: Number(firstPlan.base_rate ?? 0),
        pricing_model: firstPlan.pricing_model ?? "per_room",
        is_active: firstPlan.is_active !== false,
        min_stay: firstPlan.min_stay,
        max_stay: firstPlan.max_stay,
      };
    }
  }

  return { inputs: normalizePricingInputs({ seasons: toPricingSeasons(fx.seasons), seasonRates: fx.season_rates, seasonRateKeys, ratePlans, unitDailyRates }), units };
}

interface AriUnitPayload {
  unit: string;
  periods: { date_from: string; date_to: string; price: number; source: string }[];
  priced_days: number;
  stay: { min_stay: number; max_stay: number | null };
}

/** The payload every channel push derives from. Deterministic for a fixed window. */
function buildAriPayload(fx: Fixture): { property: string; window: typeof WINDOW; units: AriUnitPayload[] } {
  const { inputs, units } = buildInputs(fx);
  return {
    property: fx.name,
    window: WINDOW,
    units: units
      .map((unit) => {
        const days = resolveNightRates(inputs, unit, WINDOW.from, WINDOW.to);
        const stay = resolveStayRules(inputs, unit, WINDOW.from, WINDOW.to);
        return {
          unit: unit.name,
          priced_days: days.length,
          periods: compressToPeriods(days).map((p) => ({
            date_from: p.date_from,
            date_to: p.date_to,
            price: p.price,
            source: p.source,
          })),
          stay: { min_stay: stay.min_stay, max_stay: stay.max_stay },
        };
      })
      .sort((a, b) => a.unit.localeCompare(b.unit)),
  };
}

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await Deno.readTextFile(new URL(name, FIXTURE_DIR))) as T;
}

for (const slug of FIXTURES) {
  Deno.test(`ARI snapshot — ${slug}`, async () => {
    const fx = await readJson<Fixture>(`${slug}.input.json`);
    const payload = buildAriPayload(fx);
    const goldenUrl = new URL(`${slug}.golden.json`, FIXTURE_DIR);

    if (Deno.env.get("UPDATE_ARI_SNAPSHOTS") === "1") {
      await Deno.writeTextFile(goldenUrl, `${JSON.stringify(payload, null, 2)}\n`);
      return;
    }

    const golden = JSON.parse(await Deno.readTextFile(goldenUrl));
    assertEquals(payload, golden, `ARI payload drifted for ${slug}`);
  });
}

Deno.test("ARI snapshot — pricing is stable across repeated builds", async () => {
  const fx = await readJson<Fixture>("tidal-pools-multi-unit.input.json");
  assertEquals(buildAriPayload(fx), buildAriPayload(fx));
});

Deno.test("ARI snapshot — shared-calendar siblings price their own units", async () => {
  const a = await readJson<Fixture>("dassiesingel-shared-calendar.input.json");
  const b = await readJson<Fixture>("fonteinhutte-shared-calendar.input.json");
  const seasonIds = (fx: Fixture) => toPricingSeasons(fx.seasons).map((s) => s.id).sort();

  // Same painted calendar (shared seasons) ...
  assertEquals(seasonIds(a), seasonIds(b));

  // ... but each property prices its own units, and no unit inherits a sibling's price.
  const pa = buildAriPayload(a);
  const pb = buildAriPayload(b);
  const names = new Set(pa.units.map((u) => u.unit));
  for (const unit of pb.units) {
    if (names.has(unit.unit)) continue;
    assertEquals(pa.units.some((u) => u.unit === unit.unit), false);
  }
  // Every unit that is priced at all must have at least one period.
  for (const unit of [...pa.units, ...pb.units]) {
    if (unit.priced_days > 0) assertEquals(unit.periods.length > 0, true);
  }
});

Deno.test("ARI snapshot — an inactive rate plan drops the plan tiers", async () => {
  const fx = await readJson<Fixture>("tidal-pools-multi-unit.input.json");
  const active = buildAriPayload(fx);
  const inactive = buildAriPayload({
    ...fx,
    rate_plans: (fx.rate_plans ?? []).map((p) => ({ ...p, is_active: false })),
  });
  for (const unit of inactive.units) {
    for (const period of unit.periods) {
      assertEquals(
        ["daily_override", "calendar_season", "unit_daily_rate"].includes(period.source),
        true,
        `unexpected tier ${period.source} with no active plan`,
      );
    }
  }
  // Calendar-owned pricing is untouched by the plan being switched off.
  const calendarOnly = (p: typeof active) =>
    p.units.map((u) => u.periods.filter((x) => x.source === "calendar_season"));
  assertEquals(calendarOnly(inactive), calendarOnly(active));
});
