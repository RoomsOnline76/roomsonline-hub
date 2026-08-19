---
name: Channel Step Ledger
description: Durable channel onboarding step verdicts, local vs channel step classes, background stale drain and the flag rollback path
type: feature
---

`property_channel_step_status` holds durable per-step verdicts for Channel onboarding, gated by
`ru_platform_settings.channel_step_ledger_enabled` (default `false` until production soak; setting
it back to `false` is the rollback).

- Flag true: the wizard reads the ledger — no mount-time re-grade, no channel call on page load.
  `unknown` is advisory, never a blocker, and a timed-out probe never clears a prior `passed`.
- **Local steps** (content, rooms, media, commercial, attractions, sign-off) are decided from
  ROL'OS data. **Channel steps** (`keys`, `connect`, `company_profile`, `push_owner`, `publish`,
  `currency`, `pull_listings`) need the channel to answer and only staff may probe them.
- Saves mark only the affected steps `stale`. `cron-channel-ledger-drain` (every 5 min, ≤20
  properties, local only via `ledger_drain_recheck` with the probe hard-wired off) clears them in
  the background, so owners never have to open the wizard.
- Wizard **Refresh** = local re-check; **Recheck channel** = staff-only live probe. The wizard is
  independent of the 90 s `phase_status` cache; `check-activation-readiness` / `phase_status` force
  probes must stay for the admin certification console.
- Observability: Channel Monitor → Diagnostics → Channel step ledger (counts only, no PII) plus
  `ru_sync_runs` rows with `action = 'ledger_drain'`. Full guide: `docs/architecture/channel-step-ledger.md`.
