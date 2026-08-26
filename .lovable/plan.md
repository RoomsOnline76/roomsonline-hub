# Fix green Step A ticks on a property with no distribution account

## What the data shows

For RU Test 2 (the anchor of the **DEMO B** portfolio, the entry in the screenshot):

- `ru_owner_accounts` has **no row** for the property or its portfolio — nothing is bound, which is why the picker line correctly reads "Not linked to a sub-account yet".
- `property_channel_step_status.monitor_step_a` is `status = pending` with blocker "Reset — distribution account test1@polka.co.za was retired".
- That same row's `details` still holds the **old run's task list**, all `passed`/`skipped`, naming OwnerID 742573 / test1@polka.co.za.

So the verdict is already correct; the five green ticks are the retired run's task details being replayed. Two reasons they survive:

1. The retire/reset path flipped `status` to `pending` but left `details.tasks` in place, and the `gate_status` downgrade loop skips any row that is *already* `pending` (`if (!row || row.status === "pending") continue;`), so nothing ever clears them.
2. `renderStep` in the onboarding tab reads `details.tasks` as `recorded?.outcome` with no regard for the step's own status, so a `pending` step paints itself green from history.

## Fix

### 1. Reset clears the evidence, not just the verdict (`supabase/functions/ru-onboard-property/index.ts`)
- In the `gate_status` downgrade loop, stop skipping rows that are already `pending`: a row is rewritten when its status is not pending **or** its `details` still carries `tasks`. The rewrite keeps `status: pending` and replaces `details` with `{ reset_reason, reset_at }` only, so no task history is left behind.
- Apply the same detail-clearing wherever a step is reset (the retire-bound-account path and the Step A/B reset writes), so a reset is always "verdict + evidence" together.

### 2. A pending step never renders recorded tasks (`src/components/admin/channel-monitor/ChannelOnboardTab.tsx`)
- In `renderStep`, use `ledgerTasks` only when the step status is `passed`, `blocked` or `stale`. When the status is `pending`/`unknown`, tasks render as `idle` with their default copy.
- Clear the live `taskStates` for a step when the gate snapshot reports that step as `pending` while no run is in flight, so a reset performed elsewhere (retire panel, another tab) drops the in-session trail on the next gate refresh instead of keeping stale ticks on screen.
- Keep the existing collapse rule, badges, red/orange/green picker ranks and the Step A header line unchanged.

### 3. Clean the rows that already carry stale tasks
One migration that empties `details` of `tasks` for `property_channel_step_status` rows where `step_key` is a monitor step and `status = 'pending'`, so existing entries (RU Test 2 included) stop showing them immediately rather than waiting for the next gate read.

## Verification

- Re-read RU Test 2's ledger: `monitor_step_a` pending with no `tasks` key.
- Open the onboarding tab, pick DEMO B: Step A badge pending, five grey tasks with default copy, no OwnerID 742573 text, header back to plain "Step A — Distribution account".
- Run Step A on a test property: ticks appear live and the header names the new login, unchanged from today.
- Build/typecheck clean.
