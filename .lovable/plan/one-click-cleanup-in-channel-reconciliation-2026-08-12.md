# One-click cleanup in Channel reconciliation

Right now reconciliation lists orphans and stale ids and each row needs its own button. With 20+ archived orphans on the account that is 20 clicks. Add a single cleanup action that resolves everything the pass found.

## What changes

**1. "Clean up all" button** in the Channel reconciliation card header, next to "Reconcile with channel".

- Disabled when there is nothing to clean (no orphans, no stale ids) or while a pass is running.
- Label shows the workload: `Clean up all (20)`.

**2. In-app confirmation dialog** (no browser prompt — themed AlertDialog, same pattern as the duplicate purge dialog on this page). It spells out exactly what will happen:

- N orphan listings removed from the channel account (archived upstream, local ids cleared)
- N stale local ids cleared (no channel call needed)
- Notes that the action is logged for audit

**3. Sequential execution with visible progress.** The button becomes a progress state (`Cleaning 7 / 20…`) and processes rows one at a time so a single failure does not abort the rest. Rows that succeed disappear from the lists as they complete.

**4. Honest result toast.** On finish: `Cleaned 20 of 20` or, when some fail, `Cleaned 18 of 20 — 2 could not be removed`, and the failed rows stay in the list with their reason so the operator can retry just those. The local monitor data reloads once at the end, not per row.

**5. Safety.** Only listings the just-completed reconciliation classified as orphan or stale are touched. Matched (billable) listings are never included. If any account in the pass returned an error, the dialog warns that the picture is incomplete for that account and cleanup is limited to the accounts that answered.

## Technical notes

- `src/hooks/useChannelReconciliation.ts`: add `cleanupAll()` that iterates `result.orphans` then `result.stale`, reusing the existing `purgeOrphan` / `clearStale` calls, tracking `{ done, total, failures }` in state; expose `cleanup` progress for the UI. Skip orphans belonging to an account whose pass errored.
- `src/components/admin/channel-monitor/ChannelReconciliationPanel.tsx`: header button, `AlertDialog` confirmation, progress label, per-row failure reason rendering.
- No edge function changes — `purge_listing` and `clear_local_listing` scopes already exist and already write `ru_archive_events`.
