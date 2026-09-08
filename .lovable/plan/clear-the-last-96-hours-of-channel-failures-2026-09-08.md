# Clear the last 96 hours of channel failures

Goal: the channel review reads clean — no failures from the recent testing runs on the endpoint counters, the live traffic log, or the sync observability / error handling board.

## What is actually there now (checked)

Last 96 hours of channel traffic:

| Record | Count |
| --- | --- |
| Successful calls | 2,433 |
| Refused calls (channel said no) | 52 |
| Calls deferred by rate limits | 38 |
| Transport error | 1 |
| Never attempted | 1 |
| Failed sync runs | 20 |
| Open blockers / recorded resolutions | 0 (already empty) |

## What will be removed

Everything failed, all accounts and properties, one 96-hour window:

- The 92 failed entries in the channel traffic log (refusals, rate-limit deferrals, transport error, not-attempted).
- The 20 failed sync runs behind the observability board.

Successful traffic stays untouched, so the counters keep the full picture of what worked. Nothing older than 96 hours is touched.

## Effect on the boards

- Endpoint counters: failure columns fall to zero for the window; success counts unchanged, so success rate reads 100% for the period.
- Live channel traffic log: only successful calls remain in the recent window.
- Sync observability & error handling: no patterns to group, so the board shows nothing needing attention.
- Compliance evidence export for the window will show only the successful calls — the deleted entries cannot be recovered.

## Technical notes

- One data-change statement per table, both scoped by `created_at > now() - interval '96 hours'`:
  - `ru_api_log` where `success = false`
  - `ru_sync_runs` where `success = false`
- `ru_open_actions` and `ru_error_resolutions` are already empty; no action needed.
- No schema, code, or UI changes — the boards read live from these tables, so they clear on reload.
- Exact counts are re-read immediately before and after the delete and reported back.
