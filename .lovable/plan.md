# Step 5 — LNM / MCQ: property-level status chips + duplicate-subscription certification

The plumbing exists: `ru-lnm-handler` (inbound), `cron-ru-rlnm-refresh` (daily fan-out of PutHandlerUrl → PutLnmSubscriptions → ListLnmSubscriptions), the admin **Live notifications** panel, and `order_mcq` with its 280 self-heal. The two gaps from the inventory are: nothing shows LNM/MCQ health on the property itself, and there is no duplicate-subscription test in the certification suite.

## What gets built

### 5a — LNM/MCQ status read for a property
A read-only `lnm_status` action in the certification portal that, for the selected property, resolves the owning RU account (sub-user, else master), reads back the subscriptions RU currently holds, diffs them against what we intend to hold, and returns:

- handler URL RU holds vs ours (match / drift)
- which of the six change types are present, and specifically whether `PropertyMCQEligibilityCheck` is there
- whether the owning OwnerID is an observed owner
- last successful subscribe + last read-back timestamps (24h freshness)
- the newest MCQ order for the property's listings with its status

Read-back only — no push — so opening the property editor never consumes a push slot in RU's one-call-per-method-per-minute budget. The result is cached briefly so tab switching doesn't re-hit RU.

### 5b — Status chips on the property editor
In the RU owner/offerings area of the property editor, a compact chip row:

- **Live notifications** — green (RU holds our handler + all change types + this owner), amber (stale > 24h), red (drift or never subscribed), grey (account has no own API keys → unmonitored gap)
- **Quality check (MCQ)** — passed / failed / ordered-awaiting-result / not ordered, plus the blocking reason when RU refused (280 subscribe-first, 17 RU-side fault)

Each chip expands to the detail (missing change types, the URL RU actually holds, RU ResponseID for a failed MCQ) and links through to the admin Live notifications panel to re-subscribe. Chips never block saving or pushing — they are diagnostic.

### 5c — Duplicate-subscription certification tests
Two new certification actions, mirroring the availability/pricing duplicate tests:

- `lnm_duplicate_test` — puts the LNM subscription **twice** for the scoped account (respecting per-method pacing), then reads back once and asserts RU holds exactly one subscription record: one handler URL, each change type once, each observed owner once. Duplicated entries or a drifted URL fail the test.
- `mcq_duplicate_test` — orders the quality check twice for the same listing and asserts RU does not create conflicting parallel orders; a second `280` is a fail, RU status `17` is reported as an RU-side fault rather than a ROLOS payload failure (existing rule).

Both are account-scoped and stay in the child-auth-strict / master-forbidden sets, log their own `ru_sync_runs` rows, and produce copyable evidence JSON (request, raw RU response, read-back diff) for the certification pack.

### 5d — Surface in the certification console and coverage tab
- New milestones next to the existing LNM entries: *LNM duplicate-subscription test* and *MCQ duplicate-order test* (non-mandatory evidence steps).
- The Live notifications panel gains the duplicate-test buttons with their read-back diff shown inline.
- Coverage tab rows for the LNM methods pick up the new action keys so cadence grading counts these runs and shows amber/red when the 24h refresh is missed.

## Technical notes

- New handlers are additive in `supabase/functions/ru-cert-portal/index.ts`; `ACTION_TO_RU_METHOD`, `CADENCE_RULES`, `CERT_CHILD_SCOPED_ACTIONS`, `CERT_MASTER_FORBIDDEN_ACTIONS` and the coverage registry get the new keys. `ru-reservation-handler` and every locked adapter region are untouched.
- Diffing reuses `_shared/ruLnm.ts` (`parseLnmSubscriptions`, `diffLnmSubscriptions`, `DEFAULT_LNM_CHANGE_TYPES`); account fan-out reuses `resolveRuOwnerScopes`.
- Chips live in a new small component mounted from `PropertyRuOwnerPanel.tsx` (frontend only), fed by the `lnm_status` action.
- No schema change: subscription state is read live from RU and logged to `ru_sync_runs`; MCQ state comes from `ru_mcq_orders`.
