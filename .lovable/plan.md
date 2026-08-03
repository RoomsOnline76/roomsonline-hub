# Specials Wizard + Cancellation Policy Library

Bring specials creation into a guided wizard that fully supports **Last Minute** and **Advance Purchase (early booker)** deal types, lets each special carry its own optional cancellation policy, and rework the Policies tab into a proper multi-policy library with a master fallback and portfolio sharing. Applies to every property regardless of PMS (including ROL'OS).

Confirmed decisions:
- Checkout: if exactly one special qualifies it applies automatically (best price, no guest action). If two or more qualify, the guest picks **one** from selectable offers and the price recalculates live so options can be compared.
- Phase 1 covers direct channels only (website, embed, WBE, ROL'OS booking flow). Channel push (RU, Hostfully, Booking.com) is a later phase.
- Wizard can either link an existing policy or create one inline, which is saved into the property's policy library.
- When copying a policy to portfolio siblings, the owner chooses per copy: independent copy or linked to the master (with propagation).

---

## Phase 1 — Data model

Extend `property_specials` with the fields the new deal types need:
- `deal_type`: `basic | last_minute | advance_purchase | long_stay | rate_grid | package`
- Booking-window fields: `lead_days_min` (advance purchase: days *before* check-in the booking must be made), `lead_days_max` and `lead_hours_max` (last minute)
- `dow_mask` (which weekdays of the stay the deal applies to), `stay_date_ranges` (JSONB, multiple ranges)
- `audience` (`everyone | subscribers`), `is_stackable` (default false), `priority`
- `cancellation_policy_id` → `rolos_reservation_policies`
- `rounding_mode` / `price_pointing` (round-to-nearest + .99-style pointing, as in the Nightsbridge example)
- `applicable_rate_plan_ids`

Extend `rolos_reservation_policies`:
- `is_master` (the global fallback when nothing else applies), `scope` (`property | portfolio`), `linked_master_id` (for propagating copies), `description`
- Keep existing `is_default`, `source_policy_id`, `rule` (already holds tiers, non-refundable, deposit, terms)

A DB trigger enforces a single `is_master` policy per property. Copies created as "linked" store `linked_master_id`; a propagation helper updates linked children when the master's rule changes.

## Phase 2 — Specials wizard

New `SpecialWizard` component (multi-step dialog, `useReducer` state) replacing the flat form as the *creation* path; the existing list/detail form stays for quick edits.

Steps:
1. **Deal type** — cards for Last Minute, Advance Purchase, Long Stay, Basic discount, Fixed price, Package. Each shows a one-line explainer.
2. **Bookable period** — type-specific: last minute takes "max N days *or* N hours before check-in"; advance purchase takes "minimum N days before check-in"; long stay takes min nights.
3. **Audience & discount** — everyone vs subscriber-only secret deal; discount %, fixed off, or fixed price with 1–99% validation.
4. **Stay dates** — date range or specific ranges, plus weekday checkboxes, with a plain-language confirmation line ("Your discount applies to stays between …").
5. **Applies to** — rooms/unit types and rate plans; price pointing/rounding.
6. **Cancellation policy** — none (inherit property master), pick from property + portfolio library, or create inline (opens the policy editor, saves into the library and links it).
7. **Copy to properties** — portfolio sibling picker with per-target choice of independent copy vs linked-to-master; skipped when the property has no portfolio.
8. **Review** — summary of every setting, activation toggle, save.

Wizard is mounted from both **/admin/edit property → Specials** and **property setup (PropertyOnboarding / PMSPropertySetup)** so both entry points share one implementation.

## Phase 3 — Policies tab rework

`PoliciesTab` / `ReservationPoliciesList` gains:
- Multiple policies per property with an explicit **Master (global fallback)** marker and a "Set as master" action
- A table view resembling the reference: policy name, summary label ("Flexible – 30 days", "Non-refundable"), what it is linked to (rate plans, channels, specials), and the 90-day metrics already available
- Inline warning when no master exists
- **Copy to portfolio** dialog reworked to ask independent vs linked, and to show which siblings already have a copy
- Section listing specials that reference each policy so deletion is blocked/warned when in use

## Phase 4 — Resolution engine (direct bookings)

New shared resolver (`src/lib/specialsResolver.ts` + a mirrored `supabase/functions/_shared/specialsResolver.ts`) that, given property, stay dates, booking timestamp, rooms and rate plans, returns every **eligible** special with its computed price effect, ordered by guest value.

`Booking.tsx` and the embed/WBE flows then:
- Auto-apply the single best special when only one is eligible
- Render a selectable offer list when several are eligible, one-of-N, recalculating totals on change (stackable specials remain additive as today)
- Resolve the cancellation policy shown at checkout as: selected special's policy → rate-plan-linked policy → property master policy, and display the resolved text on the payment step and in the confirmation email payload

Legacy stacking behaviour for existing packages is preserved; only specials become one-of-N.

## Phase 5 — Verification

- Typecheck plus a Playwright pass over the specials wizard, the reworked Policies tab, and a booking flow with two competing specials to confirm selection changes the total and the displayed cancellation terms.

---

## Technical notes

- Table changes go through migrations with GRANTs; new columns are nullable with sensible defaults so existing specials keep working (`deal_type` backfilled to `basic`).
- Reuse `ManualCancellationRule`, `policyFormatter`, and `cancellationPolicy.ts` translators — no new policy shape is introduced.
- `AccommodationSpecialsTab.tsx` is split into `SpecialsList`, `SpecialQuickEdit`, and `SpecialWizard/*` to keep files small; typing replaces the current `any` casts on `property_specials`.
- Channel/RU mapping of the new deal types is explicitly out of scope for now; `push-property-to-ru` keeps its current behaviour and a follow-up phase maps last minute / advance purchase onto RU discount types.
