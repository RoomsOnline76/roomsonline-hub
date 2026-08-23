# confirm_request false positive, in-progress accounts, and the retired-account footer

All three items were checked against the live rows before writing this.

## 1. The 25 confirm_request failures are self-inflicted, not an ARI problem

The property is **RU Test Clone A** (`2f5d0f79…`, OwnerID 742004) and every one of the 25 failures is the
same reservation `147032248` / booking `ROL-700-0001` (`9e90cd23…`, 20–31 Aug, status `checked_in`).

The ARI is fine — you are right that this is a false positive:

- The nights 20 Aug–30 Aug carry `available_units = 1` from the property's own calendar, no min stay
  and no changeover rule.
- The only closed rows for those nights are ours: `available_units = 0`, `is_stop_sell = true`,
  `blocked_reason = channel_booking:9e90cd23…` — i.e. the stay blocking its own dates.
- So RU answers "Property is not available for a given dates" because the reservation's own nights
  read as closed at the channel. `confirmRuRequest` already reopens exactly those nights
  (`Push_PutAvbUnits_RQ` succeeded at 05:35 and again at 06:04), parks the acceptance 65 s later, and
  in the meantime the availability delta for the same property re-pushes 0 units for the stay's own
  nights — so the reopened window is closed again before the acceptance lands.

And the reason it repeats forever every 30 minutes: the reservations poll rewrites the booking's rooms
and notes on every pass, the `trg_bookings_channel_sync` trigger enqueues `channel_booking_sync`
(`moved`, `notes`), and `channelBookingSync` sees a `rentalsunited_lead` in a confirming status and
attempts acceptance again. The queue rows themselves are already closed as `no_op` — these failures
come from the trigger path, which has no terminal-stay guard.

What will change:

- **A stay that cannot be accepted is never attempted again.** `channelBookingSync` gets the same
  terminal-status guard the queue drainer already has: `cancelled`, `checked_in`, `checked_out`,
  `completed`, `departed`, `no_show` return `skipped` with reason `stay_already_<status>` instead of
  calling the channel. This alone removes all 25 rows.
- **The echo loop is broken.** A channel-sourced ingest that only rewrites the same values must not
  produce an outbound push: the poll's booking/room writes are marked as channel-origin and the
  trigger skips enqueuing for them (extending the existing 90-second `booking_sync_status` recency
  guard to cover ingest writes regardless of change kind, `confirmed` included).
- **The reopen no longer races itself.** While a queued acceptance for a reservation is pending, the
  availability delta for that property leaves the reservation's own nights open rather than
  re-pushing 0 units, so the parked confirm can land.
- **The report tells the truth about it.** `RU_CONFIRM_BLOCKED_DATES` / "not available for a given
  dates" on a stay that is already in-house is graded as a non-fault, like the existing setup-gap
  bucket, so it never drives the Priority line again.
- One-off: the 25 historic `ru_sync_runs` rows for `147032248` are closed off so the next report is
  clean.

## 2. Health report should only grade connected accounts

`WIZARD_SYNC_NOT_READY` is raised by the sync gate for accounts still mid-onboarding, and today those
rows are counted (as a recovered setup gap) even though the account is not connected yet.

Change: the report grades an account only when its channel onboarding is complete — all steps passed,
or everything passed except the final connect step. Accounts still in progress are excluded from every
number, exactly as retired accounts are, and no `WIZARD_SYNC_NOT_READY` row from them is shown at all.

## 3. Remove the retired-account footer line

The "Excluded as retired sub-accounts: OwnerID 741765 …" paragraph is deleted from the email. The
exclusion itself stays, and the AI digest still receives the retired list as context so it cannot
recommend work on a dead account — it is simply no longer printed.

## Technical detail

- `supabase/functions/_shared/channelBookingSync.ts`: add `TERMINAL_BOOKING_STATUSES` guard in the
  `isRuLead(row)` / `confirmed` branch → `result.reservation = 'skipped'`,
  `reservation_reason = 'stay_already_<status>'`; no `confirmRuRequest` call.
- `supabase/functions/_shared/ruBookingSync.ts`: while a `confirm_request` for the reservation is
  pending in `ru_call_queue`, the availability delta skips the reservation's own nights (flag read by
  the ARI push path) so the reopen is not undone.
- Migration on `public.enqueue_channel_booking_sync()`: treat a fresh channel-ingest write as
  non-enqueuing (recency guard applies to all change kinds, including `confirmed`), so the 30-minute
  poll stops generating `moved`/`notes` jobs for unchanged bookings.
- `supabase/functions/daily-health-report/index.ts`:
  - drop the retired-accounts `<p>` at line 495 (keep `retired_accounts` in the AI context object);
  - add an in-progress-account exclusion built from the channel step ledger
    (`property_channel_step_status` / `pms_tracker_status`), applied to `ru_sync_runs` and the prior
    window alongside the retired filter;
  - extend the non-fault predicate to cover blocked-dates confirm refusals on terminal stays.
- Redeploy: `daily-health-report`, `channel-booking-sync`, `process-background-jobs`,
  `modify-booking`, `cancel-booking`, `cron-ru-call-queue-drain`.
- Verification: manual health-report run shows zero `confirm_request` failures, no
  `WIZARD_SYNC_NOT_READY` rows, and no retired-account footer.
