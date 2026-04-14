

## Add RLNM Subscription to Rentals United Sync

### Current State
- The XML builder `buildSubscribeNotificationsXml` and action handler `subscribe_notifications` **already exist** in `rentalsunited-api/index.ts` — fully functional, just never called.
- No receiver edge function exists to handle incoming RU reservation notifications.
- The daily cron job (`cron-push-all-properties-to-ru`) pushes property data but does not register/refresh the RLNM handler URL.

### What RU Sends via RLNM
RU POSTs XML to the registered handler URL for three event types:
- **Confirmed reservation** — new booking from a sales channel
- **Cancelled reservation** — booking cancellation
- **New lead** — guest inquiry

The handler URL is account-level (not per-property). We register once and RU sends all reservation events to that single endpoint.

### Changes

**1. New edge function: `supabase/functions/ru-reservation-handler/index.ts`**
- Receives POST requests from RU containing XML reservation notifications
- Parses the XML to extract: reservation ID, property ID, event type (new/cancel/lead), guest details, dates
- Looks up the ROL'OS property by matching `rentalsunited_property_id` on `hostfully_room_types` (unit-level) or `properties` table
- Logs the notification to a new `ru_notifications` table for audit/debugging
- For confirmed reservations: could trigger downstream booking creation (phase 2 — for now, just log)
- Returns HTTP 200 with success XML so RU marks delivery as complete
- No JWT verification needed (RU sends plain POST)

**2. New database table: `ru_notifications`**
```sql
CREATE TABLE public.ru_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,           -- 'reservation_confirmed', 'reservation_cancelled', 'lead'
  ru_reservation_id text,
  ru_property_id text,
  property_id uuid REFERENCES properties(id),
  raw_xml text,
  processed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.ru_notifications ENABLE ROW LEVEL SECURITY;
```
RLS: service-role only (edge function uses service role key).

**3. Update `cron-push-all-properties-to-ru/index.ts`**
- Add a step at the **start** of the cron run (before property pushes) that calls `subscribe_notifications` with the handler URL
- Handler URL: `https://<project-ref>.supabase.co/functions/v1/ru-reservation-handler`
- This ensures the subscription is refreshed daily (RU's mandatory 24-hour refresh)
- Log success/failure but don't block property pushes if subscription fails

**4. Add manual trigger in push-property-to-ru (optional)**
- Accept an optional `subscribe_rlnm: true` flag in the request body
- When set, call `subscribe_notifications` before pushing properties
- Useful for initial setup without waiting for the cron

### Files to Create
- `supabase/functions/ru-reservation-handler/index.ts` — RLNM receiver

### Files to Update
- `supabase/functions/cron-push-all-properties-to-ru/index.ts` — add daily RLNM subscription refresh

### Database Changes
- New `ru_notifications` table (via migration)

### What Does NOT Change
- `rentalsunited-api/index.ts` — XML builder and action handler already correct
- No UI changes (notifications are backend-only for now)

