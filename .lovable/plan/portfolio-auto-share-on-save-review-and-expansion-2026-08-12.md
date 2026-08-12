# Portfolio auto-share on save — review and expansion

## What already happens today

Location & Identity has a **Portfolio Commons** card with an *auto-share on save* switch. When it is on, saving a property pushes its completed values into the blanks of every sibling property in the portfolio (never overwriting a populated field, never pushing a blank).

Groups currently covered:

| Group | Contents |
| --- | --- |
| Legal entity & company profile | Registered name, registration/VAT number, postal address, key representative, mobile, channel company profile |
| Banking & payout | Bank, account, branch, holder, confirmation letter |
| Contacts | Reservations, after-hours, emergency, other contact rows |
| House rules & check-in/out | Arrival/departure windows, smoking/pet/child rules, quiet hours |
| Locale | Country, timezone, currency |
| Distribution defaults | Channel location ID, accepted payment methods |

Separately there are one-off "Copy to portfolio" buttons for company information, branding, contacts, charges, specials, policies and vouchers — those stay as they are.

## What to add

Add these as new commons groups so they participate in both manual share and auto-share on save. Each is a separate checkbox, so an owner can exclude anything property-specific.

1. **Cancellation & reservation policy terms** (recommended) — the manually authored cancellation ladder and the selected reservation policy set used in checkout and channel pushes.
2. **Arrival, departure & changeover rules** (recommended) — master arrival policy text/instructions, changeover master and changeover rules. This is the current top source of repeated typing and of channel push blocks on new units.
3. **Star rating, accommodation label & property class** (recommended) — star rating, accommodation label, self-catering flag and master property/unit type used for channel object types.
4. **Guest-facing narrative defaults** (recommended) — brand voice, area/destination description, directions text and "additional sources" URLs used by TOBI writers. Property-specific descriptions are not touched, only the shared area/brand-level fields.
5. **Meal plans & F&B defaults** (recommended) — meal types, breakfast options and meal-type suggestions.
6. **Facilities & safety baseline** (recommended) — portfolio-wide facilities and safety/security amenity flags, merged additively so a property never loses a facility it has.
7. **Payment & invoicing presentation** (recommended) — payment providers enabled, reservation-only vs paid mode intent, banking block shown on invoices, invoice footer notes.
8. **Channel content commons** (mandatory-tier) — channel image tags policy, channel payment methods, licence/registration text and other repeated channel content fields that currently block readiness one property at a time.

Groups 1, 2 and 8 clear readiness requirements, so the card's coverage badges should list them under the requirements they satisfy.

## Behaviour rules (unchanged, applied to the new groups)

- Blank never overwrites populated; objects merge key-by-key.
- Auto-share only pushes outward on save. Pulling into the current property stays an explicit "Fill from portfolio" action, so a deliberately cleared value is never silently restored.
- Facilities/amenity sets merge additively (union), never subtractive.
- Auto-share respects portfolio membership only; archived/inactive siblings are skipped.

## Feedback after save

When auto-share runs on save, replace the current generic toast with a short summary: how many siblings were updated and which groups were filled, with a "review" link that opens the Portfolio Commons card expanded. Silent no-ops stay silent.

## Technical notes

- `src/lib/portfolioCommons.ts`: extend `PORTFOLIO_COMMONS_GROUPS` with the eight new groups and add their field specs to the `FIELDS` registry (`amenities` paths, `deep: true` where the value is an object). Add a union-merge mode for facilities/amenity arrays instead of the existing scalar/deep merge.
- Policy and charge tables (`rolos_policies`, `property_charges`) are row-based, not amenity fields — handle them like `property_contact_details` does today, via a dedicated per-group apply step keyed on a natural key rather than the column/amenity registry.
- `PortfolioCommonsCard.tsx`: render the new groups with their tier badges and coverage counts; no layout change beyond the extra rows.
- `runAutoShare` already iterates all groups, so new groups are picked up automatically once registered; extend its return value with per-group counts to drive the save toast.
- No schema change required; commons auto-share flag stays in `property_portfolios.metadata.commons.auto_share`.
