# Onboarding page: stop re-grading the whole portfolio on every visit

## What happens today (verified)

- `src/pages/AdminOnboarding.tsx` paints channel progress from local data, then fires a live
  `ru-cert-portal → phase_status` probe with `probe_ari: true` for **every** ROL'OS property that has
  Channel Manager entitlement, 3 at a time, on each load of the page. That is the full-portfolio
  re-test you are seeing.
- The durable step ledger built for exactly this case is not being used here: the flag
  `ru_platform_settings.channel_step_ledger_enabled` is still `{ "enabled": false }`, and
  `property_channel_step_status` currently has **zero rows** — so no property has a stored verdict to
  reuse yet.

## What changes

1. **Read the stored verdicts first.** On load, one batched query fetches `property_channel_step_status`
   for all listed properties. A property whose steps 1–13 are recorded `passed` and not `stale` renders
   its channel stage straight from the ledger — no channel call, ready to continue immediately.
2. **Probe only what is actually unknown or dirty.** The live `phase_status` probe is reduced to
   properties that have no ledger rows, or have `stale`/`unknown`/`failed` **channel-class** steps.
   Everything else is skipped. Probes stay capped at low concurrency.
3. **Seed the ledger once** for the entitled ROL'OS properties so the first visit after this change
   already has verdicts to read, then turn the flag on. A property whose data changes is marked stale by
   the existing Phase 2 write hooks and cleared by the existing 5-minute background drain, so the page
   heals itself without a manual recheck.
4. **Manual override stays.** Per-row and page-level refresh still force a live channel recheck for
   staff, so nothing becomes unverifiable.

## Behaviour after the change

| Property state | On opening Onboarding |
| --- | --- |
| Steps 1–13 passed, nothing dirty | Instant "ready to connect" from the ledger, zero channel calls |
| Some steps stale after an edit | Renders last known verdict, background drain clears it |
| Never graded / failed channel step | Single throttled live probe, same as today |

## Technical notes

- `AdminOnboarding.tsx`: replace the unconditional `probeQueue = [...rolosIds]` with a ledger-driven
  queue. Add a batched ledger read (`property_channel_step_status` select by `property_id in (...)`,
  `status`, `step_key`, `updated_at`) and a small mapper that turns ledger rows into the existing
  `channelQueueProgress` inputs (`ruMandatoryPass` / `ruMandatoryPercent`) using
  `CHANNEL_LEDGER_STEP_KEYS`, `CHANNEL_CLASS_LEDGER_STEPS` and `ledgerStepComplete` from
  `src/lib/channelStepLedger.ts`.
- Gate the new path on `isChannelStepLedgerEnabled()`; with the flag off the page behaves exactly as
  today (rollback is flipping the flag back to `false`).
- Seeding uses the existing `ru-cert-portal` `ledger_seed` action per entitled ROL'OS property, run
  once from the Channel Monitor diagnostics panel (or a one-off admin action) — no new edge function.
- No schema change, no new tables, no change to `check-activation-readiness` or the admin certification
  console.
