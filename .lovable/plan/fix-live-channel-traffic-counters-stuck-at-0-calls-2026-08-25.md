# Fix: Live channel traffic counters stuck at 0 calls

## What's actually wrong

The traffic data exists — 939 channel calls were logged in the last 24 hours. The monitor cannot read them.

Verified: the `ru_api_log`, `ru_call_queue` and `ru_roster_cache` tables have **no table-level grants at all** for the signed-in app role. The read-security policy for admin/dev/fearless_leader is in place, but a policy alone is not enough: without a grant, every read is refused before the policy is evaluated. The two aggregate helper functions that feed the counter table run with the caller's rights, so they also see nothing and return zero rows for every endpoint — which the UI then renders as the full endpoint library at "0 calls".

The live feed and queue-depth panels are blocked by the same cause, so they are almost certainly empty too.

## Fix

1. Add the missing grants for the three tables (read-only for signed-in users, full access for backend/service use), so the existing role policies can do their job.
2. Make the two aggregate helpers read the log with owner rights so the counter table and pulse windows are computed server-side regardless of policy nuances, while remaining callable only by signed-in users.
3. Surface read failures in the panel instead of silently showing zeros: when the counters query is refused, show an error line rather than a table of zeros, and do the same for the live feed and queue depth.
4. Verify after the change: confirm the 24h counter total matches the logged call count, and that the live feed lists recent rows.

## Technical notes

- Migration: `GRANT SELECT ON public.ru_api_log, public.ru_call_queue, public.ru_roster_cache TO authenticated;` plus `GRANT ALL ... TO service_role;` (no `anon` grant — these are staff-only diagnostics).
- Recreate `public.ru_api_log_endpoint_stats(integer)` and `public.ru_api_log_traffic_pulse()` as `SECURITY DEFINER` with `SET search_path = public`, keeping `GRANT EXECUTE ... TO authenticated` and adding an internal role check (`has_role(auth.uid(), 'admin'|'dev'|'fearless_leader')`) so definer rights don't widen access.
- `src/hooks/useRuLiveTraffic.ts`: currently only sets `error` from the stats call and swallows feed/queue errors; propagate all three so `LiveTrafficFrame` can render the reason.
