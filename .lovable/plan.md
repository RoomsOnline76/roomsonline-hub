

# Rentals United Adapter — Full Mandatory API Coverage

## Gap Analysis

The current `rentalsunited-api` edge function only implements **Pull (read)** operations. The Rentals United PMS integration mandate requires several **Push (write)** operations for full channel connectivity.

| Method | Status | Type | Priority |
|--------|--------|------|----------|
| `Pull_ListOwnerProp_RQ` (list_properties) | Implemented | Pull | — |
| `Pull_ListSpecProp_RQ` (get_property) | Implemented | Pull | — |
| `Pull_ListPropertyAvailabilityCalendar_RQ` (get_availability) | Implemented | Pull | — |
| `Pull_ListPropertyPrices_RQ` (get_prices) | Implemented | Pull | — |
| `Pull_ListReservations_RQ` (list_reservations) | Implemented | Pull | Mandatory |
| **Push_PutProperty_RQ** (push_property) | **Missing** | Push | **Mandatory** |
| **Push_PutAvbUnits_RQ** (push_availability) | **Missing** | Push | **Mandatory** |
| **Push_PutPrices_RQ** (push_prices) | **Missing** | Push | **Mandatory** |
| **LNM_PutHandlerUrl_RQ** (subscribe_notifications) | **Missing** | Push | **Mandatory** |
| **Pull_GetLeads_RQ** (get_leads) | **Missing** | Pull | Optional |
| **Push_PutLongStayDiscounts_RQ** (push_long_stay_discounts) | **Missing** | Push | Optional |
| **Push_PutLastMinuteDiscounts_RQ** (push_last_minute_discounts) | **Missing** | Push | Optional |

## Changes

### 1. Edge Function — `supabase/functions/rentalsunited-api/index.ts`

Add 7 new actions with XML request builders and handlers:

**Mandatory actions:**

- **`push_property`** — `Push_PutProperty_RQ`: Accepts a property payload (name, type, address, coordinates, amenities, rooms, descriptions, images, payment methods, cancellation policies) and builds the full XML envelope. Requires `ru_property_id` and a `property` object in the request body.

- **`push_availability`** — `Push_PutAvbUnits_RQ`: Accepts `ru_property_id` and an `availability` array of `{ date_from, date_to, units, min_stay?, changeover? }` objects. Builds the availability XML with day-level open/closed, min-stay, and changeover rules.

- **`push_prices`** — `Push_PutPrices_RQ`: Accepts `ru_property_id` and a `prices` array of `{ date_from, date_to, price, extra_guest_price? }` objects. Builds pricing XML per the RU pricing model.

- **`subscribe_notifications`** — `LNM_PutHandlerUrl_RQ`: Accepts a `handler_url` (our webhook endpoint) and registers it with RU for live reservation notifications.

**Optional actions:**

- **`get_leads`** — `Pull_GetLeads_RQ`: Pull reservation leads (request status, not confirmed).

- **`push_long_stay_discounts`** — `Push_PutLongStayDiscounts_RQ`: Push long-stay discount rules.

- **`push_last_minute_discounts`** — `Push_PutLastMinuteDiscounts_RQ`: Push last-minute discount rules.

Also update the `RequestBody` interface to include new fields (`property`, `availability`, `prices`, `handler_url`, `discounts`) and update the `health_check` capabilities list to reflect all supported actions.

### 2. PMSProgressToggles — `src/components/PMSProgressToggles.tsx`

Remove `'rentalsunited'` from `MODIFY_NOT_SUPPORTED` and `CANCEL_NOT_SUPPORTED` if it was there (it's currently not, so no change needed — confirmed).

### 3. Tracker Status Update — Database

Update the `pms_tracker_status` row for `rentalsunited` to set `has_post = true` (push capabilities now exist):

```sql
UPDATE pms_tracker_status
SET has_post = true, has_edge = true
WHERE system_type = 'rentalsunited';
```

### 4. Deploy

Redeploy the `rentalsunited-api` edge function.

## Files

| File | Change |
|---|---|
| `supabase/functions/rentalsunited-api/index.ts` | Add 7 new action handlers + XML builders |
| Database | Update tracker flags |

