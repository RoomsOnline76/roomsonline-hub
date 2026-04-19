

## Plan: Step 11 — Lead Polling

### Context
- `cron-pull-ru-reservations` already runs a Phase 2 leads block: calls `get_leads` action, parses `<Lead>` blocks, dedupes on `ru_reservation_id` + `event_type='poll_lead'`, resolves PropID → property, logs to `ru_notifications`.
- Step 10 fixed the date format issue (`normalizeRUDateTime` now produces `YYYY-MM-DD HH:MM:SS`) — this same helper is used by `buildGetLeadsXml`, so leads should already be functional.
- Step 11 is a verification pass — confirm direct API works and cron correctly includes leads in its summary.

### What Step 11 needs

**11.1 — Direct Leads Pull**
- Invoke `rentalsunited-api` with `action='get_leads'` + 7-day window.
- Assert response shape: `{ success: true, raw_xml: '<Pull_GetLeadsList_RS>...' }` (or `Pull_ListLeads_RS` — confirm by reading current builder).
- Count `<Lead>` blocks in returned XML.
- Persist result to `sync_logs` (`sync_type='leads_direct_pull'`) for support ticket trail.

**11.2 — Verify Cron Includes Leads**
- Re-invoke `cron-pull-ru-reservations` and inspect summary fields `leads_found` and `leads_logged`.
- Query `ru_notifications` for recent rows where `event_type='poll_lead'` to confirm dedup logic works (re-running cron should not double-insert).
- Pull edge function logs and verify the "Polling leads from..." log line + per-lead processing logs appear.

### Implementation steps

1. **Read current adapter** — confirm `get_leads` action name + XML builder shape (`Pull_GetLeads_RQ` vs `Pull_ListLeads_RQ`).
2. **Direct invoke** — call `rentalsunited-api` with `get_leads` for last 7 days, capture raw XML, log to `sync_logs`.
3. **Cron invoke** — trigger `cron-pull-ru-reservations`, capture summary.
4. **Database verification** — query `ru_notifications` for `poll_lead` rows; verify dedup by re-running cron and checking row count stays stable.
5. **Log review** — pull `cron-pull-ru-reservations` logs, confirm leads phase executed cleanly.
6. **Persist evidence** — insert `sync_logs` row with consolidated leads test results.

### Files potentially modified
- `supabase/functions/rentalsunited-api/index.ts` — only if `get_leads` action is missing or XML builder is malformed.
- `supabase/functions/cron-pull-ru-reservations/index.ts` — only if log review reveals bugs in leads phase.

### Pass criteria
- Direct `get_leads` call returns valid RU XML (HTTP 200, parseable).
- Cron summary includes `leads_found` and `leads_logged` counters with sensible values.
- Re-running cron does not duplicate `poll_lead` rows in `ru_notifications`.
- Edge function logs show full leads polling phase.

### Assumptions
- ALBATROS likely has zero recent leads — empty result is a valid pass case (counters at 0, no errors).
- Master account credentials are sufficient for `Pull_GetLeads_RQ` (read-only, not gated by Status 24 ownership block).
- No new endpoints needed — leads logic is already wired into the cron from Step 10.

