# Channel step ledger — Phase 3 (wizard reads the ledger)

When `channel_step_ledger_enabled` is true, Channel onboarding progress is driven by the durable `property_channel_step_status` rows instead of a full re-grade on every mount. No channel calls on page load. With the flag false, behaviour stays exactly as it is in production today.

## What changes for the user

- Opening Channels on a finished property paints instantly from the stored step verdicts — no spinner, no green steps flipping grey because the channel throttled us.
- Editing one section (say photos) marks only that step as needing a refresh; the quiet line reads "Some steps need a quick refresh" and Refresh fixes only that step.
- A rate-limited channel check shows "Channel confirmation pending — last successful check still counts" instead of undoing a step that already passed.
- Staff/platform users get an explicit "Recheck channel" action; that is the only path that talks to the channel.

## Implementation

### 1. `src/lib/channelStepLedger.ts` — read helpers (additive)

- `fetchChannelLedger(propertyId)` → `ledger_get` (pure read).
- `seedChannelLedger(propertyId)` → `ledger_seed` (idempotent).
- `recheckChannelLedger(propertyId, { allowChannelProbe })` → `ledger_recheck` with `probe_ari` set from `allowChannelProbe` (defaults to `false`).
- `ledgerStepComplete(step)`: `passed` → true, `blocked` → false, `stale`/`unknown`/`pending` → true when `passed_at` is set (a prior pass is never erased).
- `CHANNEL_CLASS_LEDGER_STEPS` list (`publish`, `currency`, `pull_listings`, `company_profile`, `keys`, `push_owner`) for the channel-only recheck.
- Every helper resolves to `null` on error, so the flag-false and failure paths behave as today.

### 2. `src/hooks/useRolosOnboardingProgress.ts` — ledger-backed path

- New flag query (`isChannelStepLedgerEnabled`, cached 5 min) plus a ledger query keyed `["channel-step-ledger", propertyId]`: `ledger_get`, and if it returns zero rows, `ledger_seed` **once** then use its rows.
- `ledgerActive` = flag true AND rows exist.
- When `ledgerActive`, the expensive `phase_status` query only runs for an explicit channel probe (`enabled: !!propertyId && (!ledgerActive || probeAri)`). Missing phase data already falls back to local ROL'OS truth and yields `unknown` checks, which are advisory and never block — so no step regresses.
- `usePropertyReadiness` is called with channel checks off on the ledger path (its query key gains the option so cached results cannot cross over), and its `check-activation-readiness` backend call is skipped when the ledger is seeded. Field items stay locally derived, so nothing in the editor highlighting changes.
- Macro derivation gets a ledger overlay after the local verdict, preserving `ROLOS_ONBOARDING_MACROS` order:
  - ledger `passed` → step complete;
  - `blocked` → not complete, with the outstanding labels taken from `blocker_summary`;
  - `stale` → keep the last complete state, mark `needsRefresh` (never locks the wizard);
  - `unknown` with `passed_at` → still complete, advisory note only.
- `MacroProgress` gains optional `ledgerStatus` and `needsRefresh` fields; existing consumers are unaffected.
- `overall.readyToConnect` keeps its current semantics (every macro before `connect` complete), so the freeze rule and `readyRegressed` banner behave as today.
- `refresh()` on the ledger path runs `ledger_recheck` with `allow_channel_probe: false` and re-reads the ledger; `refresh({ probeAri: true })` becomes the staff "Recheck channel" path with the probe allowed. A deferred/rate-limited result lands as `unknown` and leaves `readyToConnect` untouched.
- Hook returns `ledgerActive`, the count of steps needing a refresh, and `recheckChannel()` so the wizard UI can render the quiet copy and the staff action.

### 3. Wizard UI copy

In the Channels workspace header: quiet "Some steps need a quick refresh" line when any step is stale, and the "Channel confirmation pending" note on unknown channel steps. No full-page spinner on a ledger hit; the live/connect view still wins when channels are live.

### 4. Flag stays false

`channel_step_ledger_enabled` remains `false` in `ru_platform_settings`. Verification happens by flipping it for one property on staging.

## Verification

- Flag false: identical behaviour to today (existing ledger tests plus a hook smoke test).
- Flag true, seeded finished property, open Channels twice: fast load and zero ARI/price `Pull_*` rows in `ru_api_log`.
- Flag true, edit media only: media goes stale, Refresh fixes media alone.
- Rate limit on Recheck channel: status `unknown`, `readyToConnect` unchanged.
- New property: seeds once, hard step order still enforced through `connect`.
