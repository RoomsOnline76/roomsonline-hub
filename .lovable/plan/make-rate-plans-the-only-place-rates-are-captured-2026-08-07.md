# Make Rate Plans the only place rates are captured

You are right: today "Bring in live rates" reads what the booking engine resolves, and the top-priority source is still the **rate grid inside the Calendar** (`Room Rates by Season`, stored on the property record). So the Calendar is still both the season painter *and* a rate editor, and its values outrank anything typed in Rate Plans.

## Goal

- Calendar = seasons (dates) only. No rate inputs.
- Rate Plans = the single place nightly rates are captured and edited.
- Nothing that is already priced today may change value when we flip the switch.

## What changes

### 1. Move the existing rates into Rate Plans (one-time migration)
Copy every rate currently captured in the Calendar grid into the Rate Plans season pricing matrix (per unit, per season) for the property's active plan, as fixed nightly rates. Only fill cells that are empty in Rate Plans — never overwrite a rate an owner already authored there. Per-person amounts (adult/teen/child/infant) carry across where the plan is per-person.

Run as an admin-triggered action per property (and portfolio-wide batch) so we can verify a property before/after, with a dry-run report showing every value that would be written.

### 2. Flip the precedence
Rate Plan season rates move ahead of the legacy Calendar season rates in the resolution hierarchy. The legacy tier stays in place as a read-only fallback so any property not yet migrated keeps pricing exactly as it does today. Daily manual overrides for a specific date stay top priority (they are a per-date exception, not a season rate).

### 3. Remove rate capture from the Calendar
Delete the "Room Rates by Season" grid, its rate-type selector and its save path from the Calendar. In its place: a short read-only note plus a link to Rate Plans. The season painter, colours, windows and public-holiday markers are untouched.

### 4. Rename the seeding tool
"Bring in live rates" becomes **"Import rates from Calendar (legacy)"** and only appears while a property still has un-migrated Calendar rates. Once nothing legacy remains, the button disappears and the matrix is the sole author.

## Verification

- Pick a property with Calendar rates (e.g. Bosbok/Dassie): capture the resolved 30-night rates per unit before, migrate, then confirm the resolved rates are byte-identical after.
- Confirm channel push and checkout read the same numbers (both go through the same resolver).
- Confirm the Calendar no longer writes rates and seasons still save.

## Technical notes

- Sources: `supabase/functions/_shared/rateResolution.ts` (tier list), `ratePricing.ts` (tier evaluation order), Calendar grid in `src/components/property/SeasonsCalendar.tsx` (writes `amenities.season_rates`), matrix in `src/components/pms/rateplans/RatePlanSeasonPricingTable.tsx`, seeding in `RatePlanEditor.tsx` (`season_rate_matrix` action).
- Migration writes to `rolos_rate_plan_season_rates` keyed by the Calendar season id, so existing season colours/windows keep matching.
- New `rolos-rate-plans` actions: `migrate_calendar_rates` (with `dry_run`) and `legacy_rate_audit` (does this property still have Calendar-only rates?).
- `amenities.season_rates` is left on the record after migration (not deleted) so we can roll back; a later cleanup task can strip it once every property reports zero legacy-only cells.
