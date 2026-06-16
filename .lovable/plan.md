## HyperGuest Compliance Audit

I checked `supabase/functions/hyperguest-api/index.ts` against the four HG directives. **All four are already implemented.** I'm proposing two small hardenings to close edge cases.

### Audit results

| # | HG directive | Status | Evidence (`hyperguest-api/index.ts`) |
|---|---|---|---|
| 1 | `Accept-Encoding: gzip, deflate` on every request | ✅ Compliant | `getAuthHeaders()` (L350-358) and the `hgFetch` wrapper (L361-378) both inject the header; every call site goes through `hgFetch`, so it can't be bypassed. Also explicitly re-added on the availability call (L578). |
| 2 | Wait the full 300 s for `/booking/create` | ✅ Compliant | `BOOKING_TIMEOUT_MS = 300_000` (L71) is passed as `timeoutMs` only on the create-reservation call (L861). Other endpoints use a 60 s standard timeout, which is fine and documented as such. |
| 3 | Booking-List fallback to reconcile timeouts | ✅ Compliant | On `AbortError` we call `getReservations({ reservation_id: payload.reference.agency })` and return the canonical status as `reconciled_via: "booking_list_timeout_fallback"` (L864-880). |
| 4 | Respect BAR rates | ✅ Compliant | Each rate plan is classified `BAR` vs `PROMO` from `ratePlanInfo.isPromotion` (L530) and the classification is preserved through the cache write (L1101). Net/Sell/BAR prices are stored as HG returns them — we never mark down or override a BAR price. |

### Proposed small hardenings (the only gaps worth touching)

These are safety nets, not bug fixes. Skip them if you want a pure audit pass.

1. **Reconcile on non-Abort network errors too.** Today the Booking-List fallback only fires on `AbortError` (timeout). If HG returns a 502/504 or the TCP connection drops mid-response, the catch still re-throws without reconciling — same data-discrepancy risk HG warns about. Extend the catch block to call `getReservations` on any thrown error before re-throwing, and also when `/booking/create` returns 5xx.

2. **Persist the `BAR` flag onto `pms_rate_types_cache.metadata`.** Right now `rate_type` is computed on read and survives in the response, but the cache row stores it inside a JSON blob only. Promoting it to an indexed/queryable column-style flag (`is_bar boolean`) makes it trivial for downstream surfaces (yield rules, channel manager, calendar) to assert "this is a BAR plan — don't undercut" without re-parsing.

### Technical notes

- No new env vars, no schema migration required for hardening #1.
- Hardening #2 is a 1-column `ALTER TABLE pms_rate_types_cache ADD COLUMN is_bar boolean` plus a write-side flag in the normalizer; it's backwards-compatible.
- No frontend changes in either hardening.

### Files that would be touched (if you greenlight the hardenings)

- `supabase/functions/hyperguest-api/index.ts` — extend create-reservation catch + set `is_bar` on cache writes.
- New migration adding `pms_rate_types_cache.is_bar` (only for hardening #2).

### What I will NOT touch

- The 60 s timeout on non-booking calls (search, prebook, cancel, list) — HG only mandates 300 s for `/booking/create`.
- The BAR/PROMO classification rule — current logic matches the HG `ratePlanInfo.isPromotion` contract.
- Header injection — already correct everywhere.

Tell me which path: **audit-only (close as compliant)**, **+ hardening 1**, **+ both hardenings**.
