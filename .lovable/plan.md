

## Add Pull_GetLeads_RQ to RU Reservation Polling

### What This Does
Adds lead polling to the existing `cron-pull-ru-reservations` function. Leads are guest inquiries (request status) that don't block availability and aren't confirmed bookings. They'll be logged to `ru_notifications` with event type `poll_lead` for visibility — no booking record is created since leads are non-binding.

### Current State
- `get_leads` action already exists in `rentalsunited-api` — accepts `date_from`/`date_to`, returns raw XML
- The cron function already polls reservations every 30 minutes but ignores leads
- `ru-reservation-handler` (RLNM push) already logs leads but takes no booking action

### Changes

**1. Update `supabase/functions/cron-pull-ru-reservations/index.ts`**

After the reservation polling block, add a second API call to `get_leads` with the same date range (last 7 days):
- Call `rentalsunited-api` with `action: 'get_leads'`
- Parse `<Lead>` blocks from the response XML
- Extract: `LeadID`, `PropID`, `DateFrom`, `DateTo`, guest name/email, message text
- Resolve `PropID` to internal property (same lookup logic already in the function)
- Log each lead to `ru_notifications` with `event_type: 'poll_lead'`
- Deduplicate: skip if a `ru_notifications` entry with the same `ru_reservation_id` (using LeadID) already exists
- Add `leads_found` and `leads_logged` counters to the summary

No bookings are created for leads — they're informational only. The `ru_notifications` table provides an audit trail that can later feed a guest messaging or inquiry management feature.

### Files to Update
- `supabase/functions/cron-pull-ru-reservations/index.ts` — add leads polling after reservations

### What Does NOT Change
- `rentalsunited-api` — `get_leads` action already works
- No schema changes — reuses `ru_notifications` table
- No UI changes
- Cron schedule stays at every 30 minutes

