# Health report: exclude retired accounts, stop the dead confirm_request loop

All three items in this morning's report were verified against the live rows.

## What is actually true

1. **741765 is retired** (`ru_retired_accounts`, retired 22 Aug 07:16 UTC) — and `bind_ru_account` already refuses to bind it. But the two `bind_ru_account` failures in the report happened at 22 Aug 07:07, i.e. *before* retirement, and the health report has no retired-account filter at all: `daily-health-report` reads `ru_sync_runs` with no reference to the retired registry, so any historic row naming a dead OwnerID keeps being graded for its full 24 h window.

2. **`confirm_request` ×24 is one dead booking, retried forever.** Every failure is reservation `147032248` on RU Test Clone A (owner 742004, active). That booking is already `checked_in` in ROL'OS (20–31 Aug), so the channel is right to refuse. Worse, every queued row for it fails with `Action "undefined" is not supported`: the retry payload enqueued in `ruBookingSync.ts` omits `action`, and the drainer replays `{...payload}` without it. The row exhausts 5 attempts, a new row is enqueued, and the cycle repeats every ~30 minutes. No queued acceptance for this reservation has ever reached the channel.

3. **`refresh_discounts` ×2 is already correctly handled** — it is bucketed as a setup gap and shown as recovered. No change.

## What will change

- The health report ignores anything belonging to a retired sub-account: rows whose message, error code or details name a retired OwnerID, and rows for properties bound to a retired account. The report footer states plainly which OwnerIDs were excluded, so the exclusion is visible rather than silent.
- Queued acceptances carry their verb, so a replay actually calls the channel instead of failing on `Action "undefined"`.
- Before replaying an acceptance the drainer checks the booking: `cancelled`, `checked_in`, `checked_out` or `completed` stays are closed as `no_op` with a reason, never retried. This ends the 147032248 loop.
- "Property is not available for a given dates" on a stay that is already in-house is recorded as a non-action rather than a pipeline failure, so it stops driving the report's Priority line.
- The existing queue rows for 147032248 are closed off so the next report is clean.

## Technical detail

`supabase/functions/daily-health-report/index.ts`
- Import `fetchRetiredRuOwnerIds` from `_shared/ruRetiredAccounts.ts`.
- Build a retired-property id set once (`properties.ru_listings_verified_owner ILIKE '%OwnerID <id>%'`, plus `ru_owner_accounts.ru_owner_id`).
- Filter `ru_sync_runs` (current and prior 48 h window) with a `isRetiredAccountRow()` predicate: `property_id` in the retired set, or the id appearing in `error_message` / `details`.
- Add the excluded OwnerIDs to the RU section footer text and pass them to the AI digest prompt as context so the priority line cannot ask for work on a dead account.

`supabase/functions/_shared/ruBookingSync.ts`
- Add `action: 'confirm_request'` to the `enqueueRuCall` payload (~line 605).

`supabase/functions/cron-ru-call-queue-drain/index.ts`
- Replay body becomes `{ action: row.action, ...payload, deferrable: false, queued_replay: true }` so legacy rows missing `action` still work.
- For `action === 'confirm_request'`, look up the booking by `external_reservation_id` first; on a terminal status, mark the row `no_op` (`reason: stay already <status>`) and skip the call.
- Extend `isNoOp()` to cover `not available for a given dates` **only** when the booking is terminal (handled in the branch above, not by regex alone), and to cover `no listing (\d+) for this unit` / `republish the unit`.

Data cleanup (one-off): set the exhausted/pending `ru_call_queue` rows for reservation `147032248` to `no_op` with a reason.

Deploy: `daily-health-report`, `cron-ru-call-queue-drain`, and the functions importing `ruBookingSync`.

Verification: re-run the health report manually and confirm zero `confirm_request` failures, no `bind_ru_account` row for 741765, and a footer line naming the excluded retired OwnerIDs.
