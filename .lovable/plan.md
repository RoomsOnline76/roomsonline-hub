# Fix: pricing model on rate plans doesn't stick (and doesn't drive booking/billing)

## What's actually wrong

Three separate problems, confirmed against the code and live data:

1. **A legacy sync overwrites your choice.** Every time the ROL'OS Rate Plans page loads, it re-applies the old "Property Overview" rate types onto each rate plan, including `pricing_model` and `base_rate`. So you change Per Room to Per Person, save, and the next page load silently writes the old value back. Live data confirms it: every plan's pricing model is an exact copy of the legacy Property Overview value.

2. **Legacy values aren't valid options.** Stored values include `UnitRate`, `per-unit` and `PER PERSON` — none of which match the four options in the editor (`per_room`, `per_person`, `per_person_sharing`, `per_unit`). The dropdown therefore looks empty/wrong, and the dynamic wording falls back to "unit".

3. **It only partly reaches booking and billing.** The nightly rate engine ignores the pricing model entirely (it prices the night). The guest-facing multiplication happens in the booking orchestrator, which only recognises the exact string `per_person`. Consequences today:
   - a plan stored as `PER PERSON` or `per-person` is billed per room, not per person;
   - `per_person_sharing` gets no extra-adult treatment;
   - the channel push sends `PER_PERSON` / `PER_NIGHT` off the same fragile check, so channels can receive the wrong price type.

## What will change

**Rate Plans becomes the sole author of pricing model and base rate**
- The legacy sync will still create rate plans that are missing, but will never again overwrite `pricing_model` or `base_rate` on an existing plan.

**One canonical set of values**
- A shared helper normalises any legacy spelling to the four canonical models (`UnitRate`/`per-unit`/`unit rate` → `per_unit`, `PER PERSON`/`per-person` → `per_person`, `pps`/`per person sharing` → `per_person_sharing`, everything else → `per_room`).
- A one-off data cleanup rewrites existing plans to the canonical value, so dropdowns, labels and downstream logic agree.
- The editor and save path use the helper, so a bad value can't be stored again.

**The card confirms the model**
- Each rate plan card shows a pricing-model badge (e.g. "Per Person") next to the name, so a saved change is visible without opening the editor. The stacked unit grid header uses the same noun.

**It drives booking and billing**
- Booking orchestrator, checkout totals and the modify-booking path all read the normalised model:
  - Per Room / Per Unit → nightly rate × nights (unchanged).
  - Per Person → nightly rate × guests × nights.
  - Per Person Sharing → base covers 2 guests; additional adults charged at the plan's extra-adult rate (children/teens use their existing rates).
- The channel push derives `PER_PERSON` vs `PER_NIGHT` from the normalised model instead of a substring test.
- Unit tests cover each model across a multi-night, multi-guest stay, plus the legacy-string normalisation.

## Technical notes

- `src/pages/pms/PMSRatePlans.tsx`: drop `pricing_model` and `base_rate` from the "update existing plans" loop in `syncFromAmenities`.
- New `canonicalPricingModel()` in `src/components/pms/rateplans/ratePlanDraft.ts`, mirrored for Deno in `supabase/functions/_shared/ratePricing.ts`; `pricingNoun()` consumes it.
- `supabase/functions/rolos-rate-plans/index.ts` (`savePlan`) normalises before write; hydration writers (`hydrate-pms-cache-to-rolos`, `PropertyForm` rate-type sync) normalise too.
- `supabase/functions/booking-orchestrator-api/index.ts`: replace `pricing_model === "per_person"` and the `includes("person")` test with the canonical model; add the sharing branch. Same in `supabase/functions/modify-booking/index.ts` and `src/components/booking/ModifyBookingModal.tsx`.
- `RatePlansSurface.tsx`: pricing-model badge from `PRICING_MODELS`.
- Data cleanup: single update over `rolos_rate_plans` setting canonical `pricing_model` (and `pricing_model_normalised`) — no schema change needed.
