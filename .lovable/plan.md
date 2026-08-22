# Derived rate plans (Tour Operator off Rack, BAR Net off BAR)

## What this gives you

A rate plan can be marked as **derived from another plan** on the same property. The parent supplies the nightly price; the child applies an offset.

Typical setup per property:

```text
RACK (static)            -> parent
  TOUR OPERATOR   = RACK - 25%          (derived off static rack)
BAR (yielded, manual/RMS)-> parent
  BAR NET         = BAR - 12% (or -R150) (derived off BAR)
```

Rules agreed:

- **Basis: full nightly resolved price.** The child follows whatever the parent finally prices for that night — manual daily override, season rate, or rack base. So a yielded BAR (manual or RMS-driven) flows straight through to BAR Net, night by night.
- **Offset:** percentage or fixed amount, set once on the plan, with an optional per-season override (a season row can carry its own offset).
- **Fully derived, but a typed rate wins.** Derived cells render as computed values (greyed, with the formula shown). If someone types an explicit rate into a season cell, that cell is pinned and stops tracking the parent until cleared.
- **Rounding:** derived amounts round to the nearest 10.
- Only one level of derivation: a derived plan cannot itself be a parent (blocked in the UI and in the database), so there are no chains or loops.

## Where it shows up

1. **Rate plan editor (Details section)** — new "Derived pricing" block:
   - "Derive this plan's rates from" — parent plan select (active, non-derived plans on the property).
   - Offset type (Percentage / Fixed amount) + value, with sign shown as a discount or uplift.
   - When derived, the "Base rate" field becomes a read-only computed figure from the parent.
2. **Pricing by season grid** — derived cells show the computed nightly rate with a small "from RACK −25%" hint and a per-season offset field; typing a value pins the cell ("Pinned — click to release").
3. **Effective preview** — the existing preview reports `derived` as the price source, naming the parent and offset for each night.
4. **Rate plans list** — a "Derived from RACK" badge, so it is obvious which plans are yielded and which are static.

## Pricing engine

Derivation resolves in the shared engine, so every consumer gets the same numbers: booking engine, checkout, Channel Manager pushes, price coverage audit, calendar previews.

Resolution order for a derived plan's night:

1. Pinned/typed rate for that season+unit — wins outright.
2. Parent plan's resolved nightly price for the same unit and night, then offset (season override if present, otherwise the plan offset), then round to nearest 10.
3. If the parent cannot price that night, the child is unpriced too (surfaced in coverage as "parent unpriced" rather than silently falling back to rack).

## Technical notes

- Migration on `public.rolos_rate_plans`: `derived_from_plan_id uuid references rolos_rate_plans(id)`, `derivation_type text` (`percent` | `amount`), `derivation_value numeric`, `derivation_rounding text default 'nearest_10'`. Trigger `assert_rate_plan_derivation` enforces: same `property_id`, parent not itself derived, no self-reference, value present when a parent is set.
- Migration on `public.rolos_rate_plan_season_rates`: `derivation_value numeric` (per-season offset override) and `is_pinned boolean default false` (typed cell wins). Existing absolute `base_rate` rows on derived plans are treated as pinned.
- `supabase/functions/_shared/ratePricing.ts`: add `"derived"` to the source union; after a parent plan's nights resolve, compute child nights in a second pass (`applyDerivation`) using the existing pure inputs — parents resolve first because derivation is single-level. Rounding helper `roundToNearest(10)`.
- `supabase/functions/_shared/rateResolution.ts`: load the derivation columns into `PricingRatePlan`, keep parent plans in the snapshot even when no unit selects them (a parent may be pricing-only), add `derived_days` to `RateCoverage` and `describeCoverage`.
- `supabase/functions/rolos-rate-plans/index.ts`: accept and validate the new fields on create/update, reject a parent that is itself derived, and reject deactivating a plan that other plans derive from (with a clear message naming the children).
- Frontend: `ratePlanDraft.ts` gains the derivation fields and validation; `RatePlanEditor.tsx` adds the Derived pricing block; `RatePlanSeasonPricingTable.tsx` / `RatePlanRateMatrix.tsx` render computed vs pinned cells; `RatePlanEffectivePreview.tsx` labels the derived source; `RatePlansPanel.tsx` shows the badge.
- Channel Manager: a derived plan pushes its computed nightly prices exactly as any other plan (no new wire concepts), and a change to a parent's rates triggers the existing rate-plan delta push for the parent **and** its derived children.
- Tests added to `src/components/pms/rateplans/__tests__` and the ratePricing unit tests: percent and amount offsets, per-season override, pinned cell, rounding to nearest 10, parent-unpriced night, and rejection of chained derivation.
