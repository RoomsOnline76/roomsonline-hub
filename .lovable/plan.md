## Goal

Match the Booking.com "Reservation policies" panel (screenshot) inside ROLOS: each property maintains a **library of named policies** (e.g. "Flexible – 30 days", "Non-refundable") that combine cancellation tiers + prepayment terms, can be linked to rate plans / channels, applied to other properties, and show usage metrics.

## Current state
- `rolos_policies` stores exactly **one** policy per type per property (unique constraint `(property_id, policy_type)`), edited by the just-shipped `PoliciesTab`.
- That single row is mirrored into `amenities.cancellation_policies` for channel push.
- No named presets, no rate-plan linkage, no reporting.

## Data model (one migration)

New table `public.rolos_reservation_policies` (keep `rolos_policies` as the "active default" pointer for backwards-compat):
- `name` text — display label (e.g. "Flexible – 30 days")
- `kind` enum-like text — `general` | `non_refundable` | `custom`
- `is_default` bool — the property's active policy at checkout / channel push
- `rule` jsonb — same canonical shape produced by `PoliciesTab` today (tiers, non_refundable, deposit_percent, one_night_refundable, full_payment_within_days, additional_terms) plus new `prepayment_timing` (`at_booking` | `days_before:N`).
- `source_policy_id` uuid nullable — self-reference for "copy" lineage (audit only).

New join table `public.rolos_policy_rate_links`:
- `policy_id`, `rate_plan_id` (references `rolos_rate_plans`), optional `channel` text.
- Unique `(policy_id, rate_plan_id, channel)`.

Standard GRANTs + RLS mirroring `rolos_policies` (admin/dev/fearless_leader full access; owners read on their properties).

Trigger: exactly one `is_default = true` per property (partial unique index).

## UI — replace the single-form `PoliciesTab` with a list view

```text
Reservation policies                                      [+ Create new policy]
──────────────────────────────────────────────────────────────────────────────
● Flexible – 30 days (General)                            [★ Default]
  - Free cancellation until 30 days before arrival …
  - Prepayment collected before free-cancel deadline
  [Edit] [Delete] [Apply to other properties ↗]
──────────────────────────────────────────────────────────────────────────────
○ Non-refundable                                          [Set default]
  - Full price charged for any cancellation …
  Report from 9 Apr 2026 to 8 Jul 2026
    Room nights: 2   Revenue: ZAR 7,144.04   Cancel rate: 0.0%
  [Edit] [Delete] [Apply to other properties ↗]
```

- **Edit** opens the same detailed editor the current `PoliciesTab` uses (tiers + deposit/terms tabs), pre-loaded with that policy.
- **Delete** blocked when policy is default or linked to any rate plan (toast explains).
- **Apply to other properties** dialog: multi-select target properties, plus radio "Copy independent" / "Link (edits propagate)" — see below.
- **Set default** promotes a policy; on save the app also mirrors that policy's rule into `rolos_policies` + `amenities.cancellation_policies` (same path shipped last turn), so nothing downstream changes.

### Editor extras
- New "Prepayment timing" select (`At booking` / `X days before arrival`) — feeds Rentals United deposit_type / Nightsbridge-style summary.
- New "Applies to rate plans / channels" section: multi-select of the property's `rolos_rate_plans` + optional channel tags — writes to `rolos_policy_rate_links`.

### Apply-to-other-properties dialog
- Radio (as requested): **Copy** vs **Link**.
- **Copy** = insert a new row per target with same `rule` + `source_policy_id`.
- **Link** = insert a `rolos_policy_rate_links` row targeting the same source policy id from another property's rate plans (or, if no rate plans selected, an "attached" row with `rate_plan_id = null` treated as "use as default").
- After apply, toast lists success/failure per property.

## Reporting block per policy
Per policy card, show for the last 90 days (configurable):
- Total room nights, total revenue, cancel rate.
Derived on the fly by a `rolos-policy-metrics` edge function that joins `bookings` on `rate_plan_id ∈ links(policy_id)` (or falls back to the property's default policy for legacy bookings). Cached client-side per session.

## Channel push
The currently active (default) policy still drives the mirror into `amenities.cancellation_policies` (unchanged path). Later, we can extend `push-property-to-ru` and other adapters to push per-rate-plan policies once channels support it — kept out of this iteration to protect ADAPTER_LOCKS.

## Files

New:
- `supabase/migrations/<ts>_reservation_policies.sql` — the two tables, GRANTs, RLS, default trigger.
- `supabase/functions/rolos-policy-metrics/index.ts` — reporting endpoint.
- `src/components/property/ReservationPoliciesList.tsx` — list + card UI.
- `src/components/property/ReservationPolicyDialog.tsx` — create/edit form (reuses fields from current PoliciesTab).
- `src/components/property/ApplyPolicyToPropertiesDialog.tsx` — copy vs link.
- `src/hooks/useReservationPolicies.ts` — CRUD + metrics.

Edited:
- `src/components/property/PoliciesTab.tsx` → thin wrapper that renders `<ReservationPoliciesList propertyId={…} />` and keeps the "Deposit & Terms" subtab available on the *default* policy for continuity.
- `src/components/property/RateManagerTab.tsx` — no change (sub-tab still called "Policies").

Out of scope this pass:
- Global admin catalogue (deferred).
- Adapter-level per-rate-plan policy pushes.
- Advanced settings tab from the screenshot (empty stub only).

## Answer to your question
Reservation policies currently work as a **single per-property blob** — not as the Booking.com-style named library. The plan adds a proper multi-policy library with rate-plan linkage, copy/link propagation, and reporting, while keeping the existing channel-mirror path intact via the "default" flag.
