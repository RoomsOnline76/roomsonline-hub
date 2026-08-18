# Fix the false "0 live on channel / 26 stale" reconciliation

## What is actually wrong (verified against the log and the code)

The channel account is fine. The last successful account read for OwnerID 741761 (18:01 UTC, 15 088 bytes) returns the real listings, including live ones (`Albatros`, `Seester`, `Tobi`… with `Active="true"`).

The reconciliation run the panel is showing (20:00:07 local / 18:00:07 UTC) did **not** read the account. That pull came back `429 RU_RATE_DEFERRED` and was parked in the background queue. When `rentalsunited-api` queues a call it answers:

```text
202 { success: true, queued: true }      // no `properties` key at all
```

The reconcile loop in `channel-manager-entitlement` only checks `listErr || success === false`, then does `res.properties || []`. So a queued read becomes **a successful read of zero listings**:

- sub-account row renders `LIVE 0 / ARCHIVED 0 / Read`
- per-property footprint shows `LIVE ON CHANNEL 0`, gaps `none`
- all 26 local listing ids fall through to "stale — the account no longer returns these"
- `Clean up all (26)` then targets the 26 **real, correct** listings

The single-listing helper in the same file (`pullOwnerListingsOnce`) already handles this correctly — it treats `queued` / a missing `properties` array as deferred. The reconcile loop is the one path that never got that check, which is why cleanup went from removing 20 duplicates to offering to remove the good inventory.

## The fix

### 1. One parser, no second code path
Reconcile stops hand-rolling its response check and uses the same helper the verify path uses. Rules, in one place:

- `queued === true`, or `properties` not an array → **not read** (deferred), never zero.
- Errors and timeouts → **not read**, as today.
- Only an actual array of listings counts as a read.

Deferred accounts render as `Not read — the channel rate-limited this pull, run again shortly` instead of `Read`.

### 2. Stale can only be decided by a read that happened
An id is classified stale only when the account that owns it was read successfully. If that account was not read (deferred, timed out, no keys, budget exhausted), its ids are reported as **unverified**, not stale. As a second belt: an account that returns zero listings while ROL'OS holds ids against it is flagged `unverifiable — the account answered empty while N local ids point at it`, and its ids are never marked stale on that pass.

### 3. Cleanup cannot act on what was not verified
- `Clean up all` counts and processes only targets from accounts with a confirmed read; the button label reflects that number.
- `cleanup_batch` re-checks the same invariant server-side and returns `skipped: unverified` for anything else, so a stale UI snapshot can never delete live inventory.
- The confirmation dialog states which accounts are excluded and why.

### 4. Header honesty
The "Billing count matches the account" chip and the live/matched/orphan counters are suppressed (shown as "incomplete — account not read") whenever any monitored account on the pass was not read, rather than displaying zeros as fact.

## Technical notes

- `supabase/functions/channel-manager-entitlement/index.ts`: reconcile account loop reuses `pullOwnerListingsOnce`-style classification (`queued`/non-array → deferred); `accountResults` gains `read: boolean` + `deferred: boolean`; stale computation keyed on per-owner read success; zero-listing-with-local-ids guard; `cleanup_batch` refuses unverified targets.
- `src/hooks/useChannelReconciliation.ts`: carry `read`/`deferred` per account, expose `unverified` ids separately from `stale`, filter `cleanupAll` targets to read accounts.
- `src/components/admin/channel-monitor/ChannelReconciliationPanel.tsx`: "Not read" account state, unverified group replacing the stale list on deferred passes, cleanup count/dialog text, incomplete-pass badge instead of the match chip.
- No schema change.

## Verification

Re-run "Reconcile with channel" for 741761 and confirm the panel reports 26 held with the live/archived split matching the last successful pull, the per-property footprint shows non-zero "live on channel", and the stale list is empty. Then force a rate-limited pull (run twice inside a minute) and confirm the account shows "Not read", no ids are listed as stale, and `Clean up all` is disabled rather than offering 26.
