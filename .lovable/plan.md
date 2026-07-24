## 1. Mobile-first pass across all /connect pages

Goal: every page reads and works well on a 360-390px phone first, then scales up. Nothing here changes business logic — layout, spacing, and typography only.

Pages in scope (all under `src/pages/connect/`):
ConnectHome, ConnectFeatures, ConnectPricing, ConnectIntegrations, ConnectAbout, ConnectFAQ, ConnectDocs, ConnectGetStarted, ConnectQuickstart, ConnectJournal, ConnectWordPress, ConnectPrivacyPolicy, ConnectTermsOfService — plus the shared `ConnectLayout`.

Standard adjustments applied consistently:

- **Section padding**: replace `py-20`/`py-16` with `py-12 sm:py-16 lg:py-20` so phones don't get 5rem of empty space between blocks.
- **Container padding**: keep `px-4 sm:px-6 lg:px-8` but audit each page (a few use `px-6` only).
- **Headings**: drop starting size — `text-4xl sm:text-5xl` → `text-3xl sm:text-4xl lg:text-5xl`. Hero H1s: `text-3xl sm:text-4xl md:text-5xl lg:text-6xl`. Body copy at `text-base sm:text-lg`.
- **Grids**: any `grid sm:grid-cols-2 lg:grid-cols-N` stays, but tighten `gap-8`/`gap-12` to `gap-4 sm:gap-6 lg:gap-8`. `grid md:grid-cols-2` on hero splits becomes `grid gap-8 md:grid-cols-2`.
- **CTAs**: hero button rows use `flex flex-col sm:flex-row gap-3 w-full sm:w-auto` and buttons get `w-full sm:w-auto` so they don't overflow on 360px.
- **Comparison tables** (ConnectHome, ConnectPricing add-ons): wrap in `overflow-x-auto -mx-4 px-4` and shrink first column to `min-w-[160px]` so they can scroll horizontally on phones instead of squashing.
- **ConnectPricing tier cards**: current `grid sm:grid-cols-2 lg:grid-cols-4` stacks acceptably; add `text-2xl sm:text-3xl` on price numbers and ensure the "highlighted" tier's ring doesn't clip on mobile (add `p-1 sm:p-0` around card group).
- **ConnectLayout header**: mobile CTA — current "Get Started" is `hidden sm:block`. Move it into the mobile menu drawer as a full-width primary button so phones get a visible CTA. Increase menu row tap targets to `py-3`. Keep sticky header.
- **Tobi widget** (`ConnectTobiWidget`): audit the floating panel — pin it to `inset-x-3 bottom-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px]` and give the chat body a `max-h-[70svh]` so it never covers the keyboard on iOS. Composer uses safe-area padding: `pb-[max(0.75rem,env(safe-area-inset-bottom))]`.
- **ConnectDocs**: long code blocks get `overflow-x-auto` and `text-xs sm:text-sm` inside `<pre>` so they scroll horizontally rather than force page-wide zoom.
- **ConnectPrivacyPolicy / ConnectTermsOfService**: constrain prose to `max-w-3xl` (already partly done), size headings down for mobile, tighten `space-y-*` between sections.

No content or copy changes — just responsive class tweaks.

QA: after the pass I'll set the preview to mobile and spot-check ConnectHome, ConnectPricing, ConnectIntegrations, and the Tobi widget in the mobile viewport.

## 2. Refresh Tobi (Connect assistant)

The system prompt in `supabase/functions/connect-assistant/index.ts` is stale — it still says "Starter R1500 / Professional R4500 / Enterprise custom" and doesn't know about the current billing model. Two changes:

**a. Rewrite the system prompt** to reflect what's actually shipping:

- PMS subscription is **room-count tiered** — Starter (0–9), Medium (10–19), Large (20–50), Enterprise (51+). Prices come from `billing_global_defaults` at runtime, not hard-coded.
- Billing strategies now supported in the Billing Config Builder: **Commission-only**, **PMS subscription (tiered)**, **WBE flat commission** (2 %+ negotiable, widgets/WordPress only), **Portfolio-scoped billing** (single config for all sibling properties), **BYO payment gateway** (mutually exclusive with the ROL facilitator surcharge), **Payment facilitator surcharge**.
- Revenue add-ons and their fees: **White-label** (monthly + one-off setup), **Branding** (auto-on and zero-cost when White-label is on, otherwise monthly + setup), **PriceLabs revenue management** (monthly + setup, admin-gated).
- Subscription lifecycle: automated email invoices via PayFast, cancel-any-time, once-off setup fees roll into the next monthly invoice, branded PDF invoice emailed on payment.
- Portfolio billing overrides property billing — a property inside a portfolio inherits centrally.
- Remove the outdated "Commission-Based default 10%", "Volume-Tiered", and the fixed Rand amounts.

**b. Make Tobi answer with live numbers.** Extend the edge function so that before calling the model it reads the current PMS tiers and add-on defaults from `billing_global_defaults` (public read) and injects them into the system prompt as a small "CURRENT_PRICING" block. If the fetch fails it falls back to a generic phrasing that avoids specific amounts. This means the `/connect/pricing` page and Tobi always agree, and admins can change defaults without a code edit.

Optional light touch: also expose two soft "tool-style" JSON blocks the model can quote — one for tier rows, one for add-ons — so its answers can render as small markdown tables when helpful.

## Technical notes

- Only files under `src/pages/connect/`, `src/components/layout/ConnectLayout.tsx`, `src/components/connect/ConnectTobiWidget.tsx`, and `supabase/functions/connect-assistant/index.ts` are touched.
- `connect-assistant` stays on `google/gemini-3-flash-preview` with streaming (as today); we add one Supabase client fetch at the top for `billing_global_defaults` (anon read — the table already permits it).
- Deploy `connect-assistant` after edits.
- No DB migrations. No changes to booking, PMS, or checkout code.

```text
mobile-first responsive rhythm
┌──────────────────────────────┐   phone
│ py-12  text-3xl   grid-1    │
├──────────────────────────────┤   sm ≥640
│ py-16  text-4xl   grid-2    │
├──────────────────────────────┤   lg ≥1024
│ py-20  text-5xl   grid-4    │
└──────────────────────────────┘
```
