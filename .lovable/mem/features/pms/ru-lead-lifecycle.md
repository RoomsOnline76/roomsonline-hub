---
name: RU lead hold lifecycle
description: Rentals United leads become 3-day availability holds, release after 3 days, and are withdrawn at RU when arrival is within 14 days
type: feature
---

Pulled RU enquiries (`Pull_GetLeads_RQ`, via `cron-pull-ru-reservations`) become local `bookings`
rows with `status: 'pending'`, `integration_type: 'rentalsunited_lead'`, `lead_created_at`,
`hold_expires_at` (= created + 3 days) and, once lapsed, `hold_released_at`.

Policy (enforced by `ru-lead-lifecycle`, cron `ru-lead-lifecycle-30min` every 30 min):
1. While held, the nights are blocked in `property_availability` (`external_system: 'manual'`,
   same convention as push-booking).
2. Hold expires after **3 days** → availability released, enquiry stays visible (muted/dotted
   bar on the calendar) so it can still be converted, but the dates are sellable elsewhere.
3. Hold expired **and** arrival within **14 days** → withdraw at RU with
   `Push_RejectRequest_RQ` (preferred), falling back to `Push_CancelReservation_RQ`; local
   booking is cancelled with the note
   "Held for 3 days and not paid within 14 days of arrival" and removed from calendar/dashboard.

Both RU actions are child-scoped: they authenticate with the owning sub-user's
AccessKey/SecretKey (`ru_api_credentials` per OwnerID) and refuse a master-credential answer.

Certification: `ru-cert-portal` read-only suite runs `Get leads (Pull_GetLeads_RQ)` as
**mandatory** plus a "Lead hold lifecycle" step that invokes `ru-lead-lifecycle`.

Dashboard: `getBookingColor` in `PMSDashboard.tsx` renders held leads dashed violet and lapsed
leads muted/dotted.
