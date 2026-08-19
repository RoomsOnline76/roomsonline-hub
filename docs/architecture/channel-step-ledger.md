# Channel step ledger — operator guide

The Channel onboarding wizard used to re-grade every step on each mount, which meant a page
load could fire Channel Manager (RU) reads. The ledger replaces that with durable per-step
verdicts in `property_channel_step_status`.

## Flag

`ru_platform_settings.channel_step_ledger_enabled`

- `false` (default until soak completes): exact legacy behaviour — full mount-time re-grade.
- `true`: the wizard reads the ledger, never grades on mount, never calls the channel on load.

Rollback is always "set the flag back to false".

## Two step classes

- **Local steps** — decided entirely from ROL'OS data (content, rooms, media, commercial terms,
  attractions, sign-off, …). No channel call can change the verdict.
- **Channel steps** — `keys`, `connect`, `company_profile`, `push_owner`, `publish`, `currency`,
  `pull_listings`. Only a staff-triggered recheck may probe these.

Source of truth: `CHANNEL_CLASS_LEDGER_STEPS` / `LOCAL_CLASS_LEDGER_STEPS`
(`src/lib/channelStepLedger.ts` and `supabase/functions/_shared/channelStepLedger.ts`).

## Two buttons, two meanings

| Button | Who | What it does |
| --- | --- | --- |
| **Refresh** | owner or staff | Local re-check only (`ledger_recheck`, no channel probe). |
| **Recheck channel** | staff only | Live Channel Manager probe, then persists channel-step verdicts. |

## Staleness and the background drain

When a property section is saved, only the steps that data feeds are marked `stale`
(Phase 2). `cron-channel-ledger-drain` runs every 5 minutes and clears stale **local**
steps in the background:

- batch of up to 20 properties per run, ~750 ms spacing, 75 s budget
- calls `ru-cert-portal` action `ledger_drain_recheck`, which hard-wires the channel probe
  off — it cannot issue `Pull_ListPropertyAvailabilityCalendar_RQ` or price pulls
- no-op while the flag is off
- one counts-only summary row per run in `ru_sync_runs` (`action = 'ledger_drain'`)

Owners therefore see stale local steps clear without opening the wizard.

## Reading the state

Channel Monitor → Diagnostics → **Channel step ledger** shows step counts per status split by
class, plus the last five drain runs. Counts only, no guest data or credentials.

## What must NOT be removed

`check-activation-readiness` and `phase_status` (including its forced probe) still back the
admin certification console. The wizard no longer depends on the 90 s phase cache, but the
staff tools do — keep both.
