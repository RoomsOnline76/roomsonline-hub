# Restriction changes: range-bound availability-only deltas

Goal: every restriction action in the ROL'OS dashboard (add, edit, remove, and a new partial release) sends the Channel Manager one availability delta covering only the affected nights — never prices, never a full-year ARI push.

## What changes

### 1. Availability-only pushes for restriction triggers
Today a restriction save fires the ARI delta with the trigger `stop_sell_change` (and siblings such as `minimum_stay_change`, `lead_days_change`). Only `booking_*` triggers are treated as inventory-only, so restriction saves still attach the prices call.

Extend the inventory-only rule to restriction triggers so the push carries the availability call alone, with prices skipped even when the price fingerprint looks stale. Prices keep their own path (rate plans, seasons, rate prices) untouched.

### 2. Every restriction action must carry a real date window
- Add / edit / move: window = the nights the restriction now covers, plus the nights it vacated (a move must reopen the nights it left).
- Remove / unblock: window = exactly the nights that were cleared.
- Bulk dialogs already pass from/to; they will pass through the same availability-only route.

Removing a restriction currently pushes with the span's nights, but no restriction-triggered ARI run appears in the last three days of channel run history (only cron and one rate-plan run), so the first task is to confirm where the unblock push is lost — silent onboarding gate, the five-minute coalesce queue, or an unchanged-availability fingerprint skip — and fix that cause. The window/fingerprint pairing is window-scoped, so a re-open over the same range as the preceding block must not be skipped as "identical".

### 3. Partial release of a block
The editor can only narrow a span from its edges. Add an explicit partial release so an operator can free part of a block:

- In the restriction editor, a "Release nights" section lists the span's nights with a from/to sub-range picker inside the span bounds.
- Releasing a sub-range clears only those nights of that restriction kind (other rules on the same night survive, as clearing already does).
- Releasing from the middle leaves two remaining spans; releasing an edge shortens the span.
- The resulting channel push covers only the released nights — e.g. a 7-night block with the last 2 nights released pushes a 2-night availability delta.

### 4. Feedback
Toasts stay as they are: silent for properties still inside channel onboarding, "updating in the background" when a delta is queued, one error toast on a genuine channel failure. Wording clarifies that only the affected nights were sent.

## Technical notes

- `supabase/functions/push-property-to-ru/index.ts`: broaden the `skipPrices` condition from `trigger.startsWith('booking_')` to a shared inventory-only trigger set that includes restriction triggers; keep `force_prices` unable to override it.
- `src/lib/restrictionSync.ts`: keep the gate/coalesce/skip handling; make the date range mandatory for restriction calls and forward a `restriction_*` trigger. Include the vacated nights in the window on move/shrink.
- `src/lib/restrictionSpans.ts`: add a `releaseRestrictionNights(span, from, to)` writer built on the existing `clearNights`, returning the released date range for the push scope.
- `src/components/restrictions/RestrictionSpanEditor.tsx`: partial-release UI and wiring to the new writer.
- `src/components/restrictions/RestrictionsManagerDialog.tsx`: pass the changed range reported by the writer instead of re-deriving it from the pre-edit span.
- Verification: reproduce block → unblock on a connected test property and read the channel run/exchange log to confirm exactly one availability call over the expected range and no prices call.
- Record the rule in project memory: restriction edits are range-bound, availability-only deltas.
