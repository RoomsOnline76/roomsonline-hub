# Make seasonal unit rates editable in Rate Plans

## The problem

In **Edit rate plan → Pricing by season**, every cell in the unit × season matrix currently renders as the static text "Base rate" and cannot be typed into. That happens because a season only becomes editable once its mode toggle is switched away from **Not priced** — and for this plan no seasonal rates were ever stored in the new Rate Plans tables, so every column loads as "Not priced".

Meanwhile **Effective rates** at the bottom of the form shows the correct live numbers, because the booking engine still resolves them from the older Calendar season rates. So the right values exist, they are just not visible or editable in the place where they now belong.

## What changes

1. **Cells are always editable.** Typing a rate into any cell automatically promotes that season column to **Fixed rate** — no need to discover the mode toggle first. The mode toggle stays for people who want **Difference** or to deliberately un-price a season.
2. **Empty cells show what they will fall back to**, as a greyed placeholder (e.g. `R1 000 base`), instead of a dead "Base rate" label. Cells only look inert when the season is explicitly set to **Not priced**.
3. **"Bring in live rates".** One button above the table (and one per season column) pulls the rates the live booking engine is currently using for each linked unit in that season and fills them into the matrix, per unit, per season. Values land in the draft so they can be reviewed and edited before saving — nothing is written until Save.
4. After saving, the matrix becomes the source of truth for those seasons and Effective rates below will show them coming from the Rate Plan rather than from the Calendar. Season dates stay owned by the Calendar; only money is authored here.

## Technical notes

- `RatePlanSeasonPricingTable.tsx`: drop the read-only branch, render an `Input` in every cell with the fallback as `placeholder`. On change, if the column mode is `none`, dispatch a mode promotion to `absolute` alongside the cell value.
- `ratePlanDraft.ts`: extend the `season_unit_rate` reducer case to promote `mode` from `none` to `absolute` when a non-empty value arrives, plus a new `seed_matrix` action that merges a `{ calendarSeasonId: { roomTypeId: amount } }` map into `season_rates`. Cover both in `ratePlanDraft.test.ts`.
- `supabase/functions/rolos-rate-plans/index.ts`: add a `season_rate_matrix` action. For each linked unit and each Calendar season it resolves the first night of the season through the existing `resolveNightRates` engine (same call path the preview already uses) and returns the resolved amount plus its source. This guarantees the seeded numbers match Effective rates exactly rather than re-deriving them from the raw amenities blob.
- `RatePlanEditor.tsx`: fetch that matrix on open (non-blocking), pass it to the table for placeholders/seed buttons, and wire the seed dispatch.
- Replace the current `legacySeasonRates` distinct-amount "Use R…" chips with this per-unit matrix, since it supersedes them.
- Deploy `rolos-rate-plans` after the change.
