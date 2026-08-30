# Fix `lnm_repull` failures and close the error-taxonomy gaps

## What is actually wrong

Confirmed from the live sync trail:

- 155 failed `lnm_repull` runs in the last 7 days, all with the same message: *"get_availability is a channel read-back and ROL'OS owns availability and pricing. Pass readback_purpose…"*. First seen 29 Aug 15:22, still failing 30 Aug 06:20.
- `ru_lnm_repull_queue` currently holds 31 rows in `failed` (28 listings), all having burned the full 5 attempts on that same refusal.
- Cause: the read-back kill-switch added to `rentalsunited-api` demands a declared `readback_purpose`. The queue drain (`cron-ru-lnm-repull`) still calls `get_availability` with no purpose, so every availability/price notification is refused locally and logged as a failure. No channel call is ever made — this is self-inflicted noise, not a channel fault.

Google Maps "unknown" with a passing last test needs no change.

## Remedial fix

1. **Stop pulling the channel's availability on ARI notifications.** ROL'OS is the source of truth for availability and pricing, and channel-side bookings arrive through reservation notifications plus the 30-minute reservation poll — the calendar read-back added nothing. Availability/price notifications become a recorded no-op: the queue row closes as `done`, no channel slot is spent, no failure is logged.
2. **Keep the static path unchanged.** `kind = 'static'` notifications still trigger the differential `push-property-to-ru` re-push, which is a write we own.
3. **Reservation-shaped notifications stay covered.** Where the notification indicates a channel-side booking change, the queue row schedules a reservation pull for that owner (the existing reservation path) instead of an ARI read-back.
4. **Clear the backlog.** Reset the 31 `failed` rows to a closed state so the health report stops counting historical refusals, and record the reason once.

## Taxonomy and critical-failure review

Two live failure signatures currently land in "Unclassified failure" and so read as UNKNOWN in the health report. Both get their own bucket in `classifyRuError`:

- **Read-back blocked** (`READBACK_BLOCKED` / "is a channel read-back") — severity *expected*: nothing was sent to the channel; the caller must declare a purpose or not read at all.
- **"You can only modify stay in confirmed reservation"** (43 runs) — severity *expected*: the channel still holds the stay as an unconfirmed request, so `Push_ModifyStay_RQ` does not apply; the request path (confirm/reject) owns it.

Remaining failures in the window are already classified and need no code change:

- `confirm_request` / `push_confirmed_reservation` "can't check in or check out" (72) — the blocked-dates bucket, with reopen-and-retry and the three-refusals circuit breaker already in place.
- Onboarding/wizard gate refusals (~64) — expected refusals, nothing sent.
- Genuine blockers needing an operator: `create_api_key` "Incorrect login or password" (7, one sub-account password to reset), `bind_ru_account` OwnerID 742126 not under master, `ensure_owner_account` julius@polka.co.za registered outside master, `PutLnmSubscriptions` not authorised for owner 742615, one `RU_LISTING_MISSING` on listing 5808333. These are listed for action, not code fixes.

## Technical detail

- `supabase/functions/cron-ru-lnm-repull/index.ts`: drop the `get_availability` invoke for non-static kinds; close those rows as a logged no-op with the notification count and change types retained, and keep the queue claim/attempt logic for the static path.
- `supabase/functions/ru-lnm-handler/index.ts`: only enqueue ARI notifications when they still carry value (owner-scoped reservation follow-up); no other behaviour change.
- `src/components/integrations/RuErrorHandlingTab.tsx`: two new classifier branches before the generic fallback.
- One-off data cleanup on `ru_lnm_repull_queue` for the 31 stale `failed` rows.
- Deploy the two edge functions; verify a clean `[cron-ru-lnm-repull] processed/ok` line with zero failures and no new `lnm_repull` failure rows.
