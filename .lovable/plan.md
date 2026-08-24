# Correct the Connect pricing story: 60 days free, then paid add-ons

The Connect pages currently say ROL'OS is "free to run" forever and that "every module is included — nothing paywalled". That is wrong. Rewrite the commercial copy across Connect so it reflects the real model.

## The correct message

**First 60 days**
- Full ROL'OS PMS and all add-ons are available at no charge.
- You pay only the commission/booking fee on bookings taken through ROL'OS infrastructure (OTA/channel listings, widget, embed, WordPress engine).
- One exception: if you use our payment gateway, card processing fees on that gateway are payable by you, even during the free 60 days. No provider named.

**After 60 days**
- The PMS subscription begins.
- Add-ons become chargeable per the terms in your agreement: channel manager (charged per unit), white label, branding, revenue management / yield tools, bring-your-own payment gateway.
- The commission/booking fee continues on bookings delivered through ROL'OS.

No amounts are published. Each chargeable item is named, with "priced on your agreement" (or "quoted for your property") instead of a number. Volume and portfolio terms remain negotiable.

## Page-by-page changes

**ConnectPricing.tsx** — restructured into a two-phase story:
- Hero badge becomes "60 days free · then a simple subscription plus booking fee"; headline drops "free to run".
- Two cards: "Your first 60 days" (everything unlocked, booking fee only, gateway fees payable) and "From day 61" (subscription starts, add-ons as named below).
- New "What becomes chargeable after 60 days" list: PMS subscription, channel manager (per unit), white label, branding pack, revenue management, bring-your-own gateway — each with "priced on your agreement".
- "Everything included" grid keeps its capability breadth but is retitled "Everything unlocked in your first 60 days", and items that are paid add-ons after day 60 are marked as add-ons rather than "included".
- Comparison table: the ROL'OS column changes from "Included" to "Included in trial · then add-on" for the add-on rows, and "Monthly subscription: None" is corrected.
- Guarantees list loses "still free to run", "no subscription", "every module included — nothing paywalled"; keeps no lock-in, cancel anytime, keep and export your data, free onboarding and support.

**ConnectHome.tsx** — hero pill and the closing pricing block change from "Free to run — you only pay a booking fee" to "60 days free — then a simple subscription plus a booking fee". Remove "included free with every plan" claims for TOBI and other add-ons.

**ConnectGetStarted.tsx** — trial copy becomes: free for your first 60 days with only the booking fee (and gateway processing fees) payable; the subscription and any add-ons you choose start after that.

**ConnectFeatures.tsx** — Channel Manager loses "included, not extra"; closing CTA copy aligned with the new two-phase wording.

**ConnectFAQ.tsx** — corrected/added entries: "What does it cost?", "What is the booking fee?", "What happens after the first 60 days?", "Do I pay for white label / channel manager / revenue management?" (yes, after 60 days, priced on your agreement), "Are payment gateway fees included?" (no — payable by you, including in the free period), support/API entries reworded so "included" only refers to things that genuinely never carry a fee.

**ConnectHubSpot.tsx** — the HubSpot owner CRM add-on stays genuinely free and opt-in; only the surrounding "everything in ROL'OS is free" phrasing is corrected.

**ConnectIntegrations.tsx / ConnectWordPress.tsx / ConnectAbout.tsx** — sweep for any remaining "free forever", "no subscription", "nothing paywalled" phrasing and align.

**Terms of Service** — the fees clause is checked and aligned with the same two-phase description (no amounts).

## Technical notes

- Copy-only change in `src/pages/connect/*`; no billing logic, schema, or edge function changes. Admin billing defaults remain the authority for actual amounts.
- `usePublicPricing.ts` is not used to render public numbers; the pricing page stays numeric-free apart from the third-party comparison column.
- Semantic design tokens only; existing `fadeUp` motion and section structure preserved.
- Add-on names on the pricing page mirror the labels in the admin billing defaults (channel manager per unit, white label, branding pack, revenue management, BYO gateway) so sales copy and billing configuration agree.
