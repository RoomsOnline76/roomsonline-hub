# Channel step ledger — Phase 1 (schema + edge API only)

Durable per-step status storage plus edge actions to seed, read, mark stale and recheck. The wizard keeps computing readiness exactly as it does today — nothing in the UI reads the ledger in this phase.

## 1. Database

New table `public.property_channel_step_status`, primary key `(property_id, step_key)`:

- `property_id` → `properties(id)` on delete cascade
- `step_key` (one of the 14 canonical keys)
- `status` — `pending | blocked | passed | stale | unknown`
- `blocker_summary`, `input_fingerprint`, `source` (`local | channel_probe | push_result | manual_signoff | seed`)
- `passed_at`, `stale_at`, `last_checked_at`, `details` jsonb
- `created_at`, `updated_at` with the standard updated-at trigger
- index on `(property_id)` for fast per-property reads

Access rules: admins/dev/fearless_leader can read and write all rows; staff and owners of a property can read their own property's rows; nothing is publicly readable. Edge functions write via the service role.

Rule enforced in SQL by trigger: setting `stale` or `unknown` never clears an existing `passed_at` — only a fresh `passed` refreshes it, and `stale_at` is stamped when a row transitions into `stale`.

## 2. Edge actions (added to `ru-cert-portal`, existing actions untouched)

All four are gated on the Phase 0 flag: when `channel_step_ledger_enabled` is off they return `{ success: true, enabled: false, steps: [] }` and write nothing.

- `ledger_seed` — insert missing rows for a property (all 14 keys) as `pending`, `source = seed`. Idempotent: existing rows are left alone.
- `ledger_get` — pure read of the rows for a property. No RU calls, no writes.
- `ledger_mark_stale` — mark the given step keys (or all) as `stale`, stamping `stale_at` and keeping `passed_at`/`blocker_summary` history. No RU calls.
- `ledger_recheck` — the only RU-touching action: runs the existing readiness scorer for a property, then upserts each step as `passed` or `blocked` with `blocker_summary`, `input_fingerprint`, `source` and `last_checked_at`. Steps the scorer cannot answer (rate-limited or deferred channel reads) are written as `unknown`, never as `blocked`, and keep any prior `passed_at`.

Every action emits a `logLedgerEvent` line so the rollout is observable, using the Phase 0 credential scrubber.

## 3. Verification

- Deno tests for the status-transition helper: `stale`/`unknown` preserve `passed_at`; `recheck` maps deferred reads to `unknown`; seed is idempotent.
- Direct edge invocations against a Jongensfontein property: `ledger_seed` → `ledger_get` → `ledger_mark_stale` → `ledger_recheck`, checking rows change as expected with the flag on, and that all four no-op with the flag off.
- Confirm `/pms/channels` and the admin channel onboarding wizard render identically (unchanged code paths, no new queries on mount).

## Out of scope

`useRolosOnboardingProgress` and the wizard mount path stay as-is; switching the wizard to read the ledger is Phase 2.
