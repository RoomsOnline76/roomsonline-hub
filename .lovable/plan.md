

## Plan: Step 8 — Discount Push for ALBATROS (RU)

### Context
- ALBATROS → RU PropertyID **4707563** under master account 738925.
- Steps 5/6/7 complete; ARI endpoints still gated by RU "not the owner" (Status 24) — proceeding to capture XML evidence for the support ticket.
- RU exposes two distinct discount endpoints:
  - **Push_PutLongStayDiscounts_RQ** — % off for stays ≥ N nights
  - **Push_PutLastMinuteDiscounts_RQ** — % off when booking within N days of arrival

### What Step 8 needs

**8.1 — Long Stay Discounts**
- Source: property `specials` table where `discount_type = 'long_stay'` (or `min_nights >= N` config).
- Build payload: array of `{ nights, discount_percent }` tiers (e.g. 7+ nights = 10%, 14+ = 15%).
- RU XML:
  ```
  <LongStayDiscounts>
    <Discount Nights="7">10.00</Discount>
    <Discount Nights="14">15.00</Discount>
  </LongStayDiscounts>
  ```

**8.2 — Last Minute Discounts**
- Source: `specials` where `discount_type = 'last_minute'`.
- Build payload: array of `{ days_before_arrival, discount_percent }`.
- RU XML:
  ```
  <LastMinuteDiscounts>
    <Discount DaysBeforeArrival="7">10.00</Discount>
    <Discount DaysBeforeArrival="3">20.00</Discount>
  </LastMinuteDiscounts>
  ```

**8.3 — Empty Discounts Local Validation**
- If property has no matching specials → skip the RU call entirely, log `skipped: no discounts configured` to `sync_logs`.
- Local validation: assert tiers are sorted, percentages 0–100, no duplicate night/day keys. Reject malformed payloads BEFORE hitting RU.

### Implementation

**`supabase/functions/rentalsunited-api/index.ts`**
- Add `push_long_stay_discounts` action → `Push_PutLongStayDiscounts_RQ` builder.
- Add `push_last_minute_discounts` action → `Push_PutLastMinuteDiscounts_RQ` builder.
- Add `get_long_stay_discounts` + `get_last_minute_discounts` for verification.

**`supabase/functions/push-property-to-ru/index.ts`**
- Add `buildLongStayDiscounts(propertyId)` — reads `specials`, returns sorted tier array.
- Add `buildLastMinuteDiscounts(propertyId)` — same pattern.
- Add `validateDiscountTiers()` — local guard (ranges, dupes, sort).
- Integrate into `pushARI`: call discounts after prices, log empty-skip cases.
- Add `verifyDiscounts()` — pull back, diff vs requested, persist to `sync_logs` (`sync_type='discounts_verification'`).

### Final Step — Comprehensive RU Support Ticket
After Step 8 executes against ALBATROS, compile single ticket containing:
- Account 738925 / PropertyID 4707563 ownership proof (Pull_GetProperty_RQ response)
- Push results matrix: property ✅ / availability ❌ / prices ❌ / long stay ❌ / last minute ❌
- Sample request/response XML for each failing endpoint (pulled from `sync_logs`)
- Status 24 evidence × 4 endpoints
- Concrete questions for RU technical team

### Assumptions
- `specials` table is the source of truth for both discount types (no separate RU-specific config).
- RU expects whole-number or 2-decimal percentages (e.g. `10.00`).
- Empty-discount case = skip endpoint, not push empty array (avoids accidental clearing).
- 365-day applicability window matches availability/prices.

