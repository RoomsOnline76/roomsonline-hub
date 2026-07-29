## What I verified in the database

Live counts of active, non-deleted properties by status:

```text
inactive             51
draft_pre_contract    9
contract_signed       5
contract_sent         3
activation_ready      2
live                  1
```

There are currently **zero** properties in `review_pending`, `onboarding_active`, `review_failed` or `rejected` — the four statuses the page counts in three of its four cards. So:

- The list is technically "correct" for its query, but only 2 rows can ever appear today (the 2 `activation_ready`).
- Pending Review / Needs Attention / In Onboarding show 0 and look frozen, while 17 properties genuinely mid-onboarding (draft, contract sent, contract signed) are invisible.
- Counters are computed from the *filtered* list, so a status filter zeroes out the other cards — reinforcing the "static/wrong" impression.
- Refresh does call the refetch, but there is no spinner, no toast, and no invalidation of the per-property quality-gate caches — so nothing visibly changes.

## Changes

**1. Widen the queue to the real pipeline**
Include `draft_pre_contract`, `contract_sent`, `contract_signed` alongside the existing five statuses so onboarding properties actually appear. Add an "Inactive/Archived" option in the status dropdown (not loaded by default) for lookups.

**2. Make the counters status-truth, not filter-truth**
Compute the four summary counts from the unfiltered result set, and make each card a clickable filter toggle (highlighted when active). Regroup:

- Pending Review — `review_pending`
- Ready to Activate — `activation_ready`
- Needs Attention — `review_failed`, `rejected`
- In Onboarding — `draft_pre_contract`, `contract_sent`, `contract_signed`, `onboarding_active`

Add a small "of N total in queue" line under each number so a legitimate zero reads as zero rather than broken.

**3. Keep it live**
Add `refetchOnWindowFocus` and a 60s `refetchInterval` to the queue query, plus a "Updated Xs ago" timestamp next to the Refresh button.

**4. Make Refresh actually do something**
On click: invalidate the queue query *and* the quality-gate/onboarding-score caches (which currently hold a 30s cached score per property), spin the icon while `isFetching`, and show a toast with the refreshed row count.

**5. Sidebar badge consistency**
Update the Review Queue count in `useAdminActionCounts` to use the same status set so the badge matches what the page shows.

### Technical notes

- Files: `src/pages/AdminReviewQueue.tsx`, `src/hooks/useAdminActionCounts.ts`, and the quality-gate query key in `src/components/property/QualityGateIndicator.tsx` (exported key so refresh can invalidate it).
- No database or schema changes; query and presentation only.
