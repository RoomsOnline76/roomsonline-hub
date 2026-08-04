# RU Leads: pull, 3-day hold, 14-day auto-reject

## Current state (verified)

- `Pull_GetLeads_RQ` already exists in the adapter (`rentalsunited-api`, action `get_leads`) and is already a step in the read-only certification suite ("Get leads (optional)").
- The cron (`cron-pull-ru-reservations`) pulls leads per sub-user account, but only writes them to `ru_notifications` as `event_type: 'poll_lead'`. Leads never become bookings, never block availability, and never appear on the calendar or dashboard.
- Confirmed reservations do block nights via `property_availability` (`external_system: 'manual'`, `available_units: 0`).
- There is no reject/cancel push to RU at all — neither `Push_RejectRequest_RQ` nor `Push_CancelReservation_RQ` exists in the adapter.

## What gets built

### 1. Leads become real holds
For each pulled lead that resolves to a ROLOS property/unit, create a booking row:
- `status: 'pending'`, `booking_channel: 'rentals_united'`, `integration_type: 'rentalsunited_lead'`, `external_reservation_id: <LeadID>`
- guest name/email/phone, arrival/departure, guests, price where RU supplies them
- a `hold_expires_at` timestamp = lead creation + 3 days
- nights blocked in `property_availability` exactly like a confirmed reservation, so no channel or the ROL engine can resell them.

Leads already logged (dedupe on `external_reservation_id`) are updated, not duplicated. A lead that later appears as a confirmed reservation is promoted in place (status → `confirmed`, hold cleared) instead of creating a second booking.

### 2. Hold lifecycle sweep (new scheduled job)
A new edge function `ru-lead-lifecycle` runs on cron (hourly) and, for every pending RU lead booking:

```text
hold age <= 3 days                          -> keep block, no action
hold age  > 3 days, arrival > 14 days away  -> RELEASE availability block,
                                               keep the reservation as an unblocked
                                               pending enquiry (bookable elsewhere)
hold age  > 3 days, arrival <= 14 days away -> CANCEL at RU (Push_RejectRequest_RQ,
                                               fallback Push_CancelReservation_RQ),
                                               mark cancelled locally with the note
                                               "Held for 3 days and not paid within
                                               14 days of arrival", release the block,
                                               remove from calendar + dashboard
```

Every transition is written to `ru_notifications` / `ru_sync_runs` so the sync observability tab shows lead lifecycle activity.

### 3. Adapter: reject / cancel push
Add to `rentalsunited-api`:
- `reject_request` → `Push_RejectRequest_RQ` (preferred)
- `cancel_reservation` → `Push_CancelReservation_RQ` (backwards-compatible fallback, used automatically when RU has not enabled reject for the integration)

Both are child-scoped: they authenticate with the owning sub-user's AccessKey/SecretKey (added to `CHILD_SCOPED_ACTIONS` and the master-forbidden guard) so a white-label lead is never rejected on master credentials.

### 4. Certification suite
Promote leads from "optional" to a covered milestone in the read-only phase and add lifecycle steps:
- "Pull leads (Pull_GetLeads_RQ)" — mandatory, account scope, asserts a parseable response.
- "Lead hold applied (availability blocked)" — property scope, verifies a pulled lead produced a hold + availability block (skips with a clear note when the account currently has no open leads).
- "Reject request available (Push_RejectRequest_RQ)" — probes the method and records it as an informational skip when RU has not enabled it, per the existing disabled-endpoint convention.

All new RU calls go through the existing `ruInvoke` pacing so the sliding-minute limit is respected.

### 5. Calendar & dashboard
- Pending RU lead holds render on the ROLOS dashboard calendar and week/month grids in a distinct "held" style with a "Held — expires in Xh" hint, and count toward occupancy blocks but not toward confirmed revenue counters.
- Cancelled/expired leads disappear from the calendar and dashboard (already covered by the `cancelled` status filters).

## Technical notes

- New booking columns needed: `hold_expires_at timestamptz`, `hold_released_at timestamptz` on `bookings` (migration with no RLS/grant change; policies already cover the table).
- Lead creation time comes from the RU lead XML (`DateCreated` / equivalent); when absent, first-seen time is used and stored so the 3-day clock is stable across runs.
- The 14-day test uses the arrival date vs. now in the property's local date, matching how availability dates are stored.
- Cron registered via `pg_cron` + `pg_net` alongside the existing RU jobs.
- Files touched: `supabase/functions/rentalsunited-api/index.ts` (new push actions + child-scope sets), `supabase/functions/cron-pull-ru-reservations/index.ts` (lead → booking + block), new `supabase/functions/ru-lead-lifecycle/index.ts`, `supabase/functions/ru-cert-portal/index.ts` (suite steps), `src/pages/pms/PMSDashboard.tsx` and calendar rendering for the held style.
- `.lovable/ADAPTER_LOCKS.md` is respected: the reservation-handler and orchestrator ARI regions are untouched; additive changes only to the RU adapter action switch, which is not a locked region.
