

## Plan: Step 9 — RLNM Subscription & Handler Testing

### Context
- RLNM handler already exists at `supabase/functions/ru-reservation-handler/index.ts` (Phase 2 complete).
- Current behavior: parses RU XML, matches property, creates/cancels bookings, logs to `ru_notifications`, always returns HTTP 200.
- Need to: (a) register the handler URL with RU, (b) run end-to-end simulations covering all 5 notification scenarios.

### What Step 9 needs

**9.1 — Subscribe RLNM Handler**
- Handler URL: `https://qmprswbgkpzcvexmmcbf.supabase.co/functions/v1/ru-reservation-handler`
- Add `subscribe_rlnm` action to `rentalsunited-api` adapter → calls `Push_PutHandler_RQ` with our handler URL.
- Add `get_rlnm_handler` action → `Pull_GetHandler_RQ` to verify subscription.
- Build a one-shot orchestrator function `ru-rlnm-subscribe` that subscribes + verifies + persists result to `sync_logs` (`sync_type='rlnm_subscription'`).

**9.2–9.6 — Simulation Test Suite**
Build a Deno test file `supabase/functions/ru-reservation-handler/index.test.ts` that POSTs canned RU XML payloads to the deployed handler and asserts:

| # | Scenario | XML fixture | Expected outcome |
|---|----------|-------------|------------------|
| 9.2 | Confirmed reservation | matched ALBATROS PropID 4707563, new ReservationID | HTTP 200, `ru_notifications` row (`processed=true`), new `bookings` row (`integration_type='rentalsunited'`, `status='confirmed'`) |
| 9.3 | Duplicate reservation | same XML re-posted | HTTP 200, second `ru_notifications` row, **no second booking** (dedup on `external_reservation_id`) |
| 9.4 | Cancellation | `<IsCancel>true</IsCancel>` for same ReservationID | HTTP 200, booking flipped to `status='cancelled'` with cancellation_reason set |
| 9.5 | Lead | `<IsLead>true</IsLead>` payload | HTTP 200, notification logged as `event_type='lead'`, no booking created |
| 9.6 | Unmatched property | unknown PropID `9999999` | HTTP 200, notification logged with `property_id=null`, no booking created |

Each test cleans up its own rows via service role client (delete by `external_reservation_id`).

### Implementation

**`supabase/functions/rentalsunited-api/index.ts`**
- Add `subscribe_rlnm` action — emits `Push_PutHandler_RQ` with our handler URL.
- Add `get_rlnm_handler` action — emits `Pull_GetHandler_RQ`.

**`supabase/functions/ru-rlnm-subscribe/index.ts`** (new)
- Calls `subscribe_rlnm`, then `get_rlnm_handler` to verify, persists subscription state to `sync_logs`.
- Returns `{ subscribed, registered_url, verified }`.

**`supabase/functions/ru-reservation-handler/index.test.ts`** (new)
- 5 Deno tests, one per scenario, using canned XML strings.
- Loads `VITE_SUPABASE_URL` + service role key via dotenv.
- Cleans up DB rows after each test.

### Final Step — Comprehensive RU Support Ticket
After Step 9, compile the full ticket containing all 4 ARI failures (availability/prices/long stay/last minute) plus confirmation that property metadata + RLNM subscription succeeded.

### Assumptions
- RU's `Push_PutHandler_RQ` accepts our public Supabase Edge Function URL with no auth header (handler reads raw XML, no JWT required — confirm `verify_jwt = false` for `ru-reservation-handler`).
- Tests run against the deployed handler (live URL), not a local mock — matches the edge-function-testing pattern.
- ALBATROS RU PropertyID `4707563` is already mapped to a ROL'OS property row, so confirmed/cancellation tests will match.

