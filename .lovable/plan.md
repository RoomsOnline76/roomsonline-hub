
## Goal
Surface a lightweight, commission-only option on `/connect/pricing`: **WBE / Widgets / WordPress** — commission from **2%** (negotiable).

## Change
Edit `src/pages/connect/ConnectPricing.tsx`:

1. Add a new callout card **above the three subscription tiers** (Starter / Professional / Enterprise) so it reads as a distinct, no-subscription option rather than a fourth column that breaks the existing 3-card grid.
   - Title: **WBE, Widgets & WordPress**
   - Headline price: **From 2% commission** · badge "Negotiable"
   - Sub: "No monthly fee. Pay only when you get a booking."
   - Bullets:
     - Embed the ROL booking engine (WBE) on any site
     - WordPress plugin + shortcodes
     - Availability & booking widgets
     - Commission negotiable for volume / portfolios
   - CTA: "Talk to us" → `/connect/get-started`

2. Add a matching row to the **"What Others Charge"** comparison table:
   - Feature: "Booking widget / WBE (commission-only)"
   - Typical: "5–15% + setup fees"
   - ROL'OS: "From 2% · negotiable"

3. Update the hero sub-copy to hint that a commission-only option exists alongside the subscription plans (one short sentence).

No changes to billing config, backend, or subscription tiers — this is pricing-page presentation only.
