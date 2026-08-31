# Leopard full-cycle channel test run + traffic audit

## Confirmed starting state

- Leopard (slug `ru-test-4`, Jongensfontein) is active, `external_system = roomsonline`.
- Its distribution account was **closed and the property sterilized on 30 Aug 20:40** — every channel step (`push_owner`, `keys`, `company_profile`, `pull_listings`, `monitor_step_a`, `monitor_step_b`, `connect`, `currency`, `publish`, `ready_to_connect`) is back to `pending` with blocker "Distribution account closed — reconnect to a new owner".
- Readiness gate content checks stand at 9/9 passed, so onboarding can start immediately.
- Consequence: this is a genuine clean run — new sub-account, new key pair, new listing id. The old listing 5973280 and its location lock are dead and will not be reused.

## Operator handoffs (cannot be automated)

The run pauses and asks you for these; everything else is driven from here.

1. **A.1 account email** — the sub-account login to create (default: `ru-test-4@roomsonline.co.za`).
2. **A.2 key/secret** — created by you in the channel portal for the new sub-account and pasted into the capture modal. No writes happen before this.
3. **Channel-side reservation edits** — the modify and cancel sync tests need one booking changed and one cancelled *in the channel portal*, so inbound notification handling is exercised for real.

## Test sequence

### Phase 1 — Onboard
Step A (create account → capture & verify keys → company details → adopt listings), then Step B (push property, units, 365-day availability + prices, read-back, location/currency, entitlement) until the property reads "Configure channels".

### Phase 2 — Three September bookings
Three local ROL'OS bookings in September on Leopard, each confirmed and verified accepted at the channel (`Push_PutConfirmedReservationMulti_RQ`, Status 0). Records the reservation ids for the later modify/cancel tests.

### Phase 3 — Delta tests (each saved on its own, one at a time, so the delta is attributable)
For every item: make the change, confirm exactly one focused delta push fired, then read back at the channel to prove the new value is live.

| # | Change | Expected wire evidence |
|---|--------|------------------------|
| 1 | Re-run company details | `Push_FillCompanyDetails_RQ` once, Status 0 |
| 2 | Re-run property push | `Push_PutProperty_RQ` once, Status 0 |
| 3 | Property name | Name changed in `Pull_ListSpecProp_RQ` read-back |
| 4 | Room Leopard capacity lowered | Standard guests / `CanSleepMax` reduced on read-back |
| 5 | Address → Riversdale | Location changed, or Status 310 handled honestly (existing reservations block location change — expected once bookings exist, and reported as such) |
| 6 | Amenities added + removed | Amenity set differs on read-back |
| 7 | Cleaning fee removed, then re-added | Fee absent then present in the published fee collection |
| 8 | Block 4 consecutive days, then reopen | `<U>0</U>` then `<U>1</U>` for exactly those nights, own-block only |
| 9 | Minimum stay change | `<MS>` on the affected nights |
| 10 | Changeover days change | `<C>` code on the affected nights; then attempt a booking that violates it and confirm the refusal is surfaced with a plain-language reason ("no check-in on this day"), not a raw channel error |
| 11 | New 10-day high season in November | Only November nights repriced |
| 12 | Low season price → 1111 | 1111 live on read-back |

### Phase 4 — Cadence & subscription checks
- `Pull_ListReservations_RQ` fires every 30 minutes with a sane window (documented look-back/forward, no past-date or 400-day windows).
- RLNM handler URL subscription is registered for the new owner id.
- Modify one channel-side reservation and cancel another; confirm both land in ROL'OS live (notification, not cron) and the local record matches.

### Phase 5 — Traffic audit
Isolate every exchange-log row for the run window and the new owner id, then classify:
- failures and their channel status codes,
- throttles / `RU_RATE_DEFERRED` and whether a retry ladder caused them,
- duplicate or repeated identical calls,
- calls that do not belong to the action in flight at that moment (out-of-context pushes),
- calls that are simply unnecessary (read-backs nobody asked for, full pushes where a delta was due).

Anything that turns out to be our fault gets fixed in place and the affected test re-run before the report is finalised.

## Deliverable

`docs/verification/leopard-full-cycle-<date>.md` containing:
- a per-test verdict table (pass / fixed / blocked-with-channel-reason),
- the isolated call log summary with counts per verb,
- an issues list split into "fixed in this run" and "to be addressed", each with the evidence trace id.

## Technical notes

- No edits to regions listed in `.lovable/ADAPTER_LOCKS.md` without asking first in the same turn.
- Existing rules stay honoured: owner-scoped reads, child key pair required before any write, no republishing channel-owned nights, no undeclared ARI read-backs, no master-account writes.
- Fixes, if any, are expected in `push-property-to-ru`, `rentalsunited-api`, `_shared/ru*` helpers and the onboard orchestrator — not in booking or property UI unless a test exposes a UI-only gap.
