# Channel cleanup: verify-then-delete, and full visibility in the diagnostic log

## What is happening now (verified)

- Both calls **are** written to the durable exchange log: in the last 3 days there are 11 `Pull_ListOwnerProp_RQ` rows (the "pull all listings" reconcile read) and 40 `Push_SetPropertiesStatus_RQ` rows (the cleanup attempts).
- They are invisible in the Diagnostics panel for two reasons:
  1. The reconcile pulls carry **no `property_id`** (they are account-level, keyed on owner `741765`). Any time the property filter is not "all", they disappear.
  2. Every row is labelled with the low-level caller (`rentalsunited-api:list_properties`, `rentalsunited-api:set_property_status`). Nothing says "reconcile" or "cleanup", so the operator cannot find the operation that caused them, and there is no way to filter by operation or by owner account.
- Cleanup today calls `Push_SetPropertiesStatus_RQ` with `IsArchived=1` — it **archives** and then trusts the `Status 0` envelope. It never re-reads the account to confirm the listing is gone, which is why 24 listings kept coming back as "archived upstream" while the portal showed 9.

## What changes

### 1. Cleanup becomes verify-then-delete

New sequence per listing id, run by the entitlement function:

```text
1. Re-read the account (pull listings for the owner)
2. Absent?  -> nothing to do at the channel; clear the local id; result = "already gone"
3. Present? -> issue the removal call, then re-read the account again
4. Still present after removal? -> result = "refused", listing stays flagged, local id kept
5. Gone?                       -> result = "deleted", local id cleared
```

- Local ids are only cleared on a **confirmed** absence, never on a `Status 0` reply.
- The result of every step is recorded and shown, so "cleaned up" always means "verified gone at the channel".
- First step of the build is a probe against one known orphan id to establish which removal verb the channel account actually honours (hard delete vs. archive). If the channel exposes no hard delete, the flow keeps the archive call but the outcome is reported honestly as "archived, still returned by the account" rather than counted as removed — no silent success.

### 2. Cleanup and reconcile are attributable in the log

- The entitlement function passes a shared `trace_id` and a meaningful operation label into every channel call it makes: `channel-reconcile:pull_listings`, `channel-cleanup:verify`, `channel-cleanup:delete`, `channel-cleanup:verify_after`.
- The owner account is stamped on all of them, and the local property id whenever one is known.
- One cleanup run therefore shows as a single traceable chain: pull → verify → delete → verify.

### 3. Diagnostics panel can see account-level work

- Property filter gains an **Account-level (no property)** option, and "All" stops hiding rows with a null property.
- New **Operation** filter driven by the operation label, plus an **Owner account** filter.
- Clicking a `trace_id` filters the list to that one chain, so a cleanup run reads top to bottom.

## Technical notes

- `supabase/functions/channel-manager-entitlement/index.ts`: `purge_listing` reworked into the verify → delete → verify loop; `reconcile` and purge calls forward `trace_id` / `parent_action` / `owner_id`; response gains a per-listing `outcome` (`already_gone` | `deleted` | `refused`).
- `supabase/functions/rentalsunited-api/index.ts`: accepts the forwarded trace/operation labels (already supported by `ruLogContext`), and gains the removal action used by step 3 with its response classified rather than assumed successful.
- `src/hooks/useChannelReconciliation.ts`: `purgeOrphan` / `cleanupAll` surface the new outcomes; `refused` rows stay in the panel and are counted separately from removed ones.
- `src/components/admin/channel-monitor/ChannelReconciliationPanel.tsx`: outcome badges, a "refused by the channel" group, counters recomputed from verified state.
- `src/hooks/useRuApiLog.ts` + `RuApiLogPanel.tsx`: null-property handling, operation and owner filters, trace drill-in.
- No schema change: `ru_api_log` already holds `trace_id`, `parent_action` and `ru_owner_id`.
