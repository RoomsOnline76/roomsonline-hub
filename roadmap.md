# Roadmap — Leopard full-cycle channel test (2026-08-31)

- [x] Step A onboarding uses distribution email `ru-two@polka.co.za` (OwnerID 742640, verified child keys)
- [x] Re-activate Leopard unit row so readiness gate passes (sterilize left it inactive)
- [ ] Step B — publish property + rooms + full ARI, read back
- [ ] Three September bookings on Leopard
- [ ] Delta tests: company details, property name, capacity, address (Riversdale), amenities, cleaning fee remove/re-add
- [ ] Availability: block 4 consecutive days then open; min-stay change; changeover change + refusal message check
- [ ] Rates: add 10-day November high season; low season price to 1111
- [ ] Cadence: confirm Pull_ListReservations_RQ every 30 min with correct window; RLNM subscription in place
- [ ] Reservation modify + cancel sync
- [ ] Isolate call log for the test window; audit failed/throttled/duplicate/unnecessary calls
- [ ] Deliver `docs/verification/leopard-full-cycle-2026-08-31.md`

## Issues found (for the feedback doc)
- Sterilize leaves `hostfully_room_types.is_active = false` while the Rooms tab still lists the unit, so readiness silently falls back to property-level values (0 beds) and Step B is blocked with unexplained "6 requirements outstanding".
- `ru-close-user` cannot archive a freshly created sub-account (OwnerID 742643) because RU requires that account's own key pair for `Push_ArchiveUser_RQ` — orphan account left open at the channel.
