# Make every booking edit use one price and occupancy contract

## Confirmed findings

- The Albatros stay is now stored as **7–16 Sep, 2 adults**, with **R16,200 accommodation** and **R19,185 guest total**. Its booked room type allows **4 guests**, while the property-level value is **2**, so the room allocation—not the stale property fallback—must be authoritative.
- The function logs show the pricing engine did calculate a changed amount, but the full booking-details form kept showing the old line total. That form has no live quote update and, after calling the modification service, writes its stale room-line amount back over the service result.
- Three different edit experiences currently disagree:
  - the focused Modify dialog asks the pricing service, but only caps adults + children;
  - the full booking-details form has no occupancy cap or live repricing and rewrites room lines separately;
  - the older Bookings-page modal uses base-rate arithmetic and hardcoded guest limits rather than the stay-pricing engine.
- The modification service currently validates dates and pricing, but does not reject an over-capacity guest count. UI-only limits therefore cannot guarantee consistency.

## Implementation

1. **Create one shared booking-change contract**
   - Define the editable stay fields, quote result, occupancy result, stale-save stamps, and error handling once.
   - Use one client helper for preview and save calls so every screen sends the same snake-case request and interprets queued/refused/success responses identically.

2. **Make the server authoritative for capacity and price**
   - In `modify-booking`, resolve active room lines and their room-type capacities; sum capacity for multi-room stays and use the booked room type for legacy single-room stays.
   - Count adults + teens + children against that capacity; keep infants separate unless the room rules explicitly include them.
   - Reject invalid or over-capacity changes before any channel or local write, with a clear maximum-guest message.
   - Return the resolved capacity and complete engine quote for preview calls. Keep Rate Plans, stay shape, specials/packages, charges, settlement, and channel-first modification in the existing authoritative flow.

3. **Use the same edit experience everywhere**
   - Keep `BookingModifyDialog` as the shared stay editor for the calendar hover action, booking drawer action, and Bookings page.
   - Replace the older base-rate estimate/hardcoded-cap modal on the Bookings page with this shared editor.
   - In the full booking-details screen, keep guest identity, notes, account details, and room assignment there, but open/use the shared stay editor for dates, pax, and accommodation rather than maintaining a second implementation.
   - Ensure all four guest groups are displayed consistently and the remaining allowance updates as counts change.

4. **Stop stale values from undoing authoritative results**
   - Remove the post-service write that restores old room-line totals/pax.
   - After a successful change, refresh the booking, active room lines, account figures, calendar, and availability from saved data rather than merging submitted values into local state.
   - Route nightly rate overrides through the same total/charges/channel reconciliation boundary so changing rates cannot leave the booking total, folio, or channel price out of sync.
   - Preserve the existing stale-booking check and one channel reservation update per edit.

5. **Verification**
   - Add tests for 10→9 and 10→11 night repricing, LOS/full-stay pricing, pax-sensitive pricing, room capacity 4 with stale property capacity 2, over-capacity rejection, teens included, infant handling, multi-room summed capacity, and stale-save refusal.
   - Test each entry point: booking drawer Edit, Modify button, room-plan hover Modify, calendar drag, Bookings page Modify, and nightly rate override.
   - Re-run the Albatros case and verify the visible accommodation changes before save, an attempted fifth counted guest is refused, the saved booking and room line agree, and only one channel modification is sent.

## Technical scope

- Primary files: `BookingModifyDialog`, `BookingDetailsGrid`, the Bookings-page modify flow, `ViewRatesDialog`, `PMSDashboard`, and `modify-booking` plus focused shared helpers/tests.
- No booking-orchestrator or locked adapter changes are expected. If verification proves one is necessary, stop before changing it and present that exact locked scope first.
