# Unified stay-date picker for ROLOS bookings

Replace the mixed date inputs in ROLOS booking create/edit with one shared "snake" range calendar that shows check-in and check-out as diagonal half-day cells, matching the reference screenshot, and reuse it everywhere a stay range is chosen.

## What the user sees

- One calendar behaves the same everywhere: click check-in, click check-out, the nights between are filled, and the first/last cell is split diagonally so a departure day reads as half-occupied (the way it looks on a room plan).
- Trigger reads `21 Aug 2026 → 26 Aug 2026 · 5 nights` and opens a popover calendar; keyboard entry stays possible.
- Nights count, minimum-stay hints and disabled past dates are shown inside the picker, not as separate helper text.
- Native browser date boxes (the grey `2026/08/21` fields in the booking edit panel) disappear in favour of the same control.

## Where it gets applied

Primary (stay ranges):
- Manual booking create dialog (`ManualBookingDialog`)
- Booking edit — Details grid arrival/departure (`booking/BookingDetailsGrid`)
- Booking modify dialog (`BookingModifyDialog`)
- Journey stay-date editor (`journey/EditStayDatesDialog`)

Secondary (same visual language, unchanged behaviour):
- Guest-facing search / availability pickers (`SearchForm`, `RoomAvailabilityCalendar`, `FloatingDateGuestPicker`) adopt the shared half-day classes so front and back office match.
- Reporting ranges (`Dashboard`, `ROLRevenuePulse`) keep plain range mode but pick up the shared styling.

Out of scope: single-date pickers (bulk restriction dialogs, invoices, contributions) keep the current shadcn Calendar; only the shared token styling is inherited.

## Technical notes

- New `src/components/ui/stay-range-picker.tsx`: wraps shadcn `Calendar` in `mode="range"` inside a Popover, props `{ value: DateRange, onChange, minDate, maxDate, disabledDays, minNights, label }`, emits `yyyy-MM-dd` strings via a small helper so existing form state (`check_in_date` / `check_out_date`) is unchanged.
- Half-day rendering: add `.rol-day-range-start` / `.rol-day-range-end` classes in `index.css` using a `linear-gradient(135deg, ...)` built from semantic tokens (`--primary`, `--muted`) — no hardcoded colours. Wire them through `classNames.day_range_start/end/middle`; keep `pointer-events-auto` for popover use.
- Reuse existing helpers (`differenceInCalendarDays` for nights); no changes to booking mutations, rate resolution, PMS adapters, or edge functions.
- Keep `.rolos-mobile` density rules working: compact cell size variant (`size="compact"`) for PMS dialogs.
