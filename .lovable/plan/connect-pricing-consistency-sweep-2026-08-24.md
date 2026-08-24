# Connect pricing consistency sweep

The 60-day story is in place on the main pricing pages, but a few surfaces still read as "free forever". This pass closes the remaining gaps and corrects the stored admin preset copy.

## Confirmed rules for this pass

- Setup fee: waived only if you start in the 60-day free period; otherwise quoted on your agreement.
- Subscription: R 0 for the first 60 days, then billed per your agreement.
- No amounts published on public pages.

## Page-by-page fixes

**ConnectHome.tsx**
- Stats: "R 0 Monthly Fee" and "R 0 Setup Fee" become trial-scoped ("R 0 / first 60 days", "No setup fee in your first 60 days").
- Comparison row "No Monthly Subscription" becomes "No subscription for your first 60 days", with the note kept for other providers.
- Closing block: "no setup fee" becomes "no setup fee when you start in your 60 days"; badge row wording aligned.

**ConnectPricing.tsx**
- Free-period bullet: "No subscription, no setup fee and no per-room charge in that period" — keep, but make the setup-fee scope explicit ("no setup fee when you start in this period").
- Comparison table row "Setup fee — None" becomes "Waived if you start in your 60 days".
- Guarantees list: setup/subscription lines scoped to the trial; keep no lock-in, data export, free onboarding/support.

**ConnectGetStarted.tsx**
- "no subscription and no setup fee" scoped to the free period.

**ConnectIntegrations.tsx**
- HubSpot card keeps "Free" (genuinely free). The generic "Included free" badge on the HubSpot spotlight stays, but adapter/status labels are checked so no adapter implies the whole platform is free.

**ConnectHubSpot.tsx**
- "Included free with ROL'OS" stays (HubSpot owner CRM is free), with one clarifier that it is the CRM add-on that carries no fee — not the wider platform after day 60.

**ConnectFeatures.tsx / ConnectFAQ.tsx / ConnectAbout.tsx / ConnectWordPress.tsx / ConnectTermsOfService.tsx**
- Final read-through; adjust only lines that still imply permanent free use or an unconditional zero setup fee.

## Admin preset copy

- Correct the billing-defaults preset short description that reads "Free for the first 60 days and free to run thereafter. No subscription, no setup fee, no room-count tiers..." so it states: full stack free for 60 days (setup fee waived when starting in that period), booking fee payable throughout, subscription and chosen add-ons from day 61.

## Technical notes

- Copy-only in `src/pages/connect/*`; no billing logic or schema change.
- The preset description is stored data in `billing_global_defaults` and is updated with a single data update, not a schema migration.
- Semantic tokens and existing motion/section structure untouched.
