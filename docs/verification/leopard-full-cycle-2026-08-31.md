# Leopard full-cycle channel test — 31 Aug 2026

Property: **Leopard Cottage** (`ru-test-4`, Jongensfontein → Riversdale address)
Distribution account: `ru-two@polka.co.za`, OwnerID **742640**, child key pair verified
Listing: **5974995** (created fresh; the old 5973280 was archived at the channel and can never be reused)

## Verdicts

| # | Test | Verdict | Evidence |
|---|------|---------|----------|
| A | Step A — create account, capture & verify keys, company details, adopt listings | pass | child keys verified, `key_scope='child'` |
| B | Step B — property, unit, 365-day availability + prices, read-back, currency, entitlement | pass (fixed) | 1/1 unit, prices 366/366, availability 366/366 |
| 1 | Re-`Push_FillCompanyDetails_RQ` | pass | one call, Status 0 |
| 2 | Re-`Push_PutProperty_RQ` | pass | one call, Status 0 |
| 3 | Property name → "Leopard Cottage" | pass | name live on `Pull_ListSpecProp_RS` |
| 4 | Room capacity lowered | pass | StandardGuests 5 / CanSleepMax 6 on read-back |
| 5 | Address → Riversdale | blocked by channel (handled) | street/zip live; location *move* refused with Status 310 (existing reservations). One refusal, lock recorded, content re-sent once and accepted |
| 6 | Amenities added + removed | pass (finding) | add live; removal only retracts once cleared from **both** unit amenities and property facilities — published set is their union |
| 7 | Cleaning fee removed and re-added | pass (unverifiable at channel) | two single deltas, Status 0, `<CleaningPrice>0</CleaningPrice>`; `Pull_ListSpecProp_RS` returns no `<AdditionalFees>` block |
| 8 | Block 12–15 Oct | pass | Units 0, IsBlocked true |
| 9 | Re-open same nights | pass | Units 1, IsBlocked false |
| 10 | Min stay 3 nights, 20–24 Oct | pass | MinStay 3 on channel calendar |
| 11 | Changeover change + violation message | pass (fixed) | Saturday reopened (wire C=4), Sunday closed (C=1); a Sunday departure is now refused as "This property does not accept departures on Sunday 2026-09-06…" instead of the raw channel text |
| 12 | 10-day November high season + Low Season → 1111 | pass | single delta accepted; prices confirmed on `Pull_ListPropertyPrices_RS` |
| 13 | `Pull_ListReservations_RQ` cadence | pass | 05:30, 06:00 … 09:00 (every 30 min), window `-7d → +400d`, statuses 1/2/4/6/7/8 |
| 14 | RLNM / LNM subscription | pass | handler URL + 6 change types registered, ObservedOwners = 742640, read back under child keys |
| 15 | Reservation modification synced | pass (fixed) | `Pull_GetReservationByID` (owner-scoped) → `Push_ModifyStay_RQ` Status 0 → echo suppressed → one focused `Push_PutAvbUnits_RQ` |
| 16 | Reservation cancellation synced | pass (fixed) | `Push_CancelReservation_RQ` Status 0; channel then reports the reservation as gone |

Bookings used: ROL-C73-0014 (RU 147112908, modified 3–6 → 3–9 Sep), ROL-C73-0016 (RU 147112923, cancelled).
ROL-C73-0015 was correctly refused: Sat/Sun are authored as no-arrival/no-departure.

## Call-log audit (05:30 – 09:10, OwnerID 742640)

| Verb | Calls | Failures | Throttled | Reading |
|------|-------|----------|-----------|---------|
| Push_PutAvbUnits_RQ | 44 | 2 | 0 | full 366-day publishes during Step B plus focused deltas; the 2 failures were Status 22 and self-corrected on one retry |
| Push_PutProperty_RQ | 32 | 19 | 2 | Step B dead-listing recovery (Status 18) and the Status 310 location refusals — all diagnosed and handled, no blind retry storms |
| Push_PutPrices_RQ | 31 | 0 | 0 | clean |
| Pull_ListPropertyAvailabilityCalendar_RQ | 26 | 9 | 9 | *verification* read-backs by this test run, throttled by RU's per-method minute — test traffic, not production traffic |
| Pull_ListReservations_RQ | 19 | 2 | 2 | 30-minute cadence + 2 throttles from lookup fan-out (fixed, below) |
| Push_PutConfirmedReservationMulti_RQ | 14 | 12 | 0 | changeover-rule refusals while the wire mapping was being pinned down; now correct |
| Pull_GetReservationByID_RQ | 11 | 8 | 2 | the fan-out described below (fixed) |
| Push_ModifyStay_RQ / Push_CancelReservation_RQ | 2 / 1 | 0 | 0 | one call per operator action |

### Issues found and fixed in this run

1. **Own-push echoes were re-ingested.** A modify or cancel we issue ourselves is echoed back by RU within a second, before our own outbound trail row exists — and a cancel clears the booking's channel reservation id, so the booking-keyed echo test could never match. Result: the handler treated our own change as channel news and fanned `Pull_GetReservationByID` + `Pull_GetLeads` + `Pull_ListReservations` across every keyed account. `_shared/ruOwnPushEcho.ts` now also proves ownership from the wire log (recent `Push_PutConfirmedReservationMulti` / `ModifyStay` / `CancelReservation` / `RejectRequest` carrying the reservation id). Verified: the re-run modify echo is logged `skipped / own_push_echo` with zero follow-up reads.
2. **Cancelled reservations retried forever.** RU stops serving a cancelled reservation ("Status 28 — Reservation does not exist"), which the retry ladder read as a transient miss and re-attempted every drain, six wire calls each time. `refreshRuReservationById` now treats Status 28 on a *cancellation* notification as terminal, settles the local stay and resolves the notification.
3. **Changeover refusals were raw channel text.** `describeChangeoverViolation` is now wired into the modify path too, so an authored arrival/departure bar is explained in words.

### Issues to be addressed

| Issue | Impact | Evidence |
|-------|--------|----------|
| Amenity removal requires clearing both the unit amenity list and property facilities | an operator who removes an amenity in one place sees it still published | delta 6 |
| Channel listing read-back returns no `<AdditionalFees>` block | fee state can only be proven from the outbound payload, so the Coverage tab cannot audit fees | delta 7 |
| Location moves are permanently refused once a listing has reservations (Status 310) | address changes land, the location does not — needs an operator-facing explanation on the property editor | delta 5 |
| `ru-close-user` cannot archive a freshly created sub-account without that account's own key pair | orphan account (OwnerID 742643) left open at the channel | Step A side-effect |
| Sterilize leaves `hostfully_room_types.is_active = false` while the Rooms tab still lists the unit | readiness silently falls back to property-level values and Step B blocks with "6 requirements outstanding" | Step B |
| Orphaned "Leopard" room rows remain after the rename | cosmetic, but they can confuse unit matching | delta 3 |
