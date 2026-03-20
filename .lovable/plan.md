

# Fix API Documentation: Align UI Reference with Actual Implementation

## Problem

The downloadable DOCX is **mostly correct** — it matches the actual Zod schemas in the edge function. However, the **interactive UI documentation** (`rolos-api-actions.ts`) has incorrect parameter names and simplified schemas that don't match the real API.

### Discrepancies Found (UI is wrong, DOCX is right)

| Field | DOCX (Correct) | UI Code (Wrong) |
|-------|----------------|------------------|
| Property identifier | `propertyId` | `property_id` |
| `create_reservation` dates | `arrival_date` / `departure_date` | `check_in_date` / `check_out_date` |
| `create_reservation` guest | `guest: { name, email, phone }` | flat `guest_name`, `guest_email`, `guest_phone` |
| `create_reservation` rooms | `rooms: [{ room_type_id, adults, teens, children, infants }]` | not present |
| `fetch_availability` dates | `start_date` / `end_date` | `check_in` / `check_out` |
| `check_in` / `check_out` key | `booking_id` | `reservation_id` |
| `get_folio` / folio actions key | `booking_id` | `reservation_id` |
| `set_availability` format | `availability: [{ date, available_units, restrictions }]` | flat `date_from`, `date_to`, `available_units` |
| `set_rates` format | `rates: [{ date, room_amount, ... }]` + `rate_type_id` | flat `date_from`, `date_to`, `rate` |
| `modify_reservation` dates | `new_arrival_date` / `new_departure_date` | `check_in_date` / `check_out_date` |
| Voucher support | `voucher` param on create_reservation | not present |

### DOCX Missing Items
- `get_ui_config` action (UI Configurator)
- `ROOMS_NOT_READY` error code
- `CONFLICT` error code

## Changes

### 1. Rewrite `src/data/rolos-api-actions.ts`
Fix all parameter names, types, and code examples to match the actual Zod schemas in the edge function. This is the bulk of the work — every action's params, curl/js/php examples, and response examples need to match reality.

Key corrections across all actions:
- All `property_id` params become `propertyId`
- All code examples use `propertyId` in request bodies
- `fetch_availability`: use `start_date`/`end_date`
- `create_reservation`: use `arrival_date`, `departure_date`, nested `guest {}`, `rooms []`, `voucher`
- `modify_reservation`: use `new_arrival_date`, `new_departure_date`
- `check_in`, `check_out`, `get_folio`, `add_folio_charge`, `process_folio_payment`: use `booking_id`
- `apply_service_charges`, `get_booking_charges`, `process_checkout_refunds`: use `booking_id`
- `set_availability`: use `availability` array format
- `set_rates`: use `rate_type_id` + `rates` array
- Add `get_ui_config` action

### 2. Update DOCX with missing items
Regenerate the downloadable DOCX to include:
- `get_ui_config` action documentation
- `ROOMS_NOT_READY` and `CONFLICT` error codes (already in DOCX actually — confirmed on re-check)

### 3. Update code example helpers
Rewrite the `curl()`, `js()`, and `php()` helper functions to use `propertyId` instead of `property_id` in all generated examples.

## Result
- The interactive API reference at `/docs` will match the actual API contract
- The downloadable DOCX will include all actions
- Developers can copy-paste examples that actually work

