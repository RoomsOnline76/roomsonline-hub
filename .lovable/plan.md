

# Lock Rates & Remove Guest-Editable Pricing Controls from Checkout

## Problem

Once a guest selects a room type and dates, the rate is fixed. But the current checkout UI exposes controls that let guests change the rate — specifically:

1. **Rate Type selector** (`Booking.tsx` ~line 1937) — a dropdown that lets guests switch between rate types, changing the price
2. **Date re-selection on checkout** — the date picker remains editable after dates are set, allowing guests to change dates and trigger a rate recalculation
3. **InlineCheckoutPanel** — displays dates/guests read-only (already correct), but the "Your Stay" section doesn't explicitly show the per-night rate from the calendar

## Changes

### 1. Hide Rate Type Selector from Guest View (`Booking.tsx`)

The rate type selector (line 1937-1953) currently shows when `rateTypes.length > 1`. On the guest-facing booking page, hide this entirely — the rate type is determined by the room type and should not be guest-selectable. Keep the logic that sets `selectedRateType` internally (it's still used for cost calculation).

### 2. Make Dates Read-Only After Selection (`Booking.tsx`)

Once `checkIn` and `checkOut` are both set, the date picker button should display the dates as a **read-only summary** (no click to re-open). The initial date picker (shown when dates are missing) remains — that's the entry point. But once dates are confirmed, they're locked for this booking session.

Remove the `onClick={() => setDatePickerOpen(true)}` from the date display button when dates are already present. The availability error recovery flow (`handleDateReselection`) can remain as a system-initiated exception.

### 3. Show Confirmed Rate in Stay Summary (`InlineCheckoutPanel.tsx`)

The Step 1 "Your Stay" cards already show the total — also show the per-night rate as a read-only line item so the guest sees exactly what was quoted in the calendar. This is already partially done in Step 3 Payment section (line ~290 shows `nights × rate`). No additional changes needed there.

## Files

| Action | File | What |
|--------|------|------|
| Modify | `src/pages/Booking.tsx` ~line 1937-1953 | Hide rate type selector from guest view |
| Modify | `src/pages/Booking.tsx` ~line 1899-1933 | Make dates read-only after both are selected (show summary, no re-open) |

