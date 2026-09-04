# Dated LOS windows for event weekends

Today a length-of-stay rung (and a Full Stay cell) can only be attached to a painted
season. The database already carries a From/To window and an optional unit on every
row — the editor just never offers them. This adds those controls, plus an optional
minimum stay for the window that also lands in the calendar restrictions so the
calendar and the channel see it.

## What the operator gets

On each Length of stay row and each Full Stay row:

- **Applies to**: `Season` (today's behaviour) or `Dates` — pick From and To.
- **Unit**: `All units on this plan` (default) or one specific unit.
- **Minimum stay for this window** (dated rows only, optional): the number of nights
  guests must book in that window. Typical event weekend: min 3 nights with no price
  change, or min 3 nights at +15%.
- The price offset stays optional in the sense that a row can be a pure threshold:
  leave the adjustment at 0 and the row only carries the minimum stay.

Preview line under each row keeps working: it shows the derived nightly (or "unpriced"
when the window has no daily amount yet).

## How the minimum stay behaves

- Saving a dated row with a minimum stay writes a matching restriction row so the
  Calendar shows it and the channel push sends MinStay for those dates.
- Direct checkout does **not** block shorter stays on account of this row — pricing
  only. Blocking stays the job of the existing restrictions tooling.
- Clearing the minimum stay, changing the dates, or deleting the row removes the
  restriction rows the plan authored.

## Validation

- Dates row needs both From and To, and From must not be after To.
- Season row keeps requiring a season.
- Overlapping rows with the same nights threshold for the same unit are rejected on
  save with a plain sentence naming the dates.
- A dated row is otherwise validated exactly like a season row (nights ≥ 1, no −100%
  or worse discount, pinned rows need a rate/total).

## Technical notes

- `ratePlanDraft.ts`: add `scope: "season" | "dates"`, `start_date`, `end_date`,
  `room_type_id`, `min_stay_nights` to `DraftLosRung` / `DraftFspCell`; extend
  `losRungIsValid` / `fspCellIsValid` and the payload builder; hydration maps saved
  rows back to the right scope.
- `RatePlanStayShapeSection.tsx`: scope select, two date inputs, unit select, min-stay
  input per row. No change to the section's flags or the RU Full Stay opt-in.
- `stayShapePreview.ts`: `draftSeasonNightly` gains a dated variant — for a dated row,
  resolve the season that covers `start_date` and derive from its amount; unpriced when
  no season covers the window.
- `supabase/functions/rolos-rate-plans/index.ts` (save path): persist `min_stay_nights`
  and the overlap check; write/replace plan-authored dated restriction rows in
  `rolos_stay_restrictions` alongside today's plan-level row (still
  `source = 'rate_plan'`, keyed by `source_ref` so dated rows and the plan-level row
  don't clobber each other).
- Engine (`ratePricing.ts` / `rateResolution.ts`): unchanged selection order — dated
  windows are already honoured by `windowCoversRung`. Only the new `min_stay_nights`
  column travels through the loader for display.
- Migration: one additive column `min_stay_nights int` on
  `rolos_rate_plan_los_rungs` and `rolos_rate_plan_fsp_cells`, nullable; plus a
  nullable `start_date`/`end_date` pair on the plan-authored restriction rows if not
  already present.
- Tests: extend `ratePlanDraft.test.ts` (dated rows valid/invalid, payload shape) and
  `stayQuote.test.ts` (dated rung fires inside its window, not outside).
- Redeploy `rolos-rate-plans`; no change to `push-property-to-ru` beyond the MinStay it
  already reads from restrictions.
