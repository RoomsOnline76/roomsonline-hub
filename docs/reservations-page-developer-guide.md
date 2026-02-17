# Reservations Page — Developer Guide

> **File:** `src/pages/Bookings.tsx` (admin/owner dashboard)
> **Route:** `/bookings`
> **Last updated:** 2026-02-17

---

## 1. Purpose

The Reservations page is the **unified booking management dashboard** for RoomsOnline. It aggregates reservations from two distinct sources into a single, filterable table:

| Source | Database Table | Origin |
|--------|---------------|--------|
| **Internal** (ROL-native) | `bookings` | Guest books via RoomsOnline website |
| **PMS** (external) | `pms_reservations` | Synced from connected PMS (Benson, Hostfully, etc.) |

This dual-source model means every reservation in the system — regardless of where it was created — appears in one place.

---

## 2. Access Control

| Role | Scope |
|------|-------|
| `dev`, `admin`, `fearless_leader` | All properties, all bookings |
| `user` (property owner) | Only bookings for properties where `owner_email` matches their profile |

The hook `useAuth()` provides `isAdmin`, `isDev`, and `isFearlessLeader` flags. Owner filtering is applied at the Supabase query level using `properties.owner_email`.

---

## 3. Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Bookings.tsx                              │
│                                                             │
│  1. Load properties (filtered by role)                      │
│  2. Parallel fetch:                                         │
│     ├── supabase.from("bookings").select("*")               │
│     └── supabase.from("pms_reservations").select("*")       │
│  3. Transform PMS reservations → unified Booking interface  │
│  4. Deduplicate by external_reservation_id                  │
│  5. Deduplicate itinerary bookings (same itinerary+property)│
│  6. Sort by created_at DESC                                 │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Deduplication Rules

- **PMS-first:** If a booking exists in both `bookings` and `pms_reservations` (matched by `external_reservation_id`), the PMS version is shown.
- **Itinerary dedup:** For journey bookings (`booking_channel = 'rol_itinerary'`), only one booking per `itinerary_id + property_id` pair is shown.

---

## 4. Booking Interface (unified shape)

```typescript
interface Booking {
  id: string;
  property_id: string;
  property_name?: string;
  check_in_date: string;
  check_out_date: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  adults: number;
  teens: number | null;
  children: number | null;
  infants: number | null;
  total_price: number;
  status: string;
  room_type_id: string | null;
  rate_type_id: string | null;
  rate_type_name?: string;
  rooms: any;               // Array of room objects with guest counts
  charges?: any[];           // Additional charges breakdown
  special_requests: string | null;
  voucher: string | null;
  external_reservation_id: string | null;
  created_at: string | null;
  source: "internal" | "pms";
  ai_metadata?: any;         // Contains itinerary_id for journey bookings
  booking_channel?: string;   // 'rol_itinerary', 'rol_direct', etc.
}
```

### 4.1 PMS → Booking Mapping

| PMS field (`pms_reservations`) | Booking field |
|-------------------------------|---------------|
| `arrival_date` | `check_in_date` |
| `departure_date` | `check_out_date` |
| `contact_name` | `guest_name` |
| `contact_email` | `guest_email` |
| `contact_phone` | `guest_phone` |
| `total_amount` | `total_price` |
| `reservation_voucher` | `voucher` |
| `rooms[].numberOfAdults` | Summed into `adults` |
| `rate_type_name` | `rate_type_name` |

---

## 5. UI Components

### 5.1 Stats Cards (top row)

Five KPI cards calculated from all bookings (excluding cancelled from revenue):

| Card | Metric |
|------|--------|
| Total | Count of all bookings in date range |
| Confirmed | Status in `['confirmed', 'guaranteed', 'checked-in']` |
| Pending | Status in `['pending', 'provisional']` |
| Cancelled | Status = `'cancelled'` |
| Revenue | Sum of `total_price` for non-cancelled bookings |

### 5.2 Filters

| Filter | Type | Notes |
|--------|------|-------|
| Property | Select dropdown | All properties for admins; owner-scoped for owners |
| Date range | Date inputs | Defaults to -30 days → +60 days |
| Status | Select | All / Pending / Confirmed / Cancelled |
| Search | Text input | Searches: guest name, email, property, ref, dates, rate, price |
| Show cancelled | Toggle switch | Hidden by default |

### 5.3 Reservations Table

Columns: Property, Guest, Check-in, Check-out, Pax, Rate, Total, Status, Booked, Ref.

**Expandable rows** — clicking a row reveals:
- **Booking Lifecycle Visualizer** (`BookingLifecycleVisualizer`) — visual state machine showing: `pending → confirmed → checked_in → completed` (or `cancelled`)
- **Room breakdown** — individual room details with per-room guest counts
- **Per-room cancellation** — ability to cancel individual rooms without cancelling the entire reservation
- **Guest contact** — email and phone
- **Additional charges** — itemised charge breakdown if present

### 5.4 Benson Sync Button

When a Benson-connected property is selected, a "Sync Benson" button appears that invokes:
```typescript
supabase.functions.invoke("benson-api", {
  body: { action: "get_reservations", property_id, start_date, end_date, statuses: [...] }
});
```

---

## 6. Cancellation Logic

### 6.1 Entire Reservation

```
if source === "pms":
  UPDATE pms_reservations SET status = 'CANCELLED' WHERE external_reservation_id = ?
else:
  UPDATE bookings SET status = 'cancelled' WHERE id = ?
```

### 6.2 Individual Room

```
1. Clone rooms array
2. Mark rooms[index].status = 'CANCELLED'
3. If ALL rooms cancelled → set reservation status to cancelled
4. UPDATE the relevant table with new rooms array
```

### 6.3 RLS Considerations

Cancellation requires UPDATE permission on `bookings` / `pms_reservations`. RLS policies grant this to:
- `admin`, `dev`, `fearless_leader` roles
- Property owners (via `EXISTS` check on `properties.owner_email`)

---

## 7. Related Pages & Components

| File | Purpose |
|------|---------|
| `src/pages/Booking.tsx` | **Public booking form** — guest-facing checkout page |
| `src/pages/BookingConfirmation.tsx` | Post-payment confirmation screen |
| `src/pages/StagingBook.tsx` | Room selection / availability check before checkout |
| `src/components/BookingLifecycleVisualizer.tsx` | Visual state machine for booking status |
| `src/components/booking/PayFastOnsiteModal.tsx` | PayFast inline payment modal |
| `src/components/booking/PayGateRedirect.tsx` | PayGate redirect payment flow |
| `src/hooks/useActivePaymentGateway.tsx` | Resolves active payment gateway from `supporting_systems` |

---

## 8. Payment Integration

The booking page (`Booking.tsx`) supports two payment gateways, resolved at runtime:

| Gateway | Flow | Component | Edge Function |
|---------|------|-----------|---------------|
| **PayFast** | Onsite modal (iframe) | `PayFastOnsiteModal` | `payfast-api` |
| **PayGate** (PayWeb3) | Server-initiated redirect | `PayGateRedirect` | `paygate-api` |

**Gateway resolution:** The `useActivePaymentGateway()` hook queries `supporting_systems` where `category = 'payment'` and `is_active = true`. Only one payment gateway can be active at a time (enforced by a database trigger `enforce_single_active_payment_gateway`).

### Payment Flow

```
Guest fills form → "Pay Now" → 
  if PayGate active:
    POST to paygate-api (initiate.trans) → redirect to PayGate hosted page → 
    PayGate NOTIFY_URL callback → update booking status
  if PayFast active:
    Open PayFast modal (iframe) → onComplete callback → update booking status
```

---

## 9. Database Tables

### `bookings` (internal reservations)

Key columns: `id`, `property_id`, `guest_name`, `guest_email`, `guest_phone`, `check_in_date`, `check_out_date`, `adults`, `children`, `total_price`, `status`, `rooms` (JSONB), `external_reservation_id`, `payment_status`, `booking_channel`, `ai_metadata` (JSONB).

Guest PII is encrypted at rest via `encrypt_booking_guest_data()` trigger.

### `pms_reservations` (PMS-synced reservations)

Key columns: `id`, `property_id`, `external_reservation_id`, `arrival_date`, `departure_date`, `contact_name`, `contact_email`, `total_amount`, `status`, `rooms` (JSONB), `rate_type_name`, `charges` (JSONB).

### `booking_sync_status` (PMS sync tracking)

Tracks sync state per booking: `sync_status`, `sync_attempts`, `error_message`, `external_booking_id`.

---

## 10. Edge Functions (Booking-Related)

| Function | Purpose |
|----------|---------|
| `push-booking` | Push confirmed booking to connected PMS |
| `multi-push-booking` | Push multi-room bookings across PMS systems |
| `benson-api` | Benson PMS adapter (get/push reservations) |
| `hostfully-api` | Hostfully PMS adapter |
| `payfast-api` | PayFast payment processing |
| `paygate-api` | PayGate PayWeb3 payment processing |
| `send-booking-email` | Transactional booking confirmation email |
| `calculate-commission` | Commission calculation on confirmed bookings |
| `parse-special-requests` | AI parsing of guest special requests |

---

## 11. Feature Flags

| Flag | Effect |
|------|--------|
| `AI_CONCIERGE_ENABLED` | Enables AI concierge panel on booking page |
| `VOICE_INPUT_ENABLED` | Enables voice input for special requests |

---

## 12. Extension Points (for new features)

When quoting additional features for the Reservations page, consider:

1. **New filters** — Add to the filter bar in the `<Card className="mb-3">` section. Each filter updates state that feeds into the Supabase query.

2. **New booking sources** — Follow the pattern: add a new parallel query in `loadBookings()`, transform to the `Booking` interface, add deduplication logic.

3. **New columns** — Add to both `<TableHeader>` and `<TableRow>`. Ensure the field is included in the `Booking` interface and mapped from both sources.

4. **Bulk actions** — The table supports row selection patterns. Add a selection state and action bar above the table.

5. **Export** — Bookings can be exported by reading `filteredBookings` and converting to CSV/Excel.

6. **Real-time updates** — Enable Supabase Realtime on `bookings` and/or `pms_reservations` tables for live updates without polling.

7. **New payment gateway** — Create a new edge function following the `paygate-api` pattern, add a component following `PayGateRedirect`, and register the system in `supporting_systems`.

8. **Modify/Cancel via PMS** — The PMS tracker now tracks `has_modify` and `has_cancel` capabilities per PMS. When both are true for a property's PMS, the UI can enable "Modify in PMS" and "Cancel in PMS" buttons that call the respective PMS edge function.

---

## 13. File Size & Complexity

| File | Lines | Complexity |
|------|-------|------------|
| `Bookings.tsx` | ~979 | Medium — single component with filters, table, and expanded row details |
| `Booking.tsx` | ~2036 | High — full checkout flow with room selection, cost calculation, payment integration |

`Booking.tsx` is a candidate for refactoring into smaller components (form, cost calculator, payment section).

---

## 14. Testing Considerations

- **Dual-source data:** Always test with both internal and PMS bookings present
- **Deduplication:** Verify bookings with matching `external_reservation_id` don't appear twice
- **Role scoping:** Test as owner vs admin to verify property filtering
- **Cancellation:** Test both full-reservation and per-room cancellation for both internal and PMS bookings
- **Payment gateways:** Test with each gateway active (toggle in `supporting_systems`)
- **Date edge cases:** Bookings spanning month boundaries, same-day check-in/check-out
