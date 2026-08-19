# Native Guest Intelligence Layer (HubSpot becomes optional)

Goal: ROL'OS owns inquiries, guest enrichment and post-stay follow-up as first-class native objects. HubSpot stays a projection — every feature below works fully with the add-on switched off.

## 1. Inquiry pipeline (native)

New `rolos_inquiries` object with the pipeline `New → Contacted → Quoted → Provisional → Confirmed → Lost`, holding guest contact fields, optional property, source, notes, assignee, `trade_or_direct`, and travel dates/pax so a quote can be built without leaving the record.

New sidebar item **Inquiries** (`/pms/inquiries`), desktop and mobile:

```text
Inquiries                                    [+ New inquiry]
[New 4] [Contacted 2] [Quoted 3] [Provisional 1] [Confirmed] [Lost]
--------------------------------------------------------------
Guest            Property     Dates        Source   Owner  Age
J. Petersen      Swartmossel  12–15 Sep    Website  Carike  2h
...                                        [Trade]
--------------------------------------------------------------
Detail drawer: contact · dates · notes timeline · stage buttons
               assign · mark Trade/Direct · Convert to booking
```

- Stage changes are logged with who/when, so response times are auditable.
- "Convert to booking" pre-fills the existing manual booking dialog; the inquiry links to the created booking and moves to Confirmed. No changes to booking logic itself.
- Lost requires a short reason (picked from a list) to keep segmentation clean.

## 2. Website inquiry endpoint

Public edge function `inquiry-intake` accepting form posts, authenticated by a **publishable inquiry key** issued per owner/property in ROL'OS (visible, copyable, revocable in settings). The key identifies the sender; abuse controls (rate limit per key + honeypot field) sit on top.

- Creates the native inquiry, returns a clean `{ success, reference }` for the website's confirmation message.
- Pushes to HubSpot only when that owner has the add-on enabled.
- Never trusts the caller for owner/property — both are derived from the key.

## 3. Digital check-in / preference capture

One dense form, two surfaces (as requested):

- **Guest self-service**: tokenised link (same pattern as the existing guest portal) that can be emailed or opened on a tablet at arrival.
- **Staff-side**: the same form as a modal on the booking, for capture with the guest present.

Captures identity (name, phone, address, nationality, passport/ID, date of birth), dietary and access needs, arrival time, marketing consent, and free-text preferences. Writes straight into the unified guest record and the booking's guest fields — identity documents are stored encrypted using the existing pattern, and are never returned to the browser once saved.

Completion is visible on the booking as a "Check-in captured" chip, and pushes the enrichment to the HubSpot contact when enabled.

## 4. Post-departure feedback

When a stay moves to departed:

- A feedback task is always created for the team (native, survives HubSpot being off).
- A branded survey email is sent **only for properties that opt in** (per-property switch, default off), through the existing branded email system.
- A short public feedback page collects rating + comment, which lands on the guest record and the booking.
- When HubSpot is on, the departure and the feedback response are pushed as an engagement on the contact/deal.

## 5. Segmentation and in-product SOPs

- Trade/Direct is first-class on inquiries and guests, and repeat/lapsed markers are derived from the existing stay history rollup (repeat = more than one completed stay, lapsed = no stay in 18 months). Filter chips on both the inquiry list and the guest list.
- Short inline TOBI-style tips on the inquiry drawer and check-in form explain what to capture and why (e.g. always take a mobile number, always mark Trade when an agent books), so the SOP lives where the work happens. Matching help article for the reservations team.

## Guardrails

- No changes to the calendar, PropertyForm, `fetchPmsAvailability`, `pms_mappings`, or any PMS adapter.
- All HubSpot traffic continues to flow only through the existing isolated `hubspot-api` function; new projections are added as actions there, never as direct HubSpot calls from anywhere else.
- Every new surface degrades cleanly with the add-on disabled — nothing blocks, nothing errors.
- Density and Collapsible patterns follow the current onboarding and Channel Manager work.

## Technical detail

New tables (all with grants, RLS scoped to property/portfolio access plus service role, and `updated_at` triggers):

- `rolos_inquiries` — pipeline record; `status` enum, `source`, `assigned_to`, `is_trade`, `linked_booking_id`, travel window, pax, `lost_reason`.
- `rolos_inquiry_events` — append-only stage/assignment/note history.
- `rolos_inquiry_keys` — publishable intake keys (`key_public`, owner/property scope, `is_active`, last used, request counter).
- `rolos_guest_checkins` — one row per booking: submitted payload, encrypted identity fields, `submitted_by` (guest or staff), timestamps.
- `rolos_feedback_requests` — departure-triggered task/survey state, token, rating, comment, channel, HubSpot projection status.
- `properties`: one new opt-in flag for the automatic survey email (data-only column, no PropertyForm changes; toggle lives in the new Guest Experience settings card).

Edge functions:

- `inquiry-intake` (public, key-authenticated) — validate with Zod, resolve key, insert inquiry, optional HubSpot projection.
- `guest-checkin-api` — token-scoped guest submissions and staff submissions, writes guest record, projects to HubSpot.
- `guest-feedback-api` — token-scoped survey submission.
- `cron-departure-feedback` — hourly sweep for departed stays: create task, send opt-in survey email, project to HubSpot.
- `hubspot-api` — three new actions (`upsert_inquiry`, `enrich_contact`, `log_engagement`), same isolation and opt-in gate.

Frontend:

- `/pms/inquiries` page with list, stage board chips, detail drawer, and convert-to-booking handoff; sidebar and mobile nav entries.
- `GuestCheckInForm` shared component rendered in a public tokenised route and in a staff modal on the booking sheet.
- Public feedback route.
- Guest Experience settings card (survey opt-in + intake key management), placed beside the existing HubSpot card.
- Trade/repeat/lapsed filter chips on the inquiry and guest lists.
