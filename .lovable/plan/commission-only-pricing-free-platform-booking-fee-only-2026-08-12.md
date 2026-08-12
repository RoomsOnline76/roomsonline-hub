# Commission-only pricing: free platform, booking fee only

Realign the public Connect pages and the admin billing defaults with the new commercial strategy: ROL'OS is free to run, revenue comes only from a booking fee on OTA-listed and widget/embed bookings, and everything in the system is included.

## The message

- **Free for the first 60 days**, then still free to run — no monthly subscription, no setup fee, no per-user or per-room fee.
- **You only pay a booking fee** on bookings that come through ROL OTA/channel listings and the widget/embed booking engine. Described as "competitive and surprisingly low", negotiable for volume and portfolios. No published percentage.
- **Full system support is free** — onboarding, training, and email/assistant support.
- **Everything included**, spelled out in the promo lines: ROL'OS PMS and front desk, White Label branding and your own booking domain, Revenue Management and yield tools, Channel Manager and OTA distribution, WordPress plugin and booking widgets, Developer REST API and webhooks, Guest CRM, rates/seasons/rate plans, packages, specials and promo codes, groups and events, folio, invoicing and VAT handling, refund register, housekeeping and maintenance boards, night audit, reviews and reputation monitoring, portfolio analytics and revenue pulse, TOBI assistant, guest journeys, mobile apps, multi-property portfolio management.

## Page changes

**Pricing page (`ConnectPricing.tsx`)** — rebuilt around one offer:
- Hero: "Free to run. You only pay when we bring you a booking." Badge: "60 days free · then still free to run".
- Single primary offer card replacing the four room-count tier cards: what's free, what the booking fee applies to, negotiable note, CTA.
- "Everything included" grid expanded to the full capability list above, grouped (Operate / Distribute / Get paid / Grow) so it reads as breadth, not a list of 15 items.
- Remove the four priced add-on cards (Basic Branding, White-label, PriceLabs, BYO Gateway) — these are now included. Keep one small footnote that third-party pass-through costs (e.g. an external revenue-management licence or your own payment gateway's fees) are billed at cost where they apply.
- Comparison table reframed: "Typical PMS cost" vs "ROL'OS: included" for PMS, channel manager, API, revenue management, white label, assistant, reviews, splits.
- Guarantees: 60 days free, no subscription, no lock-in, cancel anytime and keep your data, full export.

**Home / Features / FAQ / Get Started** — align headline and supporting copy:
- Replace "Negotiable Pricing / Fixed tiers only" comparison row and any tier or monthly-fee references with the free-to-run + booking-fee framing.
- Get Started page: trial copy becomes "Free for 60 days, then free to run — you only pay a booking fee when we deliver a booking."
- FAQ: add/adjust entries for "What does it cost?", "What is the booking fee?", "Do I pay for White Label / Revenue Management / Channel Manager?" (no), "What happens after 60 days?".

## Admin billing defaults

Add a new default preset representing the strategy and make it the one new properties inherit:
- No monthly subscription, no setup fee, no room-count tiers.
- Booking fee enabled for OTA/channel and widget/embed bookings; percentage stays admin-editable, not shown publicly.
- Add-on monthly fees (branding, white label, revenue management) set to zero/none so they stop appearing as chargeable lines on new properties.
- Existing per-property billing configs are left untouched — properties already on a subscription keep their current terms until an admin changes them.

## Technical notes

- `usePublicPricing.ts` / `public_pricing_defaults` currently drives tier and add-on prices into the pricing page. The tier and add-on consumers are removed; the hook keeps returning the booking-fee rate for internal/admin use, and the public page renders no numeric monthly prices.
- Migration updates the single `billing_global_defaults` row family: null out `default_subscription_fee` and `tier_pricing_json` on the ROL'OS preset, zero `branding_addon_monthly_fee`, `white_label_monthly_fee`, `pricelabs_monthly_fee`, `byo_gateway_monthly_fee`, and set the preset name/description to the new model. `AdminBillingDefaults.tsx` labels and the summary line in `StrategySummaryLine.tsx` are updated to describe the booking-fee-only model.
- No change to invoicing, commission resolution, or settlement logic — only defaults and copy.
