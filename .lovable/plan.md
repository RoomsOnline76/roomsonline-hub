## What's wrong (verified)

**1. Booking lands in UNASSIGNED**
The Carike Test booking (`de1a10c1…`, Fonteinhutte, 20–22 Aug 2026, confirmed/paid) carries `room_type_id = c2184bdd…`, which exists in **`hostfully_room_types`** (name "GALJOEN"), not in `rolos_room_types`. The dashboard's auto-assign helper only indexes `rolos_room_types`, so it can't map the type by id or by name, and the booking falls into the UNASSIGNED lane. There is also no `rolos_booking_rooms` row for it (that table is empty), so nothing downstream — folio, housekeeping, check-in — knows which chalet it is.

**2. Email content**
- `send-booking-email` always renders the "Action Required … this property is not connected to a PMS" block in the owner/property notification, even for ROLOS-PMS or PMS-connected properties.
- Both the owner notification and the branded guest email hard-code the "Powered by RoomsOnline · Rooms Done Right" footer, so white-label properties (Fonteinhutte has `brand_override_enabled = true`, `#1B7FAD`, own logo) still show RoomsOnline at the bottom.

## Plan

### A. Room resolution (assignment)
1. Extend `src/lib/bookingAssignment.ts` to accept an extra "alias" name source and to match rooms by **room type name → room_number / room_name** (case-insensitive), so a booking whose `room_type_id` comes from any catalogue (Hostfully, legacy, ROLOS duplicates) resolves to the correct `rolos_rooms` unit.
2. In `PMSDashboard.tsx`, `PMSRooms.tsx`, `PMSHousekeeping.tsx`: also fetch `hostfully_room_types (id, name, property_id)` for the visible properties and pass them into `autoAssignBookings` as alias types.
3. Persist the resolution instead of leaving it presentation-only: when a booking resolves to exactly one free unit, upsert a `rolos_booking_rooms` row (booking_id, room_id) so folio, housekeeping and check-in all agree. A migration will add the needed insert/update RLS policy + grants if not already present.
4. Add a manual **"Assign room"** control in the booking sheet (and a right-click/dropdown on the UNASSIGNED chip) listing free units for those dates, for cases the matcher can't resolve.

### B. UNASSIGNED lane usability
5. Render the unassigned chips with the same content as assigned ones (guest name, nights, status colour, special-request dot) and the same click / double-click behaviour (open details / open folio), so the booking can be opened, checked in and have billables added even before a unit is assigned.

### C. Emails (`supabase/functions/send-booking-email/index.ts`)
6. Only render the "Action Required — not connected to a PMS" block when the property genuinely has no PMS: skip it when the property is on ROLOS PMS or has a connected external system (`external_system` other than manual/none, or an active `pms_credentials` / `owner_pms_credentials` link). For ROLOS/connected properties, replace it with a short "This booking is already in your ROLOS dashboard" line plus the dashboard link.
7. Make the footer branding-aware, reusing the existing `resolveBranding()` result:
   - **Branded / white-label** → property name, property logo, property contact details (via `_shared/email-footer.ts`); no RoomsOnline mention.
   - **Canonical ROL** → keep the existing "Powered by RoomsOnline · Rooms Done Right" line.
   Apply to the guest email, the owner notification and the admin alert.
8. Redeploy `send-booking-email`.

### D. Backfill
9. One-off assignment of the existing Carike Test booking to the GALJOEN unit (`69a7996c…`) so the dashboard shows it correctly straight away.

## Technical notes
- Matching key: normalise names (trim + lowercase) and scope by `property_id`; prefer exact `room_type_id` match, then type-name → `rolos_rooms.room_type_id` name, then type-name → `rolos_rooms.room_number` / `room_name`.
- Conflict check keeps the existing start-inclusive / end-exclusive overlap logic, so a unit is never double-assigned.
- No changes to adapter-locked PMS files; all work is in dashboard UI, the assignment helper, and the booking email function.
