# Rate Plans — Pricing by Season becomes a Unit × Season matrix

Today "Pricing by season" is one row per season with a single rate that is fanned out to every linked unit (per-unit differences are set separately under Linked Units). You want to price directly: units down the Y axis, Calendar seasons across the X axis, one editable cell per unit per season.

## What changes

**The table becomes a grid**

```text
                 LOW            MIDDLE          HIGH
                 [mode toggle]  [mode toggle]   [mode toggle]
Sea Cottage      1 200          1 450           1 900
Garden Room        980          1 150           1 500
Family Unit      1 600          1 850           2 400
```

- Columns = seasons exactly as the Calendar painted them (name + dates, read-only here). Seasons are never created or renamed on this page.
- Rows = the units linked to this rate plan (section 4). Archived units never appear.
- Each column keeps its pricing mode toggle, unchanged in behaviour and wording: **Not priced** / **Fixed rate** / **Difference**.
  - *Not priced* — the whole column is dimmed and inputs are disabled; those nights fall back to the plan base rate.
  - *Fixed rate* — each cell is that unit's nightly rate for that season.
  - *Difference* — each cell is that unit's delta off the plan base rate, with the existing R / % switch on the column header.
- Cell-level convenience, kept dense: a season header value that fills the whole column ("apply to all units"), and copy-right/copy-down so the owner can fill a row or column in one click. Empty cell falls back to the column value, then the plan base rate.
- The existing "Already on the Calendar for this season → Use R1 200" chips stay, applied at column level.
- Layout: first column (unit name) is sticky, the season columns scroll horizontally on narrow screens, row height stays at the current compact size.

**Storage** — no schema change needed. `rolos_rate_plan_season_rates` already carries `room_type_id`, so each cell saves as its own row (season × unit) instead of the current fan-out of one identical value per unit. Cells left empty inherit the column value on save, so existing plans keep pricing exactly as they do today.

**Pricing stays consistent** — the live "Effective rates" preview, the 7-night strip on the plan cards, the Calendar write-back, and the booking engine all read the same resolution order: unit cell → season column value → plan base rate, with the Linked Units per-unit difference applied only when the cell itself has no explicit value (so nothing double-discounts).

## Migration of existing plans

Loading an existing plan reads the stored per-unit rows. Where every unit shares the same value (all plans today), the column shows that shared value and each cell shows it as an inherited placeholder — no visual change until the owner overrides a cell. Nothing is rewritten until Save.

## Technical notes

- `ratePlanDraft.ts`: `DraftSeasonRate` gains `unit_rates: Record<roomTypeId, string>` (values interpreted per the column mode) plus reducer actions `season_unit_rate`, `fill_season_column`, `fill_unit_row`. `draftToPayload` emits one `season_rates[].units[]` entry per linked unit, resolving blanks to the column value; `readLegacySeasonRates` untouched.
- `RatePlanSeasonPricingTable.tsx` rewritten as the matrix (sticky first column, `overflow-x-auto`, `h-8` inputs, semantic tokens only) and now receives `roomTypes` so it can label rows; it renders only units present in `draft.units`.
- `RatePlanEditor.tsx`: pass `roomTypes`, hydrate `unit_rates` when loading `rolos_rate_plan_season_rates` (grouped by `shared_season_id`), and keep the priced-season counter.
- `supabase/functions/rolos-rate-plans/index.ts`: `save_plan` writes per-unit season rows from the payload instead of duplicating one value; `previewDraft`, `previewSavedPlan` and `writeBackCalendarRates` resolve the per-unit cell first.
- `_shared/ratePricing.ts` gains per-unit season lookup in `PlanSeasonRate` resolution, with unit tests extended in the existing rate pricing test suite (cell override, column fallback, base-rate fallback, difference mode per unit).
