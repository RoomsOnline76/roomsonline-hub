# Phase 1 — Author LOS / Full Stay ladders on the Rate Plan

Operators get two switches on the existing Rate Plan editor and can type length-of-stay rungs and full-stay cells against the Calendar seasons the pricing matrix already shows. Nothing guest-facing changes: booking, embeds, widgets and channel pushes keep summing nightlies.

## Current state (verified)

- The engine already has `stayQuote`, `LosRung`, `FspCell`, and `los_enabled` / `fsp_enabled` on `PricingRatePlan` — frozen, not reopened.
- `rolos-rate-plans` `save_plan` already accepts `los_enabled`, `fsp_enabled`, `los_rungs`, `fsp_cells`, treats absent keys as a no-op, and replaces child rows with delete + insert. It already rejects a rung/cell with neither season nor date range, a pinned row with no amount, and a derived row with no value.
- `ratePlanDraft.ts` does **not** yet carry the flags or ladder arrays, and `draftToPayload` does not emit those keys — so today's editor is a genuine no-op on the new tables.
- `RatePlanEditor.tsx` loads the plan row with `select("*")` (so the flags arrive already) but does not read the two ladder tables.

## What gets built

### 1. Draft (`src/components/pms/rateplans/ratePlanDraft.ts`)

- Add `los_enabled`, `fsp_enabled` (false), `los_rungs: DraftLosRung[]`, `fsp_cells: DraftFspCell[]` (empty) to `RatePlanDraft` and `emptyDraft()`, with the string-typed field shapes from the brief.
- Six new reducer actions: `add_los_rung` / `patch_los_rung` / `remove_los_rung` and the three `fsp_cell` equivalents. Season/matrix actions stay untouched.
- Turning a flag off through the existing `field` action clears that array in the same reduction, so a save can never leave orphan rows behind a false flag.
- `draftToPayload` always emits both flags plus the arrays, filtered to rows that pass client validation, with `room_type_id: null` and `start_date` / `end_date: null` (the season id is the window). Numbers go through the existing `numeric()` helper. Pinned rows emit the pinned amount and null derivation; derived rows emit type + value.
- Export a `ladderIssues(draft)` validator returning one sentence per problem: duplicate `(season, nights)` for LOS, duplicate `(season, nights, guests)` for FSP, blank offset, blank pin, a flag on with zero valid rows.

### 2. New component `RatePlanStayShapeSection.tsx`

Rendered as its own card between "2. Pricing by season" and "3. Restrictions" (dates → daily amounts → derived products), collapsed to just the switch while a flag is off.

- Switch **Length of stay (nightly by nights)** — "Derived from the daily rate for this plan. Channels still see a nightly."
- Switch **Full stay (one price for the stay)** — "Derived from the daily stay total. Book page still quotes nightly until a later scoop."
- LOS rows: Season select (live Calendar seasons already loaded by the editor) · From N nights · offset type · offset — or a pinned nightly. New rung defaults to the first upcoming season, 3 nights, percent, −10.
- FSP rows: Season · Nights · Guests · offset type · offset — or a pinned stay total. New cell defaults to first upcoming season, 7 nights, 2 guests, percent, −20. Helper line: "Guests = adults + teens + children at quote time."
- One muted preview line per season that has a rung or cell, e.g. "High · 3n −10% → R1,980/n · 7n stay R12,600". When the season has no daily amount in the draft it reads "unpriced — set the daily first" — no invented number.
- Invalid rows render their sentence inline; no `alert()`.

### 3. Editor wiring (`RatePlanEditor.tsx`)

- Load: read the flags off the plan row already fetched, and add two queries for `rolos_rate_plan_los_rungs` / `rolos_rate_plan_fsp_cells` (plan-scoped) mapped into the draft. Query errors or missing tables → flags false, empty arrays, no toast.
- Save: block on `ladderIssues(draft)` with a toast of the first sentence, alongside the existing name/units guards. `draftToPayload` handles the rest.
- The 7-day strip and `RatePlanEffectivePreview` are not touched — the parent stays nightly.

### 4. Edge validation (`supabase/functions/rolos-rate-plans/index.ts`)

Tighten only the ladder block: flag true with zero valid rows → `400` "Add at least one length-of-stay rung, or turn it off" (and the FSP equivalent); a false flag deletes that ladder's rows and stores false; nights and guests must be integers ≥ 1; a derived percent of −100 or lower is rejected. The season-rate replace transaction is unchanged.

### 5. Tests (`ratePlanDraft.test.ts`)

Empty draft has flags false and empty arrays · flags-false payload emits `los_enabled: false` / `fsp_enabled: false` and empty arrays · adding a LOS rung produces the expected wire row · a pinned FSP cell carries `pinned_total` with null derivation · turning LOS off clears `los_rungs` · duplicate threshold is reported by `ladderIssues`. `stayQuote.test.ts` is left alone.

## Technical note on the preview

`stayQuote` lives in the Deno edge shared folder and needs a loaded nightly series, and this scoop adds no new edge action. The preview therefore uses a small client mirror of the same derivation math (the repo's existing "client mirror of `_shared/…`" convention, as used by `reportWindow.ts`), fed by the season amount already in the draft. It is labelled as a derived preview and shows "unpriced" instead of guessing whenever the draft has no daily amount for that season.

## Out of scope

Calendar sheet or cell badges, booking / embed / widget / `modify-booking` swaps onto `stayQuote`, RU `<LOSS>` and FSP push, per-unit rung overrides, free date ranges, ladder sync to other properties, help copy.
