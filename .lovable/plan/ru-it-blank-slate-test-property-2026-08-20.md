# RU IT blank-slate test property

## Verified current state

- `ru-testowner@roomsonline.co.za` auth user exists and is email-confirmed.
- Four clones exist and all carry live RU listing IDs on their units: Clone A (9 units, portfolio "RentalsUnited TEST"), Clones B/C/D (portfolio "Connect").
- `ru_owner_accounts` has exactly three rows, all portfolio-scoped: RentalsUnited TEST (OwnerID 742004), Connect (741765), and one other portfolio (741761). None is property-scoped.
- `scoped_admin_properties` currently pins `ru-admin@roomsonline.co.za` to the four clones (no Seesig/Tidal rows remain).
- Clone B is Phase-2 shaped content: 1007-char description, 10 property photos, 4 active units, RU listing IDs present on units.

## What will be built

**1. New portfolio + property**

- Create portfolio **"RU IT – Test Portfolio"** with no `ru_owner_accounts` row (so `findOwnerAccount` resolves to `account: null`, `ru_owner_id: null`).
- Create property **"RU IT Blank Slate – Test Owner"** by copying Clone B's content row (description, property type, geo/address, RU detailed location, check-in/out times, arrival instructions, amenities, policies, payment methods, images) with:
  - `owner_email = ru-testowner@roomsonline.co.za`
  - `external_system = roomsonline`, `is_active = true`, `is_trading = true`, `ru_push_enabled = true`
  - `rentalsunited_property_id = NULL` (and the building id column if present)
- Copy **one** unit only (Clone B's best-populated unit) into `hostfully_room_types`: beds/capacity, space m², floor, bathrooms, toilets, separate kitchen, changeover rule, min stay, channel property type, unit images — with `rentalsunited_property_id = NULL`.
- Copy the dependent rows the readiness scorer reads: property/unit charges, local experiences (points of interest), rate plans + seasons + rates, and availability for the new unit so the local bookable window is open and fully priced for 365 days.

**2. Strip RU identity**

No RU listing IDs on the property or the unit, no `ru_owner_accounts` row for the property or its portfolio, no API keys, no company details. The four existing clones and their owner accounts are not touched.

**3. Tester scope**

Replace `scoped_admin_properties` for `ru-admin@roomsonline.co.za` with a single row for the new property, so the RU IT admin can only see the blank-slate property and its portfolio.

**4. Verification before handoff**

Run the existing readiness/phase-gate path (`ru-cert-portal → property_readiness` and the phase gate) and iterate on authored content until:

- `mandatory_passed === mandatory_total`, `blocking_gaps = []`
- P1 = blocked ("No Rentals United sub-user…"), P2 = passed, P3/P4 = pending
- `ready_for_push = false`, `ru_owner_id = null`
- Re-confirm the four clones still hold their listing IDs and owner accounts.

Nothing is pushed to the channel: no `Push_CreateUser_RQ`, no keys, no company details, no property push.

## Technical notes

- All data work happens in one migration (portfolio, portfolio member, property, unit, charges, experiences, rate plan/season/rates, availability, scoped-admin rewrite), copying from Clone B `700a9471-6c1d-4ad5-b889-1f3c71a0e9fc` via `INSERT ... SELECT` so no content is invented.
- Readiness thresholds come from `_shared/ruReadiness.ts`; where a copied value falls short (e.g. description below the 700-char cert floor, photos under 10, measured image size, amenity count ≥ 10, beds covering `max_guests`), the shortfall is fixed by authoring real values on the new rows — never at push time.
- Phase resolution relies on `findOwnerAccount` order (portfolio → property → legacy email); the new portfolio and property both have zero owner-account rows, and there is no legacy row for `ru-testowner@`, so scope resolves to `master` with a null OwnerID and P1 stays blocked.
- No application code changes: no edits to calendar, booking UI, generic PMS fetch paths, adapter-locked files, or master credentials.

## Deliverable

A short confirmation note with property_id, name, owner_email, the phase-gate snapshot (P1/P2/P3/P4, `ready_for_push`, `ru_owner_id`), and proof that RU IDs and owner-account linkage for this property are empty.
