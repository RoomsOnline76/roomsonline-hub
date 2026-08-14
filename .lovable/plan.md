# Schedule the last-minute discounts push (RU cadence gap)

Short answer: yes. Rentals United expects `Push_PutLastMinuteDiscounts_RQ` (and its long-stay twin) to be pushed on change **and** at least every 24 hours. Right now only the event-driven half is live.

## Verified current state

- `supabase/functions/cron-refresh-ru-discounts/index.ts` exists and pushes both discount methods per property via `push-property-to-ru` (`action: 'discounts_only'`), logging `action: 'refresh_discounts'` to `ru_sync_runs`.
- `supabase/config.toml` declares `[functions.cron-refresh-ru-discounts] schedule = "40 2 * * *"`.
- The live `cron.job` table has **no** discounts job. Registered RU jobs are: `ru-ari-refresh` (every 6h), `ru-content-weekly` (Mon 02:00), `ru-reservations-poll` (30 min), `ru-rlnm-daily` (01:00), `ru-refresh-location-currencies` (03:10), `prune-ru-api-log-daily` (03:17).
- `ru_sync_runs` has only 2 `refresh_discounts` rows (latest 14 Aug 13:46) — manual invocations, no daily rhythm.

So the daily cadence is declared in config but never actually scheduled in the database.

## Plan

1. Register the job in Postgres: `cron.schedule('ru-discounts-daily', '40 2 * * *', ...)` calling `cron-refresh-ru-discounts` via `net.http_post` (applied as a data statement, not a shared migration, since it embeds the project URL and anon key).
2. Add `ru-discounts-daily` to `EXPECTED_JOBS` in `supabase/functions/ru-cert-portal/index.ts` so the Coverage tab verifies the schedule and stops reporting the cadence as unverifiable.
3. Confirm the `push_last_minute_discounts` / `push_long_stay_discounts` registry rows include `refresh_discounts` in their `sync_actions`, so the daily runs count as real evidence.
4. Update the certification documents (`ru-certification/02-general-declarations.md`, `05`/`06` cadence tables and `docs/ru-wl-certification-completion.md`) to declare discounts as "on change + daily 02:40 UTC" instead of listing the gap.

## Verification

Trigger the job once manually, confirm a fresh `refresh_discounts` row per connected property in `ru_sync_runs`, then re-run the Coverage export and check the discounts rows turn green from real runs.
