# Channel account truth: stop new listing generations, archive before clearing, honest counters

## What the account actually holds right now (verified from the 05:22 account read)

Account `rooms@roomsonline.co.za` (OwnerID 741761) returns **58 listings: 51 live, 7 archived**.

- **39 were created 2026-08-15, 19 were created this morning (2026-08-18).** That is why yesterday's email said 8 orphans and today says 25 — a push minted a whole new generation of listings this morning instead of updating the existing ones.
- The log shows the cause: `Push_PutProperty_RQ` calls with `ru_property_id = 0` (create) today, and every content push still gets rejected once with **status 92 "Duplicate value in distances."** before succeeding on a retry.
- 22 unit names exist 2–3 times live (Bosbok ×3, Steenbok ×3, Roman ×3, Kabejou ×3, Elf ×2, Oester ×2, …) = **26 surplus live copies**.
- Local records hold **26 ids** (1 property + 25 active units) — the user is right that 26 is the correct inventory.
- The RU portal shows 36 listings while the API returns 58; the gap is not yet explained (portal likely hides incomplete/never-completed listings). This is investigated, not assumed, as step 1 below.

## Why the numbers look impossible

Orphans (25) and duplicates (26) are **overlapping sets** — a surplus copy that no local record points at is counted in both cards, so the tiles read like 51 live listings contain 51 problems. They must be reported as one classification per listing.

## Work

### 1. Make the counters one-listing-one-class
- Classify each live listing exactly once: `matched`, `duplicate copy` (same name as a matched keeper), `orphan` (no local record and no matched same-name keeper).
- Duplicate rows show which copy is the keeper and whether the surplus copy is also unmatched.
- Footer keeps the "listings held in total" check: matched + duplicates + orphans + archived must equal the account total (58 today).
- Add a portal-reconciliation line: "API returns 58, portal shows N" with a short explanation of which listings the portal omits, resolved by inspecting one omitted id (e.g. 5829824) against a completed one.

### 2. Cleanup always archives at the channel first
- `clear_local_listing` no longer clears blindly. It runs verify → archive → verify against the account, exactly like `purge_listing`, and only releases the local id once the account reports the listing archived/absent. If the channel refuses, the id stays and the row keeps its reason.
- "Clean up all" runs the same path for orphans, duplicate copies and stale ids, so nothing is ever dropped locally while still live and billing upstream.
- Truly-absent ids (the account no longer returns them at all) still clear immediately — the verify step already proves that.

### 3. Stop the next generation appearing
- Before any create, the push reads the owner's own listing list and adopts a live listing whose name matches the unit; only a genuinely unknown unit is created.
- The created id is persisted immediately, before ARI, so a later failure cannot leave an unlinked listing.
- Fix the distances payload so status 92 stops firing (dedupe by destination *and* value, drop the block when fewer than two usable entries remain); on a 92 that returns an `<ID>`, adopt that id instead of creating again.
- Creates are excluded from blind transport retries; on a transport failure during a create, re-read the account and adopt the id if the listing landed.

### 4. Clean the account down to 26
Once the UI reports honestly, run the cleanup from the monitor page: archive the 26 surplus copies and any orphan generation, leaving the 26 listings ROL'OS points at, and confirm the account read returns 26 live.

## Technical notes

- `supabase/functions/channel-manager-entitlement/index.ts` — reconcile branch: duplicates and orphans made mutually exclusive (duplicate wins over orphan for same-name surplus); `clear_local_listing` reworked to reuse `verifyListingPresence` + `removeListingUpstream` with the same `refused` outcome contract as `purge_listing`.
- `src/hooks/useChannelReconciliation.ts` — `clearStale` surfaces `outcome`/`refused`; `cleanupAll("actionable")` covers orphans, duplicate copies and stale ids in one pass.
- `src/components/admin/channel-monitor/ChannelReconciliationPanel.tsx` — tiles reflect exclusive buckets, duplicate rows show keeper, footer adds the portal-vs-API line.
- `supabase/functions/push-property-to-ru/index.ts` — adopt-by-name resolver before any `ru_property_id: 0` call; persist ids ahead of ARI.
- `supabase/functions/rentalsunited-api/index.ts` + `_shared/ruDistances.ts` — distance dedupe and status-92 id adoption; `_shared/ruInvokeRetry.ts` excludes creates.
- No schema change.
