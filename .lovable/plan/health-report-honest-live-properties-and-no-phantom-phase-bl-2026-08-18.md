# Health report: honest "Live properties" and no phantom phase_blocked

## What the data shows

**1. "Live properties 2" is counting the wrong thing.** The chip is filled from a row count of distribution accounts (`ru_owner_accounts`), which currently holds two records: the Jongensfontein account (OwnerID 741761) and an unprovisioned test account (742004). It has never counted properties. The real channel footprint is 4 trading properties, all in the Jongensfontein portfolio:

```text
Fonteinhutte    building listing 5808606 + 8 unit listings
Seesig          9 unit listings
Dassiesingel    4 unit listings
Tidal Pools     4 unit listings
```

**2. "phase_blocked — Now Failing" is stale evidence, not a live failure.** `phase_blocked` is not a pipeline; it is the audit trail written when a push is refused by the wizard gate. It only ever writes `success = false`, so it can never show a later success and is therefore permanently red in the "Now" column.

The four entries were written at 05:09:40–05:09:49 for the four Jongensfontein properties. Company details for OwnerID 741761 were accepted at 05:11:01, 72 seconds later, and the account now records `company_details_status = sent` with keys verified at 05:09:21. So the report's priority instruction ("run Complete company details") is asking for work that had already completed before the email was composed.

## Changes

### Live properties chip
- Count trading, non-sandbox properties that actually have a channel footprint (a building listing id, or at least one unit listing id) and push enabled — the same footprint rule the Channel Monitor cards use, so both surfaces agree.
- Relabel to make the number unambiguous, and add a companion figure for distribution accounts so the account count is still visible instead of masquerading as properties.

### phase_blocked reporting
- Treat `phase_blocked` as a refusal record rather than a pipeline action: keep it out of the action table's pass/fail grid and out of the "Now Failing" verdict.
- Report it in its own line, resolved against current state: a blocked run whose blocker no longer holds (company details now on record, keys verified, wizard complete) reads as "cleared at <time>". Only blockers that are still true today appear as outstanding, with the property names attached.
- The AI summary prompt is told the same thing, so the Priority paragraph stops recommending work that is already done.

### Secondary note (kept visible, not actioned here)
`refresh_ari` reported "Can't set 8 availability on 1 apartment units" and two stale listing mappings were cleared. Both self-recovered and are unrelated to the counters above; they stay listed in the report as recovered items.

## Technical notes

- `supabase/functions/daily-health-report/index.ts`
  - replace the `ru_owner_accounts` head-count with a footprint query over `properties` + `hostfully_room_types` (trading, non-sandbox, `ru_push_enabled`, listing id present on the property or any unit); keep the account count as a separate field.
  - add `phase_blocked` to a refusal-action set excluded from `byAction` grading, `current_ok`, `failedRuns` and `top_errors`; derive a `blocked` block by re-checking each blocker against `ru_owner_accounts` / `ru_api_credentials` and dropping the ones already satisfied.
  - render the new blocked block in the HTML section and include it in the summary prompt text.
- No schema change and no channel calls; reporting and counting only.
