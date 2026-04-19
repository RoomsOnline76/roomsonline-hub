

## Plan: Step 10 — Reservation Polling

### Context
- `cron-pull-ru-reservations` already exists and handles full poll flow: queries last 7 days via `list_reservations`, parses `<Reservation>` blocks, creates/updates/cancels bookings, resolves PropID → property/room_type, dedupes leads, logs to `ru_notifications`.
- `rentalsunited-api` adapter needs verification that `list_reservations` and `get_leads` actions exist and emit correct XML (`Pull_ListReservations_RQ` / `Pull_ListLeads_RQ`).
- This step is a live test pass against ALBATROS + cron observability — no major new code expected.

### What Step 10 needs

**10.1 — Direct Reservation List**
- Verify `rentalsunited-api` exposes `list_reservations` action with `date_from` / `date_to` params → returns raw RU XML.
- If missing or malformed: add/fix the action to emit `Pull_ListReservations_RQ` per RU XSD ordering.
- Test by invoking with a 7-day window and asserting valid `<Pull_ListReservations_RS>` shape (status, reservation count).

**10.2 — Trigger Cron Pull**
- Manually invoke `cron-pull-ru-reservations` end-to-end.
- Assert response shape: `{ success, summary: { total, created, updated, cancelled, skipped, failed, unmatched, leads_found, leads_logged } }`.
- Verify `ru_notifications` rows written for matched + unmatched cases.
- Verify `bookings` table reflects any new/updated reservations.
- Confirm pg_cron schedule exists (every 30 min) — add if missing.

**10.3 — Check Edge Function Logs**
- Pull `cron-pull-ru-reservations` logs and confirm:
  - Date window logged
  - Per-reservation processing logged (success/skip/fail)
  - Leads polling phase ran
  - Summary line at end
- Surface any errors / unmatched warnings for follow-up.

### Implementation steps

1. **Verify adapter actions** — read `rentalsunited-api/index.ts` to confirm `list_reservations` + `get_leads` builders exist and produce correct XML.
2. **Patch adapter if needed** — add missing action(s) following XSD ordering rules.
3. **Ensure pg_cron schedule** — query `cron.job` table; if no schedule for `cron-pull-ru-reservations`, create one (every 30 min) using project URL + anon key.
4. **Trigger test run** — invoke the cron function manually, capture summary.
5. **Log review** — pull recent edge function logs, verify expected output.
6. **Persist summary** — insert a `sync_logs` row with `sync_type='reservation_poll'` capturing the test summary for the support ticket trail.

### Files potentially modified
- `supabase/functions/rentalsunited-api/index.ts` — only if `list_reservations`/`get_leads` actions are missing or broken.
- `supabase/functions/cron-pull-ru-reservations/index.ts` — only if log-polling reveals bugs.
- New SQL via insert tool — pg_cron schedule (only if not already present).

### Pass criteria
- `list_reservations` returns valid RU XML for a 7-day window.
- Cron function invocation returns success with structured summary.
- Logs show expected per-reservation processing.
- pg_cron job confirmed running every 30 minutes.

### Assumptions
- 7-day rolling window remains the right size (matches RU best practice for catching missed RLNM pushes).
- ALBATROS may have zero recent reservations — that's a valid pass case (summary all zeros + clean logs).
- Master account credentials in secrets are sufficient for `Pull_ListReservations_RQ` (this is read-only and not gated by the "not the owner" Status 24 issue blocking ARI pushes).

