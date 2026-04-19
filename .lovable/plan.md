

## Plan: Step 7 — Pricing Push for ALBATROS (RU)

### Context
- ALBATROS (`f042d323-c116-421d-bdff-190b80bce4ce`) → RU PropertyID **4707563** under master account 738925.
- Step 6 built availability + min_stay + changeover push and verification (currently blocked by RU "not the owner" error — same blocker likely applies here).
- Existing `pushARI` in `push-property-to-ru` already calls `push_prices` via the adapter, but:
  - Does not break prices into seasonal date ranges.
  - Does not push extra-guest pricing.
  - Has no post-push verification.

### What Step 7 needs

**7.1 — Push Prices (seasonal + extra guest)**
- Build `prices` payload by walking `seasons` table for the property:
  - For each season → emit `<DateRange>` with `DateFrom` / `DateTo`.
  - Resolve nightly rate from `season_rates[roomId][${seasonId}-${rateTypeId}]` (use Standard/default rate type).
  - Include `<ExtraGuestPrice>` from room/property `extra_person_charge` (per-night, per-extra-adult).
- Update `rentalsunited-api` adapter `Push_PutPrices_RQ` XML:
  ```
  <Prices>
    <Season DateFrom="..." DateTo="...">
      <Price>2700.00</Price>
      <ExtraGuestPrice>250.00</ExtraGuestPrice>
    </Season>
    ...
  </Prices>
  ```
- Window: same 365-day forward window as availability.
- Currency: pull from property (RU expects ISO 4217, e.g. ZAR).

**7.2 — Verify Prices**
- Add `get_prices` action to adapter (`Pull_ListPrices_RQ`).
- Orchestrator calls it post-push, parses returned `<Season>` blocks, diffs vs requested per date range:
  - `price` match
  - `extra_guest_price` match
  - date coverage (no gaps, no missing seasons)
- Persist verification report to `sync_logs` under `sync_type='prices_verification'`.
- Return summary in push response (matches / mismatches / missing seasons).

### Final step — Compile RU Support Ticket
After Steps 5/6/7 are code-complete, generate a comprehensive support ticket that includes:
- Account + property IDs
- All push attempts (property ✅, availability ❌, prices ❌)
- Sample request/response XML pairs pulled from `sync_logs`
- Specific Status Code 24 evidence from each ARI endpoint
- Clear questions for RU technical team

### Files to modify
- `supabase/functions/push-property-to-ru/index.ts` — add `buildPricesPayload()`, `verifyPrices()`, integrate into `pushARI`.
- `supabase/functions/rentalsunited-api/index.ts` — extend `push_prices` XML builder, add `get_prices` action.

### Assumptions (proceeding unless told otherwise)
- Use Standard rate type as the canonical RU price (RU has one price per season, not multiple rate types).
- Extra guest price = property/room `extra_person_charge` (single value, applied per extra adult per night).
- 365-day window matches availability for consistency.
- Will execute push against ALBATROS to capture XML evidence for the support ticket — expecting Status 24, but logging the full request/response either way.

