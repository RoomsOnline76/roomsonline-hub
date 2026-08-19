# Channel step ledger — Phase 4 (background drain + cleanup)

Goal: stale **local** steps heal themselves in the background, the wizard stops depending on the 90-second channel-status cache, and the flag becomes safe to default on — without touching the staff certification console's full probes.

## What changes for operators

- Editing a property's content marks the affected steps "needs refresh" (Phase 2). A paced background job now clears those on its own, so an owner who returns later sees a green step without pressing anything.
- Refresh (wizard) = local only, no channel calls. Recheck channel (staff) = the only button that talks to the Channel Manager. This split gets documented in the wizard help copy.
- Certification console keeps its full live probe, unchanged.
- Rollback stays one switch: set the ledger flag off and the wizard returns to today's behaviour.

## 1. Stale local drain (no channel calls)

New edge function `cron-channel-ledger-drain`, following the existing `cron-ru-call-queue-drain` shape:

- Select `property_channel_step_status` rows with `status = 'stale'` and `step_key` in the **local** set (`identity`, `location`, `rooms`, `media`, `commercial`, `signoff`, `entitlement`), oldest `stale_at` first.
- Group by property, cap at ~20 properties per run, keep a run budget (~75s) and a small spacing gap between properties.
- For each property call the existing recheck logic with `allow_channel_probe: false` (i.e. `ledger_recheck` with `probe_ari: false`), so no `Pull_ListPropertyAvailabilityCalendar_RQ` / price pulls are issued.
- Exit early on the flag: when `channel_step_ledger_enabled` is false the job is a no-op.
- Log every outcome through `logLedgerEvent` (`drain_start`, `drain_property`, `drain_done`) — property ids only, no guest or credential data.
- Schedule via `cron.schedule` (migration) every 5 minutes, same `net.http_post` pattern as the LNM drain.

Because a local recheck runs the dry-run payload builder, the drain deliberately paces itself and never runs with `probe_ari` true, even if a caller asks.

## 2. Wizard independence from the 90s phase TTL

- Formalise the Phase 3 behaviour: with the flag on and rows seeded, the wizard renders entirely from ledger rows — the channel-status query stays disabled unless the user explicitly asks for a channel recheck, and no loading state is derived from it.
- Any label the wizard still sourced from the channel-status payload (phase / ARI age) falls back to the ledger row's stored details when the payload is absent, so nothing shows as unknown just because the cache expired.
- The stored channel-status TTL itself is left in place for the certification console and admin monitors; if we lengthen it, that change applies to those consumers only, never to a wizard gate.

## 3. Flag default

- Add a migration flipping `channel_step_ledger_enabled` to `true` once the drain has been observed running clean.
- Keep the settings row as the single kill switch: setting `{"enabled": false}` restores the old path with no deploy.

## 4. Cleanup (soak-gated, not in this phase's code)

- Mount-time full grading is already bypassed under the flag; the code stays until the flag has been true in production for the soak period.
- `check-activation-readiness` and `phase_status` remain — they are the certification console's and admin tools' probes.
- Add operator notes to the wizard help text: Refresh = local, Recheck channel = channel (staff only).

## 5. Light metrics

- Record one summary row per drain run in `ru_sync_runs` (action `ledger_drain`, counts only: properties scanned, rechecked, steps cleared, still blocked, unknown).
- Surface counts in the existing channel monitor from a plain aggregate over `property_channel_step_status` (per status, per step class) plus the drain run rows — no new table, no PII.

## Acceptance checks

- Stale local steps clear without anyone opening the wizard.
- `ru_api_log` shows no increase in availability/price `Pull_*` calls attributable to the drain.
- Flag off → old wizard path, byte-for-byte behaviour.
- Certification console full probe still works and still writes its evidence.

## Technical notes

- Local vs channel step classes come from the existing `CHANNEL_CLASS_LEDGER_STEPS` list; the drain uses its complement.
- `ledger_recheck` currently treats a missing `probe_ari` as true; the drain always sends `probe_ari: false` explicitly, and the drain path additionally hard-codes the local-only flag so a mis-shaped payload cannot start channel traffic.
- Drain writes go through `writeLedgerRows`, so the DB trigger keeps `passed_at` history and a timed-out step degrades to `unknown` rather than clearing a prior pass.
