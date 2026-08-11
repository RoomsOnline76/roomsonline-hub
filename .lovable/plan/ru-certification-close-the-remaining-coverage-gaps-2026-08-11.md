# RU certification: close the remaining coverage gaps

Audit of `docs/reference/ru-wl-certification.md` against the live adapter, registry, crons and wizard. Most methods are implemented, registered and triggered. Seven real gaps remain — five of them make correct behaviour look non-compliant in the evidence, two are missing triggers.

## Verified current state

- `rentalsunited-api` implements every method the cert doc lists, including buildings, dictionaries, LNM, reservations, lifecycle and MCQ.
- Live scheduled jobs (confirmed in `cron.job`): `ru-content-weekly` (Mon 02:00), `ru-ari-refresh` (every 6h), `ru-reservations-poll` (30 min), `ru-rlnm-daily` (01:00), `ru-lead-lifecycle-30min`, `ru-refresh-location-currencies` (daily 03:10), `prune-ru-api-log-daily` (03:17). No discount job exists.
- `ru_sync_runs` shows real green evidence for every registry action except discounts (cert-suite only), and `refresh_ari` is failing intermittently (172 runs / 69 successes; latest errors "1/9 target(s) failed after retries: Failed to send a request to the Edge Function").

## Gaps to close

1. **Static delta pushes are invisible in evidence.** `_shared/ruStaticDelta.ts` logs `action: 'static_delta'`, but the `push_property` registry row only checks `inventory_push` / `weekly_content_refresh`. Add `static_delta` to that row's `sync_actions` so the doc's "delta push on change" claim is evidenced, and surface it as its own Coverage row (direction push, cadence event-driven).
2. **Discounts have no cadence.** `Push_PutLongStayDiscounts_RQ` / `Push_PutLastMinuteDiscounts_RQ` only run from the certification suite. Add a daily discount refresh (new `cron-refresh-ru-discounts` scheduled job reusing the existing push actions and `logRuSyncRun`), plus an event-driven push when a property's discount ladder is saved. Register the job in `EXPECTED_JOBS` so the Coverage tab verifies its schedule.
3. **Prune job not declared.** `cron-prune-ru-api-log` runs live but is absent from `EXPECTED_JOBS`, so the 30-day-log retention claim is unverifiable from the console. Add it (daily) to the expected-job list.
4. **ARI/content LNM notifications are acknowledged but not acted on.** `ru-lnm-handler` marks `PropertyStaticDetails`, `PropertyChangeover`, `PropertyMinStay`, `PropertyAvailability`, `PropertyPrice` as known and logs them, with no re-pull. Wire each to a corrective read-back (availability/price/min-stay pull for the affected RU property, static re-push check for `PropertyStaticDetails`), logged as its own `ru_sync_runs` action so the live-notification area shows real usage.
5. **Currency verification is not in the wizard gate.** `verify_ru_currency` lives only in the Currency panel, so a property can clear all four phases with an unverified currency. Add a mandatory `currency_verified` check to `_shared/ruReadiness.ts` (sourced from `ru_currency_state`) and show it in Phase 4 of `RuOnboardingPipeline.tsx` with a deep link to the Currency panel.
6. **Internal methods are unsurfaced.** `list_amenities`, `list_composition_rooms`, `get_location_by_coordinates`, `get_location_by_name`, `list_cities_and_currencies`, `set_property_status` are implemented but missing from `RU_ENDPOINT_REGISTRY`, so the Coverage tab under-reports adapter breadth. Add them as informational rows (dictionary/helper area, non-mandatory), with `list_cities_and_currencies` marked "not enabled by the channel".
7. **`refresh_ari` reliability.** The 6-hourly job fails often on sub-invocations. Make the per-target failure non-fatal for the run summary when the remaining targets succeed, keep per-target errors in `details`, and only mark the run failed when every target fails — so genuine outages stay red while single cold-boot blips do not.

## Doc update

Rewrite the status column in `docs/reference/ru-wl-certification.md` §2 to match the verified reality: availability/price/discount cadences with their actual schedules, delta push evidenced, logging retention with the named prune job, and remaining "to be certified" items limited to the ones RU must sign off.

## Technical notes

Files touched: `supabase/functions/ru-cert-portal/index.ts` (registry rows, `EXPECTED_JOBS`, cadence rules), `supabase/functions/_shared/ruStaticDelta.ts` (action naming only if the registry route is not preferred), new `supabase/functions/cron-refresh-ru-discounts/index.ts` plus a `cron.schedule` migration, `supabase/functions/ru-lnm-handler/index.ts` (corrective re-pull), `supabase/functions/_shared/ruReadiness.ts` and `src/components/integrations/RuOnboardingPipeline.tsx` (currency check), `supabase/functions/cron-refresh-ru-ari/index.ts` (partial-failure semantics). Adapter-locked regions are not modified. Verification: run the Coverage and Readiness exports after deploy and confirm the two compliance counters and the discount/delta/LNM rows turn green from real `ru_sync_runs` rows.
