# Fix the wizard stalling on "pull listings & verify" after a company-profile change

## What is happening (verified on RU Test Clone A)

The channel step ledger for this property currently holds:

```text
identity, location, rooms, media, commercial, publish, currency  → passed (channel probe)
company_profile, keys, push_owner, entitlement, connect          → pending (seed, never graded)
pull_listings, signoff                                           → stale (seed, no passed_at)
```

Meanwhile the property's own records show the work *was* done: listings were pulled and adopted at 19:32 (9 of 9 matched, OwnerID 742004), the verification checklist is fully ticked and signed off at 19:32, and `Push_FillCompanyDetails_RQ` succeeded at 19:12.

Two defects combine:

1. **Nothing ever records a pass for the account-scoped steps.** The grader only translates readiness checks into ledger rows for the seven local/probe steps. `keys`, `company_profile`, `push_owner`, `signoff`, `pull_listings`, `entitlement` and `connect` are only ever written as `pending` or `stale` — never `passed`.
2. **A `stale` row with no recorded pass reads as "not complete".** Because the probe rows do carry verdicts, the wizard is on the ledger path, so the stale `pull_listings` and `signoff` rows hold those steps open no matter what the property's own records say — and every re-open re-runs the channel pull, which is what trips the rate limiter.

On top of that, saving company details marks `pull_listings` stale (and the listings-pulled event itself marks `pull_listings` stale instead of passed), so pulling listings can never settle.

## What will change

**1. Record real verdicts for the account-scoped steps.** A new `ledger_record` action writes `passed` rows (with the right source) at the moments the work actually completes and is confirmed:

- company profile accepted by the channel → `company_profile` passed (`push_result`)
- key pair verified → `keys` passed
- owner pushed / sub-account created → `push_owner` passed
- listings pulled & adopted → `pull_listings` passed (replacing today's "mark stale" on that event)
- verification checklist fully ticked → `signoff` passed (`manual_signoff`)
- Channel Manager entitlement enabled → `entitlement` passed; live connection → `connect` passed

**2. Stale must never erase finished work.** A step whose ledger row is `stale`/`pending` with no recorded pass falls back to the property's own records instead of being treated as incomplete. Stale then means only "re-verify when you can", shown as a refresh hint — it no longer blocks the wizard or forces a channel call on open.

**3. Correct the invalidation scope.** A company-details change invalidates `company_profile` and the company tick on the verification checklist only. It no longer touches `pull_listings`. So after changing the business name the company step un-ticks and asks to re-send, the listing pull stays green, and once the confirmed push lands the company step goes green again on its own.

**4. Backfill this property.** Set `pull_listings` and `signoff` to passed from the recorded pull/sign-off timestamps, and `company_profile` from the successful 19:12 push, so the wizard opens straight to the remaining work instead of re-pulling.

## Technical notes

- `supabase/functions/_shared/channelStepLedger.ts`: add a `recordLedgerVerdicts()` writer for explicit step verdicts (status + source + fingerprint), keeping the existing `passed_at` preservation trigger behaviour.
- `supabase/functions/ru-cert-portal/index.ts`: add the `ledger_record` action; call the writer from the `ensure_company_details`, key-verify, push-owner, listing-pull, sign-off and entitlement handlers; change line ~4575 from stale to passed for `pull_listings`; narrow the company-save stale scope at ~6308 and the keys scope at ~3926.
- `src/lib/channelStepLedger.ts`: add `recordChannelStepPass()`; treat a verdict-less `stale` row as "no verdict" in `ledgerHasVerdict`/`ledgerStepComplete` so local truth wins.
- `src/hooks/useRolosOnboardingProgress.ts`: call `recordChannelStepPass` from `recordListingPull`, `sendCompanyDetails` (on confirmed push) and the sign-off writer; keep `needsRefresh` as an advisory badge only.
- Backfill runs as a data update on `property_channel_step_status` for the affected property.
