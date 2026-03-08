

# Plan: Full Booking Lifecycle, Guest Profile Auto-Creation & Invoice System

## Problem Summary

1. **No check-in/check-out workflow** in calendar — bookings can't progress through their lifecycle
2. **No folio/billing UI** — folio APIs exist (`get_folio`, `add_folio_charge`, `process_folio_payment`) but no frontend
3. **No invoice generation** — can't print or email a final bill
4. **No guest profile auto-creation** — manual bookings and ROL'OS link bookings don't create `rolos_guest_profiles` records or link via `rolos_guest_id`
5. **No complaints/comments capture** on guest profile for future reference
6. **Status logic**: paid bookings should auto-set to `confirmed`, unpaid to `pending`

## Implementation

### 1. Auto-Create Guest Profile on Booking Creation

**Files**: `ManualBookingDialog.tsx`, `supabase/functions/roomsonline-pms-api/index.ts`

After inserting a booking in `ManualBookingDialog.tsx`:
- Upsert into `rolos_guest_profiles` matching on `(property_id, email)` — if exists, increment `total_stays` and `total_spent`, update `last_stay_date`; if new, insert
- Set `rolos_guest_id` on the booking record
- Same logic added to the edge function for bookings coming through ROL'OS integration links (in `push-booking` or the PMS API)

### 2. Booking Status Auto-Logic

**File**: `ManualBookingDialog.tsx`

- Remove manual status selector
- Auto-determine: if `payment_status === 'paid'` → `status: 'confirmed'`, else `status: 'pending'`

### 3. Expand BookingDetail into Full Lifecycle Manager

**File**: `PMSDashboard.tsx` — Replace current `BookingDetail` with a tabbed interface

**Tabs:**
- **Details** — Current view/edit form (guest info, dates, guests, room)
- **Folio & Billing** — Charges, payments, extras, balance
- **Invoice** — Generate, print, email PDF
- **Notes & Complaints** — Comments, complaints log tied to guest profile

**Lifecycle action buttons** in the header based on current status:
| Current Status | Available Actions |
|---|---|
| `pending` | Mark Paid → Confirm, Cancel, No Show |
| `confirmed` | Check In, Cancel, No Show |
| `checked_in` | Add Charge, Record Payment, Check Out |
| `checked_out` | (View only, print invoice) |

Each action calls the existing PMS API (`check_in`, `check_out`) or direct Supabase update.

### 4. Folio & Billing Tab

**File**: New component `src/components/pms/BookingFolioTab.tsx`

- On tab open, call `callPmsApi('get_folio', { booking_id })` — auto-creates if missing
- Display transactions list (charges + payments) with running balance
- **Add Charge** form: description, amount, type (room charge, minibar, extra, tax)
- **Record Payment** form: amount, method (cash/card/eft), reference
- Balance summary: total charges vs total payments

### 5. Invoice Generation & Delivery

**File**: New component `src/components/pms/BookingInvoice.tsx`

- Build a printable invoice layout using the booking + folio data:
  - Property header (name, address)
  - Guest details
  - Stay summary (dates, room, guests)
  - Itemized charges from folio transactions
  - Payments received
  - Balance due
- **Print**: `window.print()` with print-specific CSS
- **Email as PDF**: Use `html2pdf.js` (already installed) to generate blob, then call an edge function to email it via Resend

### 6. Notes & Complaints Tab

**File**: New component `src/components/pms/BookingNotesTab.tsx`

**Database**: Add `complaints` jsonb column to `rolos_guest_profiles` to store structured complaint/comment history

Migration:
```sql
ALTER TABLE public.rolos_guest_profiles 
  ADD COLUMN complaints jsonb DEFAULT '[]'::jsonb;
```

- Display existing notes from `booking.special_requests` and `booking.modification_notes`
- **Add Comment** form — appends to booking's special_requests or a new `booking_notes` field
- **Add Complaint** form — saves to `rolos_guest_profiles.complaints` array with timestamp, booking_id, description, resolution status
- Guest profile card link showing total complaints count

### 7. Guest History on Profile

**File**: `PMSGuests.tsx` — Expand guest cards to show:
- Click to open detail sheet
- List all bookings for this guest (query `bookings` where `rolos_guest_id = guest.id`)
- Each booking shows: dates, amount, status, complaints, comments
- Aggregate: total stays, total spent, average stay length

### 8. Edge Function Update for Guest Profile Sync

**File**: `supabase/functions/roomsonline-pms-api/index.ts`

Add a helper function `ensureGuestProfile(supabase, propertyId, guestName, guestEmail, guestPhone, bookingAmount)` that:
1. Checks for existing profile by `(property_id, email)`
2. If found: increments `total_stays`, adds to `total_spent`, updates `last_stay_date`
3. If not: creates new profile
4. Returns the `guest_id`

Wire this into `check_in` and `check_out` handlers to update stats.

## Files Modified

| File | Change |
|---|---|
| **DB Migration** | Add `complaints` jsonb to `rolos_guest_profiles` |
| `ManualBookingDialog.tsx` | Auto-create guest profile, link `rolos_guest_id`, auto-set status from payment |
| `PMSDashboard.tsx` | Tabbed BookingDetail with lifecycle buttons, integrate folio/invoice/notes tabs |
| `src/components/pms/BookingFolioTab.tsx` | **New** — Folio charges, payments, balance UI |
| `src/components/pms/BookingInvoice.tsx` | **New** — Printable/emailable invoice |
| `src/components/pms/BookingNotesTab.tsx` | **New** — Comments & complaints capture |
| `PMSGuests.tsx` | Expandable guest detail with booking history |
| `roomsonline-pms-api/index.ts` | `ensureGuestProfile` helper, wire into check-in/check-out |

