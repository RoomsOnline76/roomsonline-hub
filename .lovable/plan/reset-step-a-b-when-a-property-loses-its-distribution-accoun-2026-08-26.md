# Reset Step A/B when a property loses its distribution account

## What's wrong

The onboarding workspace shows "Step A — Passed", "Step B — Passed" and "Connect channels — Passed" for a property that has no distribution sub-account bound.

Confirmed cause: those verdicts come from a durable step ledger (`property_channel_step_status`, keys `monitor_step_a`, `monitor_step_b`, `ready_to_connect`). The gate read (`ru-onboard-property` → `gate_status`) returns those stored rows verbatim — it never cross-checks them against the live binding or listing ids. The retire/unbind path (`ru-cert-portal` → `retire_owner_account`) clears listing ids, verification columns, the readiness snapshot and the `ru_owner_accounts` row, but leaves the step ledger untouched. So a sold/archived/unbound property keeps its old green verdicts.

## Fix (two layers, so it can never lie again)

1. Clear the verdicts when the account goes away
   - In `retire_owner_account`, after each property is disconnected, delete (or set to `pending`) its `monitor_step_a`, `monitor_step_b` and `ready_to_connect` ledger rows.
   - Do the same in the other paths that break the link: `rebind_owner` / unbind and property archive — anywhere the binding or listing ids are cleared.

2. Grade the verdicts against live evidence on read
   - In `gate_status`, after `readSteps` and `readBinding`, downgrade stored verdicts instead of trusting them:
     - no bound account (and no read error) → `monitor_step_a` becomes `pending`, and `monitor_step_b` / `ready_to_connect` become `pending` too.
     - account bound but no property listing id and no verified unit listings → `monitor_step_b` / `ready_to_connect` become `pending`.
   - Never downgrade when the binding lookup errored (`read_error` set) — an unreadable binding must not look like "not bound".
   - The downgrade is applied to the returned snapshot and persisted, so the ledger self-heals on the next open.

## Result for this property

Opening the workspace shows Step A as the next action with a "Create Account" button, Step B pending, and Connect channels pending — so the new owner can be provisioned a fresh slug login and re-published from scratch.

## Technical notes

- Files: `supabase/functions/ru-onboard-property/index.ts` (gate_status grading + a small `clearMonitorSteps` helper), `supabase/functions/ru-cert-portal/index.ts` (retire/rebind clearing).
- No schema change; no frontend change required — `ChannelOnboardTab` renders whatever the gate reports.
- Verification: read the ledger and binding for the affected property before/after, confirm the workspace shows Step A pending with no binding.
