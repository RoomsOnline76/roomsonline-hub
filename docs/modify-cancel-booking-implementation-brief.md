# Modify & Cancel Booking — Developer Reference

> **Version:** 2.0 (Current State)  
> **Last Updated:** March 2026  
> **Status:** ✅ Fully Implemented  
> **Audience:** Developers  

---

## Overview

Modify and cancel functionality is fully implemented for all booking types. The system supports both ROL-native properties (`external_system: 'none'` or `is_rol_property: true`) and PMS-managed properties, with capability-gated actions per PMS.

---

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────────────┐     ┌─────────────────┐
│   Admin Bookings    │────▶│     Edge Functions Layer          │────▶│   PMS Adapters   │
│  (Bookings.tsx)     │     │  modify-booking / cancel-booking  │     │  (per external   │
│                     │     │                                    │     │   system type)   │
│  ModifyBookingModal │     └──────────────────────────────────┘     └─────────────────┘
│  CancelBookingModal │                    │                                  │
└─────────────────────┘                    ▼                                  ▼
                            ┌──────────────────────────────────┐     ┌─────────────────┐
                            │      Database Updates             │     │  External PMS    │
                            │  bookings / booking_sync_status   │     │  APIs            │
                            │  property_availability            │     └─────────────────┘
                            │  pms_reservations / sync_logs     │
                            └──────────────────────────────────┘
                                           │
                                           ▼
                            ┌──────────────────────────────────┐
                            │   send-booking-email              │
                            │   (modification/cancellation)     │
                            └──────────────────────────────────┘
```

---

## Database Schema

All columns below exist on the `bookings` table:

| Column | Type | Purpose |
|--------|------|---------|
| `modification_notes` | `JSONB` | Append-only array of modification history entries |
| `cancellation_reason` | `TEXT` | Reason provided when booking is cancelled |
| `last_modified_at` | `TIMESTAMPTZ` | Timestamp of most recent modification |
| `modified_by` | `UUID` | User who last modified the booking |

The `booking_sync_status` table tracks PMS sync state:

| Column | Type | Purpose |
|--------|------|---------|
| `last_action` | `TEXT` | `'create'`, `'modify'`, or `'cancel'` |
| `last_action_at` | `TIMESTAMPTZ` | When the action was synced |
| `modification_attempts` | `INTEGER` | Counter for modification retries |
| `last_error_message` | `TEXT` | Most recent error from PMS sync |

A trigger `log_booking_modification` automatically appends entries to `modification_notes` when status or dates change.

---

## PMS Capability Check

Capabilities are **not** stored on `pms_credentials`. Instead, the edge functions check `pms_tracker_status`:

```typescript
// modify-booking checks:
const { data: tracker } = await supabase
  .from("pms_tracker_status")
  .select("has_modify")
  .eq("system_type", externalSystem)
  .maybeSingle();

// cancel-booking checks:
const { data: tracker } = await supabase
  .from("pms_tracker_status")
  .select("has_cancel")
  .eq("system_type", externalSystem)
  .maybeSingle();
```

### Current Capabilities

| PMS | Modify | Cancel | Notes |
|-----|--------|--------|-------|
| ROL-native (`none` / `roomsonline`) | ✅ | ✅ | Handled locally — no PMS API call |
| Benson | Depends on `has_modify` | Depends on `has_cancel` | UI shows warning: "contact property to cancel in Benson" |
| Hostfully | Depends on tracker | Depends on tracker | Routes via `hostfully-api` |
| HotelBeds | Depends on tracker | Depends on tracker | Routes via `hotelbeds-api` |
| NightsBridge | ❌ | ❌ | External iframe — no API control |

---

## Edge Function: `modify-booking`

**File:** `supabase/functions/modify-booking/index.ts` (504 lines)

### Input

```typescript
interface ModifyRequest {
  booking_id: string;
  modifications: {
    check_in_date?: string;
    check_out_date?: string;
    adults?: number;
    children?: number;
    teens?: number;
    infants?: number;
    rooms?: any[];
    special_requests?: string;
    note?: string;
  };
}
```

### Flow

```
S1: Auth validation (JWT via getClaims)
S2: Fetch booking with property info (external_system, is_rol_property)
S3: Reject if booking.status === 'cancelled'
S4: Check PMS capabilities via pms_tracker_status.has_modify
S5: For PMS-managed properties with date changes:
    → Verify live availability via {external_system}-api (fetch_availability)
S6: For PMS-managed properties with external_reservation_id:
    → Call {external_system}-api (modify_reservation)
    → On failure: upsert booking_sync_status with error, return 500
S7: For ROL-native properties with pax/date changes:
    → Recalculate total_price via rolos_rate_plans pricing model
    → Supports: per_person, per_room/per_unit, per_night
S8: Update property_availability blockout:
    → Release old dates not in new range
    → Block new dates not in old range
S9: Update bookings table (dates, guests, rooms, special_requests, total_price)
S10: Upsert booking_sync_status (last_action: 'modify')
S11: Send modification email via send-booking-email
```

### ROL-Native Price Recalculation

The function fetches `rolos_rate_plans` and `rolos_rate_prices` (with season-specific rates) to recalculate:

| Pricing Model | Calculation |
|---------------|-------------|
| `per_person` | `(adults + teens) × rate × nights + children × childRate × nights` |
| `per_room` / `per_unit` | `rate × nights × roomCount` |
| `per_night` | `rate × nights` |
| Default fallback | `rate × adults × nights` |

### Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `AUTH_FAILED` | 401 | Missing/invalid authorization |
| `NOT_FOUND` | 404 | Booking doesn't exist |
| `BOOKING_CANCELLED` | 400 | Can't modify a cancelled booking |
| `MODIFICATION_NOT_SUPPORTED` | 400 | PMS doesn't support modifications |
| `AVAILABILITY_CHANGED` | 409 | New dates unavailable |
| `PMS_ERROR` | 500 | PMS adapter returned failure |
| `PMS_UNAVAILABLE` | 503 | PMS adapter unreachable |
| `PARTIAL_SUCCESS` | 207 | PMS updated but local DB failed |

---

## Edge Function: `cancel-booking`

**File:** `supabase/functions/cancel-booking/index.ts` (309 lines)

### Input

```typescript
interface CancelRequest {
  booking_id: string;
  reason: string;
  cancel_rooms?: number[];  // Optional: specific room indices for partial cancel
}
```

### Flow

```
S1: Auth validation (JWT via getClaims)
S2: Fetch booking with property info
S3: Reject if already cancelled
S4: Check PMS capabilities via pms_tracker_status.has_cancel
S5: For PMS-managed properties:
    → Call {external_system}-api (cancel_reservation)
    → On failure: upsert booking_sync_status, return error
S6: Update bookings table:
    → Full cancel: status = 'cancelled', cancellation_reason = reason
    → Partial cancel: mark specific rooms as CANCELLED in rooms JSONB
    → If all rooms cancelled → full cancel
S7: For ROL-native properties:
    → Restore availability (set is_stop_sell = false, available_units = 1)
S8: Update pms_reservations if external_reservation_id exists
S9: Upsert booking_sync_status (last_action: 'cancel')
S10: Send cancellation email via send-booking-email
```

### Partial Cancellation

Supports cancelling individual rooms by index. The `cancel_rooms` array specifies which room indices (0-based) to mark as `CANCELLED` in the `bookings.rooms` JSONB array. If all rooms end up cancelled, the entire booking is set to `status: 'cancelled'`.

---

## Frontend Components

### ModifyBookingModal

**File:** `src/components/booking/ModifyBookingModal.tsx`

Features:
- Date inputs with min constraints (no past dates)
- Night count indicator
- **Live availability checking** with visual feedback (loading spinner, ✓/✗ badges) when dates change — debounced 500ms
- Guest count steppers (Adults, Teens 13–17, Children 2–12, Infants <2) via `GuestCountStepper` component
- **Dynamic price preview** for ROL-native bookings:
  - Fetches `rolos_rate_plans` pricing model and base rate
  - Calculates estimated new total client-side
  - Shows current vs. new price comparison with difference
- Special requests text area
- Internal modification note
- Submit disabled when no changes or availability loading

### CancelBookingModal

**File:** `src/components/booking/CancelBookingModal.tsx`

Features:
- Destructive warning banner ("cannot be undone")
- **Benson-specific warning**: "contact property to cancel in Benson" when `externalSystem === "benson"`
- Required cancellation reason (min 3 chars)
- Confirmation checkbox
- Submit disabled until reason + confirmation provided

### Bookings.tsx Integration

Both modals are used in `src/pages/Bookings.tsx`:

```typescript
// Modify via edge function
const handleModifyBooking = async (modifications) => {
  const { data, error } = await supabase.functions.invoke("modify-booking", {
    body: { booking_id: booking.id, modifications },
  });
  // Updates local state optimistically, shows price change in toast
};

// Cancel via edge function
const handleCancelViaEdge = async (reason) => {
  const { data, error } = await supabase.functions.invoke("cancel-booking", {
    body: { booking_id: booking.id, reason },
  });
  // Updates local state to cancelled
};
```

**Additionally**, `Bookings.tsx` retains legacy inline cancel functions for direct DB operations:
- `handleCancelReservation()` — cancels entire booking directly in `bookings` / `pms_reservations`
- `handleCancelRoom()` — cancels individual room directly, updates rooms JSONB

---

## Email Notifications

Both edge functions trigger `send-booking-email` with:

| Action | Type Parameter | Content |
|--------|---------------|---------|
| Modify | `modification_confirmation` | Old vs. new dates/guests/price |
| Cancel | `cancellation_confirmation` | Reason, partial flag, cancelled room indices |

Note: `send-booking-email` currently handles `success`, `failed`, `admin_alert`, and `property_notification` statuses. The `modification_confirmation` and `cancellation_confirmation` types are sent but may fall through to the default `success` template depending on implementation.

---

## Availability Blockout Management

When dates are modified on a ROL-native booking, `modify-booking` manages the `property_availability` table:

```
Old dates: [Mar 5, 6, 7, 8]
New dates: [Mar 7, 8, 9, 10]

→ Release: Mar 5, 6 (set available_units = 1, is_stop_sell = false)
→ Block:   Mar 9, 10 (upsert available_units = 0, is_stop_sell = true)
→ Keep:    Mar 7, 8 (no change)
```

For cancellations on ROL-native properties, all booked dates are released.

---

## File Reference

### Frontend

| File | Purpose |
|------|---------|
| `src/pages/Bookings.tsx` | Admin bookings list with modify/cancel actions |
| `src/components/booking/ModifyBookingModal.tsx` | Modify dialog with availability + price preview |
| `src/components/booking/CancelBookingModal.tsx` | Cancel dialog with reason + confirmation |
| `src/components/booking/GuestCountStepper.tsx` | Reusable guest count ±1 stepper |

### Edge Functions

| File | Purpose |
|------|---------|
| `supabase/functions/modify-booking/index.ts` | Orchestrate modification across PMS + local DB |
| `supabase/functions/cancel-booking/index.ts` | Orchestrate cancellation across PMS + local DB |
| `supabase/functions/send-booking-email/index.ts` | Email delivery (all statuses) |

### Database Tables

| Table | Role |
|-------|------|
| `bookings` | Core booking record (status, dates, guests, price, modification_notes) |
| `booking_sync_status` | PMS sync tracking (last_action, error_message) |
| `property_availability` | Calendar blockout for ROL-native properties |
| `pms_reservations` | Mirror of PMS reservation data |
| `pms_tracker_status` | PMS capability flags (`has_modify`, `has_cancel`) |
| `rolos_rate_plans` | Rate plan definitions (pricing_model, base_rate) |
| `rolos_rate_prices` | Season-specific pricing for recalculation |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial implementation brief (planning document) |
| 2.0 | Mar 2026 | Rewritten as current-state reference. All features implemented. Updated to reflect actual architecture: `pms_tracker_status` capability checks, ROL'OS price recalculation, availability blockout management, live availability checking in ModifyBookingModal, partial room cancellation support. Removed planned-but-not-built items (Cypress tests, rate limiting, pms-adapter-registry.json, booking-flow-state-machine.json). |
