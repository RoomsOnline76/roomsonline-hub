# Make "Clean up all" fast

## Why each row takes 2–3 minutes

Cleanup is per-row and each row re-reads the whole channel account:

- `purge_listing` does verify → remove → verify: **two full account listing pulls** per listing.
- `clear_local_listing` does the same verify → archive → verify.
- Each pull goes to `rentalsunited-api` `list_properties`. When the sliding-minute rate gate defers it, `pullOwnerListings` waits **20s and retries, up to 3 times** (up to 60s per pull) — so one row can burn ~2 minutes before it even gets to the removal call.
- The account snapshot memoization that already exists in `rentalsunited-api` (`OWNER_LISTING_SNAPSHOTS`, TTL = one rate window) is used by the push adoption path but **not** by these cleanup reads, so every verify pays the channel again.
- The frontend loop in `cleanupAll` runs rows strictly one at a time, each one a separate edge-function invocation, so nothing is shared between rows.

Net effect: N listings ≈ 2N account pulls, most of them rate-limited waits, for information that is identical across all rows in the same run.

## The fix: one account snapshot per cleanup run

**1. Reuse the existing snapshot for cleanup verifies.**
Route the cleanup presence checks through the same owner-listing snapshot the push path already uses, so the first verify in a run pays for the read and every subsequent row reads memory. Only the post-removal verify for the listing just touched needs fresh data — and that is satisfied by updating the snapshot entry for that one listing (the same way the push path already updates it after minting), not by re-pulling the account.

**2. Add a bulk cleanup scope in the entitlement function.**
`cleanup_batch` accepts the full list of listing ids / stale record ids for one owner and runs, inside a single invocation:

```text
pull the account once
for each target:
  absent            -> already_gone, clear local id
  present           -> removal call, mark removed in the snapshot
after the loop:
  pull the account once more (verification pass)
  anything still live -> refused, local id kept
```

That is 2 account pulls per run instead of 2 per row, and one HTTP round trip instead of N.

**3. Keep the run inside the function's time budget.**
Process targets until a ~12-minute budget is spent (same pattern as the resumable RU push), then return `status: "resumable"` with the remaining ids so the UI can continue with a second call. No silent truncation.

**4. Progress and honesty unchanged.**
The response returns a per-target outcome (`already_gone` | `deleted` | `refused` | `failed` with reason). The panel keeps its `Cleaning n / N…` label, driven by the batch response (and by chunking the batch per owner account), refused rows stay listed with their reason, and local ids are still only released on a confirmed absence.

## Technical notes

- `supabase/functions/rentalsunited-api/index.ts`: let the `list_properties` action serve from `OWNER_LISTING_SNAPSHOTS` when a caller passes an explicit `allow_snapshot` flag (cleanup verifies), and expose a way to mark one listing removed in the snapshot. Reconciliation reads stay uncached.
- `supabase/functions/channel-manager-entitlement/index.ts`: new `cleanup_batch` scope wrapping the existing `purge_listing` / `clear_local_listing` bodies over a shared snapshot; `verifyListingPresence` gains a snapshot-backed mode so the 20s deferral ladder is hit at most once per run. `ru_archive_events` rows are still written per target.
- `src/hooks/useChannelReconciliation.ts`: `cleanupAll` groups targets by `owner_id` and calls `cleanup_batch` per account, handling `resumable` by looping on the returned remainder; per-row `purgeListing` / `clearStale` stay for single-row actions.
- `src/components/admin/channel-monitor/ChannelReconciliationPanel.tsx`: progress and outcome rendering fed from the batch response — no new controls.
- No schema change.

## Verification

Run "Clean up all" on the account that currently takes minutes per row and confirm the whole set finishes in one or two account pulls, that `ru_api_log` shows two `Pull_ListOwnerProp_RQ` rows for the run rather than one per listing, and that any refused listing still shows its reason and keeps its local id.
