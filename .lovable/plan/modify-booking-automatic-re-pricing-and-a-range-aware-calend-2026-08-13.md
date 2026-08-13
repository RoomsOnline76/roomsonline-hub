# Modify booking: automatic re-pricing and a range-aware calendar

## Problems

1. Extending or shortening the stay leaves the Total untouched, so the settlement box shows nothing outstanding. The operator has to know and retype the new amount, and for channel bookings the server keeps whatever total was submitted.
2. The date fields use the browser's native date picker. It opens on a single month with no indication of the stay the booking currently covers, so it is easy to lose track of the original 13–25 Aug range while editing.

## What changes

### 1. The total re-prices itself when the stay or guest count changes

- When check-in, check-out, adults or children change, the dialog fetches live nightly rates for the booking's room type over the new range and proposes a new total.
- The proposed total drops into the Total field automatically and is labelled clearly, e.g. "Re-priced for 15 nights — live rates". The operator can still type over it; once they do, the manual figure is respected and a small "Reset to re-priced" link appears.
- If live rates are unavailable (no channel/rate-plan response), fall back to the booking's own average nightly value (original total ÷ original nights) × new nights, labelled "Estimated from the current nightly average" so it is obvious the number is derived, not quoted.
- Because the Total now moves, the existing settlement box immediately shows the correct Outstanding (longer stay) or Guest overpaid (shorter stay), with the refund / balance-request toggles already wired.

### 2. The date picker shows the original stay

- Replace the two native date inputs with a single stay-range picker: one popover, two-month calendar, click check-in then check-out.
- The booking's original range is shaded and labelled in a legend ("Original stay"), and the selected new range is highlighted in the brand colour.
- Above the calendar: "Originally 13 – 25 Aug 2026 · 12 nights". Below the field: the new range and night count, plus a delta chip ("+3 nights" / "−2 nights") when it differs.
- Same-day guard stays: check-out must be after check-in, and Save stays disabled otherwise.

Result: extending a stay immediately shows the new total and the amount the guest still owes, and the calendar makes it obvious what the booking currently covers versus what you are changing it to.

## Technical notes

- `src/components/pms/BookingModifyDialog.tsx`
  - Accept `property_id` and `room_type_id` on the `booking` prop (both already available at the call site in `src/pages/pms/PMSDashboard.tsx`; pass them through).
  - Re-price with `fetchLiveRates(property_id, null, checkIn, checkOut)` from `src/lib/pmsLiveAvailability.ts`, summing `ratesByDate` for the booking's room type across the new nights (fall back to that room's `minRate` × nights, then to the pro-rata average). Debounce ~300 ms and guard against out-of-order responses.
  - Track `totalTouchedManually` so an operator edit wins over subsequent auto-quotes; expose a reset action.
  - Always send `total_price` in `modifications` when the re-priced value differs from the stored total, so the server and the channel push receive the corrected figure.
  - Swap the two `Input type="date"` controls for `Popover` + `Calendar` in `mode="range"` (`numberOfMonths={2}`) using the existing shadcn primitives, with a `modifiers`/`modifiersClassNames` entry for the original range using semantic tokens (no hardcoded colours).
- No database or edge-function changes: `modify-booking` already honours an explicit `total_price` and recalculates for native properties when one is not supplied.
