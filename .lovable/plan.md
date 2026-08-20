# Restore lost channel units and make reconciliation actionable

## Confirmed current state

- **Dassiesingel has 4 authored units**, but the channel-linked Bosbok row is inactive locally, so the monitor counts 3 active units instead of 4. Bosbok listing `5808364` is not a duplicate.
- **Fonteinhutte has 9 authored units**, but the channel-linked Galjoen row is inactive locally, so the monitor counts 8 active units instead of 9. Galjoen listing `5806500` is not a duplicate.
- Both units remain present and active in the property editor data. The mismatch is between that authored inventory and the mirrored room-type tables; both affected rows changed state at the same sync timestamp.
- Reconciliation currently treats a live listing held by an inactive local unit as matched, while the cost monitor excludes it from billable listings. This creates a billing gap with no orphan/stale cleanup target, so the header can say “Nothing to clean up” even though the report is not healthy.
- The latest completed nightly reconciliation reports 39 live listings and no channel orphans. Therefore, live matched listings must not be bulk-deleted merely to close the local billing gap.

## Changes

### 1. Repair the two real units

- Reactivate the existing channel-linked Bosbok and Galjoen rows; preserve listing IDs `5808364` and `5806500`.
- Reactivate their linked ROL'OS room-type records and verify the active counts become 4/4 and 9/9.
- Do not create, archive, repoint, or replace either channel listing.

### 2. Make authored inventory authoritative for active state

- During property save, resolve each authored room to its existing channel-linked row by stable identity first and normalized name second.
- If an authored room is active, force its existing linked room row active; an old inactive mirror may never override it.
- Reconcile the linked `hostfully_room_types` / `rolos_room_types` pair as one identity so duplicate mirror rows cannot flip the canonical unit inactive.
- Preserve the existing safety rule: a row holding a channel listing cannot be silently orphan-deactivated.
- Add regression coverage for an active authored room whose linked row is inactive, duplicate mirrors where only one owns the live listing, and saves preserving all 4/9 units and listing IDs.

### 3. Correct reconciliation semantics

- Add a distinct **“Active on channel, inactive locally”** discrepancy bucket. These are recovery targets, not duplicates or cleanup targets.
- Provide **Reactivate unit** and **Reactivate all real units** actions that restore local active state while preserving the live channel listing.
- Count these listings in channel truth and discrepancy totals, but never in destructive “Clean up all.”
- Reserve cleanup for verified live orphans, surplus live duplicate copies, and stale local IDs only.

### 4. Make the header honest and useful

- Replace “Nothing to clean up” when non-destructive discrepancies remain.
- Show separate actions/counts: **Restore units**, **Clean up listings**, and **Account matches** only when channel, active inventory, and billable counts agree.
- Derive the displayed billable comparison from the same reconciliation classification so a headline gap always has corresponding rows or an action.

## Technical details

- Add a migration to repair Bosbok/Galjoen and harden room-type synchronization so authored active inventory cannot be deactivated by a stale linked mirror.
- Update `PropertyForm` room persistence/orphan handling to reconcile identity and active state before orphan cleanup.
- Extend `channel-manager-entitlement` reconciliation output with recoverable inactive matches and a reactivation action.
- Extend `useChannelReconciliation` and `ChannelReconciliationPanel` with typed recovery state, bulk restore progress, and separate destructive/non-destructive actions.
- Align `useChannelCostMonitor` billable counts with verified live channel truth after reconciliation.

## Verification

- Save Dassiesingel and Fonteinhutte without editing rooms; confirm counts remain 4 and 9 and the two listing IDs are unchanged.
- Run reconciliation and confirm Bosbok/Galjoen no longer appear as inactive or duplicate.
- Confirm every headline gap is represented by a classified row and action.
- Confirm destructive cleanup never includes a matched real unit, while genuine orphan/duplicate rows still expose cleanup.