# Auto-push rate and season changes to the channel

## What the logs actually show

For Tidal Pools (checked just now):

- Static content **is** auto-pushing. `ru_sync_runs` has `static_delta` rows at 20:54:50 and 20:55:58 today, each containing the per-unit content XML for Elf, Leervis, Wildeperd and Geelstert. So name/description/facility-type edits did reach the channel.
- Prices and availability **are not**. The static push deliberately excludes ARI ("rates and availability have their own event-driven path"), and every `static_delta` unit result carries an empty `"ari": {}`.
- That separate rates/availability path (`queueRuAriDelta` → `refresh_ari`) is only called from **booking confirmed**, **booking cancelled**, the **channel monitor**, and the **daily cron**. No season, rate-plan, rate-price, stop-sell or calendar-block save calls it anywhere in the app.

So adding a season (or changing a rate) sits in ROL'OS until the daily cron happens to run — which is exactly the behaviour reported.

## What to build

### 1. A rates/availability sync trigger the editor can call

Add a small edge function `ru-ari-delta` that mirrors the existing `ru-static-delta`: authenticate the caller, then hand off to the existing shared `queueRuAriDelta` helper in the background. No channel logic is duplicated — the helper already owns connectivity checks, pause state, debounce and the `refresh_ari` push.

Add a client helper `queueChannelRatesSync(propertyId, trigger)` alongside `queueChannelContentSync`, fire-and-forget with the same rules: never block a save, never turn a channel failure into a save failure.

### 2. Wire it into every surface that changes what a night costs or whether it is sellable

- Seasons and season periods (property Calendar / seasons save)
- Rate plans and rate-plan season rates (Rate Plans editor and surface)
- Rate prices, stop-sell and stay restrictions
- Availability blocks / calendar closures

Each of these fires the rates sync after the write succeeds, in addition to the existing content sync where the same save also touches static content.

### 3. Make the outcome visible

The current sync status card only reports **content** syncs. Extend it to two lines — "Last content sync" and "Last rates & availability sync" — each with its outcome (pushed / skipped and why / failed) and a manual "Sync rates now" button next to the existing "Sync content now".

Also show a short toast on save when a channel push was queued, so a save no longer looks silent.

## Notes

- Debounce stays as-is (one push per minute per property), so a burst of rate edits becomes a single channel write instead of hammering the owner's write quota.
- Nothing changes about how rates are calculated or which rate wins — this only re-sends what ROL'OS already resolved.
- If you also saw a **name or number** change that you believe never landed at the channel, tell me which field it was (property name, unit name, phone number, unit count) and I will trace that specific field through the pushed XML — the logs show the content push firing, but not every field is necessarily mapped into it.

## Technical detail

- New: `supabase/functions/ru-ari-delta/index.ts` (auth + `EdgeRuntime.waitUntil(queueRuAriDelta(...))`).
- New: `queueChannelRatesSync` in `src/lib/channelContentSync.ts`.
- Call sites: seasons save in `src/pages/PropertyForm.tsx`, `src/components/pms/rateplans/RatePlanEditor.tsx`, `src/components/pms/rateplans/RatePlansSurface.tsx`, rate-price/stop-sell/restriction and availability writes in the rate and calendar managers.
- UI: `src/components/property/ChannelContentSyncStatus.tsx` gains the rates row, reading `ru_sync_runs` rows with action `refresh_ari` (and the skip rows) the same way it reads `static_delta`.
