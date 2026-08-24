# Connect portal: publish the hybrid / volume gateway schedule

The new payment-processing schedule (`gateway_billing_configs`) now drives what the invoice run charges and what a contract quotes. Connect — the public face that sets expectations before an owner signs — still describes card processing as a flat cost pass-through, which the active schedule contradicts.

## What the pages say today (verified)

- The seeded active schedule is **hybrid**: 3.9% + R2.50 under R50k monthly volume, 3.6% + R2.00 to R250k, 3.4% + R1.50 above that, no monthly platform fee.
- `ConnectFAQ.tsx` (the "Are payment gateway fees included in the free 60 days?" answer) and `ConnectPricing.tsx` lines 220-221 / 254 / 315 all state gateway fees are the acquirer's costs "passed through to you at cost". With a 3.9% headline over a 3.2% acquirer cost that is no longer accurate — this is the main correction, not just an omission.
- Neither Pricing nor Features nor FAQ mentions volume tiers, and no Connect page shows a gateway rate at all.
- `ConnectDocs.tsx`, `ConnectQuickstart.tsx` and `ConnectIntegrations.tsx` carry no fee claims (only the HubSpot "no fee" badge, which is correct) — nothing to fix there beyond a pricing link.
- `connect-assistant` already builds a live `CURRENT_PRICING` block from `billing_global_defaults` with a service-role client and is instructed never to guess amounts. It has no gateway-schedule knowledge.

## What to build

### 1. One public source for the numbers

`gateway_billing_configs` is readable by signed-in users only, and Connect is anonymous. Add a small public edge function that returns the **active** schedule — model, percentage, fixed fee, monthly platform fee, tier bands, currency, version — and nothing else. No table access is widened, and the response is the same shape the resolver already uses.

A `usePublicGatewaySchedule()` hook feeds the Pricing page, the FAQ answers and the Features card, so no percentage is typed into a component. If the endpoint is unavailable, the pages fall back to prose ("the schedule in your agreement applies") rather than a stale number.

### 2. Pricing page

- New **Payment processing** section, distinct from the platform/booking-fee section: it applies only when the property takes payments through the RoomsOnline gateway.
- Tier table rendered from the live schedule: monthly card volume band, percentage, per-transaction fee, plus the monthly platform fee line when the active schedule has one.
- "How it works" note: fees are calculated on the schedule below, the band is set by trailing monthly card volume and moves automatically, and **the rate in your signed contract is the rate that is applied**.
- Correct the pass-through claims: card processing on our gateway is charged on this schedule; only a bring-your-own gateway leaves the acquirer's fees with your own provider.
- Keep the bring-your-own comparison — own merchant account (their acquirer's rate, ROL gateway add-on from day 61) versus our gateway (this schedule, nothing to negotiate with an acquirer).
- The 60-day story is unchanged and stays explicit: processing fees are payable during the free period.

### 3. FAQ

Add or rewrite: what the gateway costs, how volume tiers work, whether there is a monthly fee, whether you can keep your own merchant account, and whether the contract rate matches the website. Every number comes from the live schedule; the existing "at cost" answer is replaced.

### 4. Features

The payments card gains hybrid pricing, automatic volume-based rate reduction and contract-aligned billing, with a link to Pricing and no hard-coded amounts.

### 5. Get Started

A line stating that commercial terms — including the payment-processing schedule — are confirmed in the contract the owner signs, linking to Pricing. No change to the request flow itself.

### 6. Connect TOBI

Extend the existing pricing block with a `GATEWAY_SCHEDULE` section read from the active config, and add a rule: quote only the published bands, never invent or interpolate a rate, and otherwise offer the exact schedule that will appear in the contract and hand off to Pricing or sales.

## Technical notes

- New edge function `public-gateway-schedule` (public, no JWT), returning the active row's commercial fields only; new hook `src/hooks/usePublicGatewaySchedule.ts` calling it; tier formatting reuses `normalizeVolumeTiers` / `summariseVolumeTiers` from `src/lib/gatewayBillingRate.ts`.
- Edited: `ConnectPricing.tsx`, `ConnectFAQ.tsx`, `ConnectFeatures.tsx`, `ConnectGetStarted.tsx`, `supabase/functions/connect-assistant/index.ts`.
- No migration, no change to `payfast-api`, ConnectLayout, routing, Docs/Quickstart content, or the Integrations page.
- Verification: confirm the rendered tier table and FAQ figures match the active `gateway_billing_configs` row and the `billing_volume_tiers_summary` contract variable, and that the assistant answers a cost question with those same bands.
