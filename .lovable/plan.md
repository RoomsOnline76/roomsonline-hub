

## Add Pull_ListReservations_RQ Polling (Every 30 Minutes)

### What This Does
Creates a new edge function that polls RU every 30 minutes for reservations from the last 7 days. This acts as a safety net alongside RLNM — catching any notifications that were missed or failed to deliver.

### Current State
- `list_reservations` action already exists in `rentalsunited-api` — accepts `date_from`/`date_to`, returns raw XML
- `ru-reservation-handler` already has booking creation/cancellation logic
- Cron infrastructure (`pg_cron` + `pg_net`) is already set up

### Changes

**1. New edge function: `supabase/functions/cron-pull-ru-reservations/index.ts`**

- Calculates date range: today minus 7 days → today
- Calls `rentalsunited-api` with `action: 'list_reservations'`
- Parses the `Pull_ListReservations_RS` XML response to extract each `<Reservation>` block
- For each reservation, extracts: `ReservationID`, `StatusID` (1=confirmed, 4=cancelled), `PropID`, `DateFrom`, `DateTo`, guest details, `RUPrice`
- Resolves `PropID` to internal property/room type (same lookup as ru-reservation-handler)
- For confirmed/modified reservations: upserts booking (insert if new, update dates/price/guest if existing) using `external_reservation_id` + `integration_type='rentalsunited'` for dedup
- For cancelled reservations: updates existing booking to `status: 'cancelled'`
- Logs each processed reservation to `ru_notifications` with `event_type` prefixed with `poll_` to distinguish from push notifications
- Returns summary of processed/skipped/failed reservations

**2. Register 30-minute cron job via SQL insert**

```
*/30 * * * *  →  cron-pull-ru-reservations
```

### Key Design Decisions
- **Upsert logic**: If a booking with the same `external_reservation_id` already exists (created by RLNM), the poll updates it rather than creating a duplicate. This handles modification events that RLNM may have missed.
- **7-day window**: Matches RU's documented limit. Wide enough to catch delayed or retried reservations.
- **Rate limit awareness**: RU allows only 1 concurrent request and 1 per minute for this endpoint. A single call every 30 minutes is well within limits.
- **`poll_` prefix on notification event types**: Makes it easy to distinguish poll-sourced vs push-sourced entries in `ru_notifications`.

### Files to Create
- `supabase/functions/cron-pull-ru-reservations/index.ts`

### Files NOT Changed
- `rentalsunited-api` — `list_reservations` action already works
- `ru-reservation-handler` — push handler stays independent
- No schema changes — reuses existing `bookings` and `ru_notifications` tables

