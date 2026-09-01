# Phase 1b — Show LOS / Full Stay on calendar seasons (quotes unchanged)

Make ladders already saved in Rate Plans visible where operators work, without touching any price math, calendar cell, or channel payload.

## What operators will see

1. **Seasons Calendar** — selecting a season shows a small read-only "Stay shape (from Rate Plans)" block listing each active plan's length-of-stay rungs and full-stay cells bound to that season, plus the sentence "Edit length-of-stay and full-stay on Rate Plans. Calendar still owns the dates."
2. **Rate Plans list** — cards get muted `LOS` / `Full stay` chips next to the existing occupancy badge when the plan has those flags on.
3. **Accommodation calendar** — one muted line under the existing filter row ("Stay shape on High, Festive — edit in Rate Plans") when any linked plan on the property has a ladder. Header only; no cell, drag or nightly change.

Plans with both flags off look exactly as they do today on all three surfaces.

## Technical detail

New files under `src/components/pms/rateplans/`:

- `indexStayShapeBySeason.ts` — pure indexer returning `StayShapeBySeason` keyed by `calendar_season_id`. Skips inactive plans, plans with both flags false, rows with null `calendar_season_id`, rungs when `los_enabled` is false and cells when `fsp_enabled` is false. Labels are authored offsets only (`from 3n −10%`, `from 3n pinned R1,980/n`, `7n × 2 −20%`, `7n × 2 pinned R12,600`) — no computed guest totals, no import of `stayQuote` or `draftSeasonNightly`.
- `useStayShapeBySeason.ts` — one-shot read for a property id: `rolos_rate_plans` (id, name, los_enabled, fsp_enabled, is_active), then rungs and cells for those plan ids. Missing tables or empty result → `{}`, no toast, no polling, no new edge action.
- `indexStayShapeBySeason.test.ts` — empty plans, flags-false leftovers ignored, one rung indexed under its season, two plans on one season, null season id dropped, `fsp_enabled` false drops cells.

Edits:

- `src/components/property/SeasonsCalendar.tsx` — add an optional `propertyId` prop (passed through from `RateManagerTab`, which already has it; no second property picker), call the hook, insert the read-only block in the selected-season card between the periods list (~L651–675) and the "Linked rate types" line (~L694), and reword the dashed pointer (~L720) to "Nightly rates, length-of-stay and full-stay are captured in Rate Plans. The Calendar defines seasons — their dates, colours and minimum stay — only." Add/Delete Season, periods, colour, min/max stay and the 12×31 grid untouched.
- `src/components/pms/rateplans/RatePlansSurface.tsx` — add `los_enabled, fsp_enabled` to the list select (~L133) and to the `RatePlan` type as optional booleans, render the two outline badges on the title row (~L302–325). Price summary, season grid and the sync dialog untouched.
- `src/pages/CalendarAccommodation.tsx` — one muted line inside the existing filter card (the `flex flex-wrap gap-2` toolbar row area), clicking navigates to `/pms/rate-plans`. Nothing else in that 3.5k-line file.

Untouched by contract: `ratePricing.ts`, `stayQuote.test.ts`, `ratePlanDraft.ts`, `RatePlanStayShapeSection.tsx`, `adapter-contract.ts`, `push-property-to-ru`, `Booking.tsx`, `EmbedProperty.tsx`, `RatePlan7DayRates`. No migrations, no new routes.

## Verification

`bunx vitest run src/components/pms/rateplans`, plus a visual check that a season with no ladder renders identically to today.
