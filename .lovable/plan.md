

## Plan: Step 6 — Availability Push for ALBATROS (RU)

### Context
- ALBATROS (`f042d323-c116-421d-bdff-190b80bce4ce`) is live in RU as PropertyID **4707563** under master account 738925.
- Step 5 completed idempotent property updates. ARI push currently fails with `"You are not the owner of the apartment"` — pending RU support resolution, but we can build/refine the availability flow now and re-test once RU unblocks.
- Existing `pushARI` in `push-property-to-ru` calls the adapter for prices + availability but does NOT yet send `min_stay` or `changeover` rules.

### What Step 6 needs

**6.1 — Push Availability with min_stay & changeover**
- Extend `availability` payload from orchestrator to include per-night:
  - `available_units` (already there)
  - `min_stay` — pulled from property/room min_stay config (fallback: property-level `min_stay_nights`, default 1)
  - `changeover` — RU codes: `0` = no restriction, `1` = check-in only, `2` = check-out only, `3` = both. Default `0`. Pull from room `changeover_rules` JSONB if present (e.g. Saturday-only → `1` on Sat, `2` on Fri, `0` otherwise).
- Update `rentalsunited-api` adapter: `Push_PutBlocks_RQ` (or `Push_PutCalendar_RQ`) XML must include `<MinStay>` and `<Changeover>` per `<DateRange>`.

**6.2 — Verify Availability**
- Add `get_calendar` (Pull_ListPropertyBlocks_RQ) action to adapter.
- Orchestrator calls it post-push, asserts: dates present, units match, min_stay matches, changeover matches.
- Return verification report in push response.

**6.3 — Changeover Verification**
- Specifically diff requested vs returned changeover values. Log mismatches per night. Persist to `sync_logs`.

### Open questions (need answers before implementation)

1. **Source of changeover rules** — where do we read them from?
2. **Date window** — how many days forward to push?
3. **RU ownership blocker** — proceed and stub-test, or wait for RU support?

