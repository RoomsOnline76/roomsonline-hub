# Clone four properties (configuration only, no bookings)

## What gets cloned

Four new property records, each named `<Original> (Copy)` with a new slug:

- Dassiesingel Self-catering Units
- Fonteinhutte Self-Catering Chalets
- Seesig Self Catering Chalets
- Tidal Pools Self Catering Apartments

All four originals are confirmed active in the database. The clones are created as real new listings, in **no portfolio**, and start **not trading / not published** so they can be edited before going live.

## Data copied across

**Property record** — every descriptive, location, media, facility, policy-text and content field, plus a fresh slug and reference counter.

**Rooms & units** — room types, physical rooms, bed and bedroom composition, occupancy limits, unit images, facilities and amenity selections.

**Rates** — seasons, rate plans, plan-to-unit links, season rates, prices, stay restrictions and stop-sells.

**Commercial rules** — reservation and cancellation policies, specials, property-level charges, promo codes/vouchers, partner perks, packages, deposit schedules, message templates and branding config.

**Financial & contractual** — billing config, commercial terms, banking details, contact details, owner links, contracts (copied as unsigned drafts on the clone).

## Deliberately not copied

- Bookings, reservations, room nights, folios, payments, refunds, invoices, statements.
- Guest and CRM records, guest messages, housekeeping/maintenance history, night audit logs, daily metrics.
- Availability caches, PMS reservation mirrors, review caches, activation and audit logs.

## Channel bindings

The channel connection row is copied so the clone carries the same distribution intent, but **all channel-side identifiers are cleared** and pushing is left disabled. A channel listing ID can only belong to one property — reusing it would create duplicates in the channel portal. Each clone therefore needs its own listing created through the Channels wizard when it is ready.

## Technical notes

- Implemented as one transactional migration using a temporary old-id → new-id mapping per property, so nested references (room type → rate plan link → season rate) stay internally consistent and never point back at the original.
- Signed contract state, channel IDs, `push_enabled`, readiness snapshots, reference sequences and any `verified_at` / `sent_at` markers are reset on the clones.
- Copy runs per property in dependency order: property → room types → rooms → seasons → rate plans → links/prices/restrictions → policies → specials/charges/offers → billing/banking/contracts.
- After the migration, a verification query reports, for each clone, the counts of units, rate plans, priced links and policies against the original so any gap is visible immediately.
