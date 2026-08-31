# Roadmap — Leopard full-cycle channel test (2026-08-31)

- [x] Step A onboarding uses distribution email `ru-two@polka.co.za` (OwnerID 742640, verified child keys)
- [x] Re-activate Leopard unit row so readiness gate passes (sterilize left it inactive)
- [x] Step B — PASSED. Root cause was not the schema: Leopard's stored listing 5973280 had been archived at the channel, and an archived listing id can never be updated or reused — RU answers status 18 "Property with given ID does not exist". Push now detects that, purges the dead id from the owner listing snapshots and re-sends once as a create. Leopard is live as NEW listing **5974995** under ru-two@polka.co.za (OwnerID 742640), 1/1 unit verified, prices 366/366 days, availability 366/366. Inline `<AdditionalFees>` re-enabled (`RU_INLINE_FEES_DISABLED = false`).
- [x] Three September bookings on Leopard — ROL-C73-0014 (3–6 Sep, RU 147112908) and ROL-C73-0016 (20–23 Sep, RU 147112923) accepted. ROL-C73-0015 (10–13 Sep) is correctly refused: Sat/Sun are authored as no-arrival/no-departure, so a Sunday check-out violates our own changeover rule.
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
- **Changeover wire mapping corrected again (measured, decisive):** with a demonstrably clean calendar (Units=1, IsBlocked=false, Reservations=0, MinStay 1) every stay published as `<C>1</C>` was refused with "Can't check in or check out on selected dates", while the same stay on nights republished as `<C>4</C>` registered immediately. `_shared/ruChangeover.ts` now maps internal 3/1/2 → wire 4 and internal 0 → wire 1; Leopard's full 366-day calendar was re-published.
- Refusal wording: added `_shared/ruChangeoverRules.ts` (`describeChangeoverViolation`) so an authored arrival/departure bar is explained in words instead of the raw channel text — still to be wired into the create/modify paths.
