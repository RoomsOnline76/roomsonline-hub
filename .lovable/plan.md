
## Goal

Bring `src/pages/connect/ConnectPricing.tsx` in line with `Book1.xlsx` — same three plans, same feature distribution, same room/property caps (already matched in `billingTierResolver.ts`), and a fuller Optional Add-Ons section.

## Alignment with the spreadsheet

Room/property caps already match `DEFAULT_TIERS` (Starter 10 rooms / 1 property @ R1,500; Professional 50 rooms / 3 properties @ R4,500; Enterprise unlimited / unlimited). No change to `billingTierResolver.ts` or admin billing schema — the property-count gating is already in place.

The sheet moves several features between tiers relative to what the page shows today. New distribution:

**Starter (R 1,500 / month)** — up to 10 rooms, 1 property
- Booking Engine Widgets
- WordPress plugin
- Guest CRM
- Rate season management
- Revenue management & analytics
- Folio & billing system
- Housekeeping board
- TOBI AI assistant
- Email support
- Night audit automation
- Portfolio analytics dashboard

**Professional (R 4,500 / month)** — up to 50 rooms, up to 3 properties
- Everything in Starter
- Portfolio aggregator
- Channel manager (1 OTA included)
- Priority support
- Savings callout: "Channel manager alone can cost R 2,000+/mo elsewhere"

**Enterprise (Let's Talk)** — unlimited rooms / properties
- Everything in Professional
- Unlimited OTA channels
- Full API access (55+ actions)
- Custom API integrations
- Dedicated account manager
- SLA guarantee
- Savings callout: "Typically 40–60% less than comparable enterprise PMS"

White-label branding is no longer listed inside Enterprise — it moves to add-ons, matching the sheet.

## Optional Add-Ons section (new block on the page)

Rendered as a card grid below the tier cards. Each item mirrors an existing admin billing toggle so the marketing copy stays truthful:

| Add-on | Source of truth | Public copy |
| --- | --- | --- |
| Basic Branding | `branding_addon_*` | Logo, colours and typography on the hosted booking flow. |
| White-label branding | `white_label_*` | Your own booking subdomain (e.g. `book.yourdomain.com`) with full brand takeover. |
| PriceLabs Revenue Management | `pricelabs_allowed` + `pricelabs_monthly_fee` | Automated dynamic pricing pushed straight into ROL'OS (ROL'OS PMS only). |
| BYO Payment Gateway | `byo_gateway_monthly_fee` | Connect your own payment provider — ROL does not handle the funds. |

Pricing shown as "From R xxx / month — configured per property" rather than hard-coded numbers, so admin-side changes stay authoritative. A short footnote states add-ons are per property and can be enabled by ROL admin at any time.

## "What Others Charge" table

Kept, with one edit: change the "White-label branding" row so it reads "Available as an add-on" on the ROL'OS side (was "Available") to match the new positioning.

## Files touched

- `src/pages/connect/ConnectPricing.tsx` — rewrite the `TIERS` array, drop white-label from Enterprise, add an `ADD_ONS` array + section, small copy tweaks in `COMPETITOR_COSTS`. No other files change.

## Out of scope

- Admin billing schema / resolver logic (already aligned with the sheet).
- Backend `calculate-billing` — no fee changes.
- Contract templates — no wording change requested.
