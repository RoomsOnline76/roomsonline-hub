# Manual booking capture, NightsBridge style

Rework manual booking capture in ROL'OS so one booking can hold several rooms, each with its own rate plan and occupancy, and replace the read-only booking side sheet with an editable Booking Details card.

## 1. Add Booking dialog

Two-panel layout matching the reference:

- **Left panel** — stay and guest: arrival date, departure date, read-only nights counter, then First Name, Surname, Company, Phone No, Email.
- **Right panel** — room lines: a "Select Room / Unit" picker at the top that appends a line. Each line shows the room label, a remove button, a Rate Plan select, and occupancy boxes (Adults, Child 0–2, Child 3–12, plus Teens and Pets kept from our current model).
- **Footer** — running total (auto-priced per line from the existing season-aware rate resolver, each line overridable), Cancel and Add Booking.

Rules:
- Only rooms free for the selected dates appear in the picker; already-added rooms drop out of the list.
- Changing dates re-prices every line and re-checks availability.
- Portfolio property selector and the Room Plan prefill (drag-to-create) keep working; a prefill seeds the first room line.
- Guest name is stored as one field (First + Surname joined) so existing screens keep working.

## 2. Booking Details card

Replaces `BookingQuickViewSheet` everywhere it is used (dashboard, room plan, rooms page, bookings list) with a three-column dialog:

- **Guest Details** — arrival, departure, nights, room selector (Room x of y) with per-room rate plan, occupancy, guest and 2nd guest, Checked In / Checked Out toggles, and actions: Add room, Change room, Split, Cancel room. Links through to Extras and Guest Communication.
- **Booking Notes** — status select (including the new *Waiting for deposit*), Booking Made By, Reference, commission percentage (read-only, from the existing commission resolver), and internal Notes.
- **Account** — Accommodation / Extras / Payments / Outstanding totals, editable Deposit amount, Entered-on and source type, plus View Account, View Rates, Check Out and payment-history links wired to the existing folio views.

Everything editable saves back through the existing booking update path, so commission recalculation and metrics stay in sync. Cancelling still writes a cancellation reason category.

## 3. Data model additions

New columns on `bookings`: guest first/last name, company, second guest name and contact, booking made by, internal notes, deposit amount and deposit due date. `waiting_for_deposit` becomes a valid booking status treated as unconfirmed (excluded from revenue counters, like pending).

`rolos_booking_rooms` gains rate plan, room type, teens, infants, pets, per-room nightly rate and per-room second-guest fields, so each line is a real record rather than an entry in an array. The existing `rolos_room_ids` array keeps being written for the room plan and channel pushes.

## Technical notes

- Migration adds the columns above with sensible defaults, keeps existing rows valid, and preserves the current grants and policies on both tables.
- `ManualBookingDialog.tsx` moves to a reducer-driven line model (`src/components/pms/booking/`), with pure pricing and availability helpers extracted for reuse.
- New `BookingDetailsCard.tsx` replaces `BookingQuickViewSheet`; the folio tab is reused inside it.
- Revenue status sets in `src/lib/revenueStatuses.ts` are extended for the new status; `send-booking-email` gains company / 2nd guest / notes placeholders.
- Confirmation email and guest-profile upsert behaviour stay as they are today.
