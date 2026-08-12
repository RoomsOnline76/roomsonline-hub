# Fix: Seesig push reports "One or more units failed content, availability, or price sync"

## What actually happened

I read the last inventory push record for Seesig. It is not a content, rate or availability problem:

- Albatros, Seester, Anemoon, Duiker, Strandloper, Tobie — all fully successful: 366/366 days covered, 366/366 days priced, availability verified 365/365, prices verified 10/10 seasons.
- Oester, Swartmossel, Witmossel — failed with the transport error `Failed to send a request to the Edge Function`. No content error, no channel rejection, no pricing gap.

So the first six units pushed cleanly and the run died of exhaustion on the last three. Each unit costs a content push plus availability push, availability read-back, price push and price read-back, and nine units of that do not fit in one function invocation's budget. The existing retry wrapper already treats this error as transient and retried three times, which is why the failure is reported rather than silently swallowed.

The generic error message is also misleading: it blames content/availability/price when the real cause was the run running out of room.

## The fix

1. **Push in resumable chunks.** The push function already accepts a `only_unit_ids` filter. Add a batch size so a single invocation pushes a limited number of units (default 3), and return the unit ids still outstanding plus a `resume` marker.
2. **Loop from the caller.** The three UI entry points that trigger a push (onboarding pipeline continue button, the push panel, the property push action) call the function repeatedly with the outstanding ids until nothing remains, merging the per-unit results, and show progress as "unit 7 of 9".
3. **Retry only what failed.** When a chunk finishes with failures, offer a "Retry failed units" action that re-invokes with just those ids instead of re-pushing all nine.
4. **Honest failure reporting.** Separate transport exhaustion from real rejections: units that failed with a transport error are reported as "not pushed yet — retry", and only genuine channel/content/price failures keep the `RU_INVENTORY_INCOMPLETE` wording. The sync run record keeps the per-unit reason either way.
5. **Do not regress success state.** A chunked run only counts as a complete inventory push once every unit in the property has succeeded within the same batch sequence, so phase 3 cannot flip to passed on a partial run.

## Technical notes

- `supabase/functions/push-property-to-ru/index.ts`, standalone-units flow (the `if (!useBuilding)` loop): accept `batch_size` and `resume_after`, cap the units processed per invocation, and return `remaining_unit_ids`. The `ru_sync_runs` insert stays one row per chunk with `details.units`, plus a `batch_id` shared across the chunks of one sequence so the run can be read as a whole.
- Phase-3 evaluation in `ruPhaseGate` should treat the property as pushed when every active unit carries a `rentalsunited_property_id` and the latest chunk sequence for it succeeded.
- Client side: `RuPushContinueButton.tsx`, `PushToRentalsUnited.tsx` and `RuOnboardingPipeline.tsx` get a shared driver helper that loops the chunks and reports progress, so the looping logic is written once.
- No schema change is needed.

## Result

Pushing Seesig (and any other property with many units) completes across several short invocations instead of dying on the last few units, and failures name the real reason.
