# ROL'OS + HubSpot: Connect marketing push + feature brochure

Two deliverables: a full sales-pitch presence for the HubSpot CRM module across the public Connect site, and a hyper-detailed, on-brand PDF brochure that can win over a property with a CRM problem.

## 1. New Connect page: "ROL'OS + HubSpot"

New page at `/connect/hubspot`, linked from the Connect top nav (under Integrations), the footer, and cross-linked from Features, Integrations, Pricing and FAQ.

Page sections, in order:

1. **Hero** — "Your CRM has no idea who your guests are. ROL'OS does." Free-with-ROL'OS badge, primary CTA to Get Started, secondary CTA to download the brochure PDF.
2. **The CRM problem** — three honest pain cards: guest data trapped in the PMS, sales team working off spreadsheets, no idea which agent or channel actually produced revenue.
3. **The powerhouse pairing** — ROL'OS as the operational system of record (bookings, inquiries, stays, spend, check-ins, feedback), HubSpot as the sales and marketing surface. One diagram: ROL'OS foundation -> normalised guest identity -> HubSpot contacts / companies / deals.
4. **How it works in four steps** — opt in per owner, paste a private app token, connection is verified live, delta sweep keeps everything current. Plainly stated: opt-in, one portal per owner covering the whole portfolio, off by default.
5. **What lands in HubSpot** — a table mapping ROL'OS objects to HubSpot objects: guest -> contact (with stay history, lifetime spend, last stay, nationality, preferences), trade partner -> company, booking -> deal with stage movement, website inquiry -> deal in the New..Lost pipeline, check-in and feedback -> contact properties and timeline.
6. **Segmentation that is already done for you** — Trade vs Direct, repeat, lapsed, high-value; explains that these flags are derived by ROL'OS, not hand-tagged in HubSpot.
7. **What it makes easy** — day-in-the-life vignettes: follow up on an unconverted inquiry, re-target lapsed guests before low season, give a trade agent their own company record with real production numbers, run a win-back campaign off real spend.
8. **Trust and control** — token stored encrypted server-side and never returned to the browser, isolated adapter that cannot touch calendars or availability, one-click disconnect, no extra cost, no plan gating.
9. **FAQ strip + closing CTA** with the brochure download.

Also updated:
- `ConnectIntegrations`: HubSpot added as a first-class card ("Owner CRM add-on — free") plus a dedicated banner linking to the new page.
- `ConnectFeatures`: a "Guest CRM & HubSpot" feature entry in the Integration section.
- `ConnectPricing`: an "included free" line for the HubSpot add-on.
- `ConnectFAQ`: two HubSpot questions.
- SEO: title/description, canonical, and JSON-LD for the new page.

## 2. PDF brochure

A multi-page (target 10-14 page) brochure generated with a Python/ReportLab script, styled in Equatorial Luxe: pink `#E91E8C`, charcoal `#1A1A2E`, ivory, ROL'OS wreath logo, Italiana-style display headings with a clean sans body.

Page flow:
1. Cover — ROL'OS + HubSpot, tagline, brochure subtitle.
2. Executive summary — the pitch in six lines.
3. The CRM problem for accommodation businesses.
4. Why generic CRM projects fail without an operational foundation.
5. The architecture — ROL'OS data foundation feeding HubSpot (diagram).
6. Object mapping table — ROL'OS to HubSpot, field by field.
7. Inquiry to booking lifecycle, with pipeline stages.
8. Guest identity and history rollup: how stays, spend and recency are derived.
9. Trade vs Direct segmentation and what it unlocks commercially.
10. Digital check-in and post-departure feedback feeding the CRM.
11. Setup walkthrough with the four steps and what "test connection" proves.
12. Security, isolation and data control.
13. What it costs (free, opt-in) and comparison against a bolt-on CRM project.
14. Closing page with contact and `sleepinafrica.roomsonline.co.za` links.

Output: written to `/mnt/documents` for download and copied to `public/docs/` so the Connect page CTA serves it. Every page will be rendered to images and visually inspected before delivery, with issues fixed and reported.

## Technical notes

- Content only reflects what is actually implemented: `owner_integrations` with encrypted tokens, `hubspot-api` edge function actions, `cron-hubspot-sync` 15-minute delta sweep, `is_trade` derivation, `rolos_inquiries`, guest check-in and feedback records, `rebuild_guest_stats` rollups. No invented capabilities and no invented pricing.
- Connect pages follow existing conventions: `connectPath()` for links, framer-motion `fadeUp` variants, semantic design tokens only (no hardcoded colour utilities), lazy route registration in `App.tsx` alongside the other Connect routes.
- No backend, schema or edge function changes; brochure generation happens in the sandbox, not in app code.
