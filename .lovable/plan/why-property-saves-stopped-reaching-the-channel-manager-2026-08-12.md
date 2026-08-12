# Why property saves stopped reaching the Channel Manager

## What I found

Auto-push on save does still exist in the code, but only on three save surfaces, and there is no evidence it has ever actually completed a push.

Confirmed by reading the code and the database:

- `src/pages/PropertyForm.tsx:3895` fires the channel content delta after a property-level save; the only other callers are the ROLOS onboarding save (`src/hooks/usePropertyOnboarding.tsx:488`) and the cancellation-policy save (`src/hooks/useReservationPolicies.ts:103`).
- Nothing else calls it. Unit/room edits in `RoomManagerTab.tsx` (unit names, descriptions, bed composition, per-unit images, amenities, activate/deactivate) write straight to the database with no channel sync afterwards.
- The two properties actually listed on the channel — Tidal Pools (4 listed units) and Seesig (11 listed units) — are **unit-level listings**, so most real content edits for them happen in exactly the surfaces that do not trigger a sync.
- The delta logging table has **zero** `static_delta` rows ever recorded, and the `ru-static-delta` function has no invocation logs at all. So even the property-level path has not produced a single recorded delta. That part is not yet explained — it is the first thing to verify, not something to assume.
- One plausible reason for the silence, to be confirmed during verification: the delta helper can sleep up to 60 seconds inside the request (its de-bounce window) while the browser call is fire-and-forget, so navigating or closing the editor can cancel the request before any push or log happens.

The only automatic content refresh that demonstrably runs is the weekly full push (last run 10 Aug). That is why channel content now feels days stale rather than instant.

## The fix

### 1. Verify the existing path first (no guessing)

Force one content delta for Seesig and confirm three things: the function logs an invocation, a `static_delta` row is written, and the channel receives a content push. If it fails, fix that failure before adding new call sites — otherwise every new caller inherits the same silence.

### 2. Make the delta survive the caller

Return the queued/skipped answer to the browser immediately and run the de-bounce wait and the push in the background, so closing or navigating away from the editor can never kill an in-flight content sync.

### 3. Cover every save surface that changes channel content

Emit the same one-line content-sync call after a successful write in:

- unit/room saves in `RoomManagerTab.tsx` (name, description, occupancy, amenities, activate/deactivate)
- bed composition / bedroom layout saves
- property and unit image changes, including the main-photo tag
- arrival and house-rule policy saves
- multi-unit configuration saves

All of them route through the existing helper, so the channel rules (not-listed, paused, unchanged fingerprint, de-bounce) stay in one place and a no-op save still costs nothing.

### 4. Never let it be silently quiet again

- Record skips as well as pushes (`unchanged`, `paused`, `not listed`, `error`) so the log answers "did my save reach the channel?".
- Show a **Last content sync** line with time and outcome on the property's channel card and in the channel monitor, plus a "Sync content now" action that forces a delta.

## Technical notes

- Client entry point stays `queueChannelContentSync(propertyId, trigger)` in `src/lib/channelContentSync.ts`; trigger strings identify the surface (`unit_save`, `images_save`, …).
- Server logic stays in `supabase/functions/_shared/ruStaticDelta.ts` / `ru-static-delta`; the background work uses the edge runtime's background-task API so the response returns before the de-bounce wait.
- Pushes remain `action: 'static_only'`, so availability, prices and discounts keep their own delta path and the channel write window is not burned twice.
- Unit-level edits still push the whole property (the channel contract is per-listing fan-out inside `push-property-to-ru`); no change to that contract.
- Readiness gating in `push-property-to-ru` is unchanged: a property failing mandatory checks still refuses the push, and that refusal now shows up as a visible sync outcome instead of nothing.
