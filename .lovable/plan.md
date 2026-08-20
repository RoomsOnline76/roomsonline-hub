# Stop double-bookings and over-capacity stays

Two reservations can currently sit on the same unit for the same nights because nothing stops them: the booking dialogs write straight to the database with no availability check, the date pickers show every night as selectable, and the guest counts are only checked at the moment of saving. This plan closes all three gaps and backs them with a database guard so no path — manual booking, edit, group pickup, channel import — can create an overlap silently.

## What changes for the operator

**Creating a booking**
- The stay date picker greys out and refuses nights that are already taken in the chosen unit, plus nights held by a maintenance/owner block or a stop-sell. Hovering a blocked night says why ("Rocco Steele — booked" / "Owner block").
- Guest steppers stop at the unit's sleeping capacity. Geelstert sleeps 6, so Adults + Teens + Children cannot be pushed past 6; infants are excluded from the cap. The remaining capacity is shown next to the fields.
- If no unit of the chosen type is free for the whole stay, the room line says so and offers the types that are free.

**Editing a booking**
- The edit date picker gets the same treatment: the stay's own nights stay selectable, every night held by another stay or block in that unit is refused.
- The same guest cap applies, based on the unit currently on the reservation.

**Deliberate overbooking (owner, admin, fearless_leader)**
- Those roles are not silently allowed through. They see the same block, with an "Overbook anyway" action that requires a typed reason.
- The confirmed override is stamped on the booking (reason, who, when) and written to the audit log, and the affected nights appear as an overbooking on the Rooms grid and Command Centre so it is never invisible.
- Everyone else gets a plain refusal naming the clashing guest and the free alternatives.

## Technical approach

**1. One availability resolver — `src/lib/unitAvailability.ts`**
Single helper that, for a property, returns per unit and per room type: nights occupied by live stays (`rolos_booking_rooms` joined to `bookings`, excluding `cancelled` / `no_show` and cancelled room lines), and nights blocked in `property_availability` (`is_stop_sell`, or `available_units = 0`). It exposes `blockedNightsForUnit`, `freeUnitsForType(nights)` and `capacityFor(roomTypeId)`.

Note on existing data: `property_availability.room_type` holds a mix of room-type UUIDs and plain names (both are present for this property today), so the resolver must match on either form, otherwise blocks silently fail to register.

**2. Date pickers**
`ManualBookingDialog` and `BookingModifyDialog` pass the resolver's blocked-night set into `StayRangePicker` as `disabled` plus a `blocked` modifier for the visual treatment, with the booking's own nights excluded when editing. Selecting a range that spans a blocked night is rejected in `onRangeSelect`, not just on save.

**3. Guest caps**
The existing per-line `lineCapacity` becomes the input constraint: `max` on the number inputs and clamping in `updateLine` so a higher figure cannot be typed. `BookingModifyDialog` gains the same logic (it has none today) by reading `max_occupancy` for the reservation's room type.

**4. Server-side guard — the part that actually prevents it**
Because manual creation inserts directly from the client, UI checks alone are bypassable. Add a `BEFORE INSERT OR UPDATE` trigger on `rolos_booking_rooms` (and on `bookings` date changes) that raises an error when a live room line already covers the same `room_id` on overlapping nights, or when demand for the room type exceeds its sellable units. The trigger accepts an explicit override flag written on the booking, so the confirmed owner/admin path still succeeds while every unguarded path fails loudly. A capacity check on the same trigger rejects lines whose guests exceed the room type's `max_occupancy`.

Existing overlaps are left untouched — the trigger only validates rows being written.

**5. Override plumbing**
Booking gains override columns (reason, actor, timestamp). The dialogs call the resolver first, and only offer the override to `owner` / `admin` / `fearless_leader` via the existing role helper. The reason is required and audit-logged.

## Notes

- The Rooms grid, Command Centre and the clash detector in `src/lib/roomClashes.ts` already surface oversold nights; they stay as the safety net for overlaps that arrive from the channel side, which cannot be refused at the door.
- Channel-imported reservations are never rejected by the trigger — they are recorded and flagged as an overbooking, since refusing them would desync the channel.
