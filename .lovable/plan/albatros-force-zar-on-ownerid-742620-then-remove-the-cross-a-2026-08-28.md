# Albatros: force ZAR on OwnerID 742620, then remove the cross-account currency skip

## What the evidence shows

For Albatros (property location 83272, OwnerID 742620, listing 5966579) tonight:

- `Push_PutProperty_RQ` at 19:52:45 sent `CurrencyID 48` + `DetailedLocationID 83272` — accepted, listing `5966579`.
- `Pull_ListSpecProp_RQ` at 19:52:53 answered `<Property Currency="USD">`.
- The exchange log holds **no `Push_ChangeCurrency_RQ` for 742620 at all** — the last flip on location 83272 was 26 Aug on OwnerID 742574.
- The stored currency verdict for the property reads: `flip_outcome: already_set`, `owner_scope: 742620`, reason *"Rentals United reported location 83272 as ZAR (seen on account 742574, ru_readback) — no currency write needed for account 742620."*, `ru_reported_currency_iso: null`, `verified_at: null`.

That reason string is produced by a cross-account short-circuit that no longer exists in the source of `_shared/ruCurrency.ts` (the repo explicitly documents that another OwnerID's answer is never evidence). So the **deployed** `push-property-to-ru` is running an older build than the checked-in adapter: another owner's ZAR read-back is still suppressing the flip. A stale `ru_location_currency_scope` row for 742620 (`source: 'flip'`, no verification) was also written, which would suppress the write on the next run even after redeployment.

## Fix, in order

**1. Repair Albatros now (one-off remediation run)**
- Authenticate as 742620's stored child key pair (never the master pair).
- Send exactly one `Push_ChangeCurrency_RQ` with `Location 83272` (the listing's own `DetailedLocationID` as returned by `PutProperty`/`ListSpecProp`) and `Currency ZAR`. Status 0 or 339 = pass for this account; persist it as `ru_readback` scoped to `{742620, 83272, ZAR}`.
- Re-read `Pull_ListSpecProp_RQ` on 5966579 and require `Currency="ZAR"`.
- Once ZAR reads back, re-push prices for 5966579 so nights publish as ZAR amounts (no USD conversion — the amounts already sent were authored ZAR numbers published under a USD label).
- A 429 / `RU_RATE_DEFERRED` on either call stays "deferred" and retries; it never becomes a USD verdict.

**2. Clear the poisoned skip state**
- Delete `ru_location_currency_scope` rows that are not real per-account evidence: `owner_scope IS NULL`, and `source = 'flip'` rows with no matching successful `Push_ChangeCurrency_RQ` in `ru_api_log` for that owner + location (currently 742617 and 742620 on 83272).
- Reset the Albatros `ru_currency_state` row so the next run cannot inherit the "already_set" verdict that was never verified for 742620.

**3. Guarantee the skip cannot come back**
- Redeploy `push-property-to-ru` and `rentalsunited-api` so the checked-in adapter (no cross-account skip) is actually live.
- Harden the remaining skip paths so each requires evidence for *this* OwnerID:
  - `source: 'flip'` may only skip when `ru_api_log` holds a successful/339 `Push_ChangeCurrency_RQ` for that owner + location; otherwise send the write.
  - The durable `ru_currency_state` skip requires `owner_scope` to equal the current OwnerID exactly — an empty/legacy scope no longer counts as a match.
  - The `recent_identical_success` shortcut inside `rentalsunited-api` must additionally match `ru_owner_id`, so one owner's recent flip never answers for another.

**4. Make the onboarding order explicit for a brand-new OwnerID**
`FillCompanyDetails` → `PutProperty (ID=0)` → `ChangeCurrency` as that OwnerID with the listing's own `DetailedLocationID` → `ListSpecProp` must read the authored ISO → only then `PutAvb` / `PutPrices`.
Today the currency decision runs before `PutProperty`; it will be re-ordered so the flip uses the listing's returned location and blocks ARI until the read-back passes. If the read-back still disagrees, that is drift: reflip once, keep the authored ISO, and never convert rates to USD.

## Technical notes

- Files: `supabase/functions/_shared/ruCurrency.ts` (skip guards, ordering helpers), `supabase/functions/push-property-to-ru/index.ts` (flip after `PutProperty`, ARI gated on read-back), `supabase/functions/rentalsunited-api/index.ts` (owner-scoped rate shortcut).
- Data: cleanup of `ru_location_currency_scope` / `ru_currency_state` as above.
- Evidence surfaced in the onboarding UI: the currency step shows the `Push_ChangeCurrency_RQ` status and the `ListSpecProp` ISO for the current OwnerID, so "skipped" can never read as "verified".
