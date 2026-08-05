# ROL'OS Onboarding — Channel Readiness Runbook

Sequence for taking a property that is switching to ROL'OS all the way through to a live
Channel Manager connection. Seven macro steps, each with its minor tasks. A macro step is
"done" only when every mandatory task inside it passes — the next step is gated on it.

Terminology: everything below is ROL'OS / TOBI language. "Distribution identity" and
"Channel Manager" are the owner-facing names for the underlying channel infrastructure.

---

## Macro 1 — Property identity & company profile

Goal: the property exists in ROL'OS with a complete, legally valid identity.

- Capture property name, type, star rating, description and brand voice.
- Complete Company Information: registered legal name, registration number, VAT number,
  trading name.
- Capture banking details (used for payouts and remittance advice).
- Set the timezone in strict `UTC±HH:MM` form.
- Capture public email, public phone, reservations contact, after-hours and emergency contacts.
- Where the property belongs to a portfolio, enable Portfolio Commons auto-share so legal,
  banking, contact and location data propagate to sibling properties.

Exit check: Identity & Location tab shows no outstanding mandatory fields.

## Macro 2 — Location & geo registration

Goal: the property resolves to a real, distribution-recognised location.

- Capture full street address, city, region, postal code and country.
- Set precise latitude/longitude (map pin, not approximate).
- Resolve and store the distribution Location ID from the central Location Register.
- Confirm the Google Place ID (paste a Google Maps link to auto-extract).
- Verify the property currency is the published currency (ZAR unless explicitly agreed);
  run the currency read-back so the distribution side agrees.

Exit check: Location ID stored, currency verified, no geo warnings.

## Macro 3 — Rooms, composition & occupancy

Goal: sellable inventory is modelled correctly, unit by unit.

- Create every room/unit type with its own record (no lumped inventory).
- Set `CanSleepMax`, standard occupancy, and adult/child splits per unit.
- Complete room composition: bedrooms and beds per unit — bed entries must cover at least
  half of maximum occupancy.
- Capture unit-level amenities (use TOBI amenity scouting to pre-fill, then confirm).
- Capture property-level facilities — minimum 10 amenities.
- Confirm active/inactive state per unit so only sellable stock is exposed.

Exit check: every active unit has composition, occupancy and amenities complete.

## Macro 4 — Media

Goal: the listing meets image quality minimums.

- Upload at least 10 photos, each **≥ 1024 × 683 px**.
- Mark exactly one main image.
- Tag images (exterior, bedroom, bathroom, view, etc.) for channel mapping.
- Add unit-level photos; property hero falls back to room images only as a safety net.

Exit check: photo count, dimensions, single main image and tags all pass.

## Macro 5 — Policies, rates & pricing coverage

Goal: commercial terms are complete and priced for a full year.

- Author or adopt a master cancellation policy; set the portfolio default and copy to siblings.
- Author reservation policies (check-in/out, deposits, house rules).
- Configure at least one payment method and confirm the payment provider
  (ROL'OS gateway or BYO, inherited portfolio-wide).
- Build seasons and rate types; capture rates per unit and per occupancy tier.
- Confirm pricing coverage across a rolling **365 days** (days priced / 365).
- Confirm availability coverage across the same rolling 365 days from the authoritative
  inventory calendar.
- Configure specials, packages and add-ons if applicable.
- Set commission / billing configuration and the ROL'OS PMS subscription tier.

Exit check: policy, payment, pricing-365 and availability-365 counters all green.

## Macro 6 — Distribution identity & publish

Goal: the property is published to the distribution layer with a stable identity.

- Reach **100% mandatory readiness** — the "Push" action stays disabled below 100%.
- Create or link the owner sub-account (distribution identity) for the property.
- Capture and verify the sub-account API key pair (per identity, never shared master keys).
- Push the property. Multi-unit properties fan out to one listing per unit.
- Persist the returned listing IDs canonically; re-push must update, never duplicate.
- Register live notification subscriptions for the account and every sub-account.
- Order the Minimum Content Quality check and confirm it passes.
- Push availability and pricing for the full 365-day horizon and read both back to verify.
- Confirm reservation ingestion works end to end: pull, ingest, re-ingest (no duplicates),
  cancel, modify.

Exit check: one stable listing per unit, notifications subscribed, quality check passed,
ARI read-back matches, test reservation ingests cleanly.

## Macro 7 — Connect channels (final step)

Goal: the owner activates the sales channels they want to trade on.

- Confirm the Channel Manager entitlement is enabled on the property's billing config.
- Open **ROL'OS → Channels**; the Channel Manager loads in-page.
- Confirm the sub-account session resolves (no pending sign-in state).
- Review the readiness badge on each channel card; a card below 100% deep-links to the exact
  outstanding fields.
- Connect channels one at a time, supplying any channel-specific identifiers requested.
- Verify per channel: listing visible, availability and pricing coverage present,
  quality check passed.
- Confirm the first inbound test reservation from the channel writes a booking and blocks
  availability.
- Record the connection in the portfolio channel roll-up.

Exit check: each intended channel shows connected, eligible, and last-push timestamped.

---

## Gating summary

```text
1 Identity  →  2 Location  →  3 Rooms  →  4 Media  →  5 Policies & Rates
                                                            │
                                                            ▼
                                              6 Distribution identity & publish
                                                            │
                                                            ▼
                                                  7 Connect channels
```

Nothing in Macro 6 may be attempted before mandatory readiness is 100%, and Macro 7 is only
opened once the property is published, quality-checked and ARI-verified.
