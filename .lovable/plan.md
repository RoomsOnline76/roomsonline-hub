# Phase 7 — RU Full Stay opt-in toggle + honest copy

Two frontend files change. No migration, no edge function, no adapter edits.

## 1. Honest copy in "Longer stays"

`RatePlanStayShapeSection.tsx`:

- File header: drop the "nothing here changes what a guest is quoted … book page and channel pushes stay nightly" sentence; state that daily is the parent, both ladders derive from the nightly amounts, native checkout applies them, and the channel keeps nightly seasons unless the property opts in.
- Length-of-stay help replaces "Channels still see a nightly rate." with: "ROL'OS checkout already applies matching rungs. Rentals United receives them as `<LOSS>` on the nightly season."
- Full-stay help replaces "The book page still quotes nightly for now." with two sentences:
  - "ROL'OS checkout and modify use this matrix when nights and guests match a cell; otherwise LOS, then nightly."
  - "Rentals United keeps nightly seasons (and LOSS if you authored rungs) until you opt the property into the Full Stay matrix below."

No internal function names in UI copy.

## 2. The property-level switch

A third control below the Full Stay ladder, rendered only when `draft.fsp_enabled` is true:

- Label: "Publish Full Stay to Rentals United", switch id `rp-ru-push-fsp`.
- Help: "Replaces nightly seasons on the RU listing with a per-night stay matrix. Unmatched occupancy still sells at the parent nightly (DefaultPrice). Turn off and save to publish seasons again. Default off."
- Disabled when there are no seasons, or when the editor has not loaded property amenities.
- Turning it **on** opens one confirm dialog: "This listing's next rate push will send RU Full Stay pricing and replace nightly seasons on the channel. Continue?" Cancel leaves it off. Turning it off is immediate.

New props only — `ruPushFsp: boolean` and `onRuPushFspChange: (next: boolean) => void`. It is not a plan field: `RatePlanDraft`, `draftToPayload` and `ratePlanDraft.ts` are untouched.

## 3. Load and save the flag

`RatePlanEditor.tsx` already selects `properties.amenities` in its load effect. Add local state:

- `ruPushFsp` initialised from `amenities.ru_push_fsp === true`, plus the loaded original value and an "amenities loaded" marker for the disabled state.
- Pass both props into `RatePlanStayShapeSection`.

On a successful `save_plan`, and only when the in-memory flag differs from the loaded value, re-read `properties.amenities`, merge in `ru_push_fsp` and update that one row. A property that never opted in gets no key written (false + never present = no write); on → off after it was on writes `false`. The amenities write runs before the existing `pushRatePlanRates` call so the next ARI push reads the new flag; `push-property-to-ru` is never invoked directly and `forcePrices` is not set.

## Out of scope

Channel console, onboarding wizard, auto-enable on `fsp_enabled`, per-unit overrides, help articles, any edge function or calendar file.

## Acceptance

- Untouched property: no `ru_push_fsp` key after a normal plan save.
- On + confirm + save: `amenities.ru_push_fsp === true`.
- Off + save after having been on: key is `false`.
- `fsp_enabled` off: switch hidden, flag never rewritten.
- `git diff` empty for `supabase/functions/**` and `ratePlanDraft.ts`; typecheck and existing rate-plan tests green.
