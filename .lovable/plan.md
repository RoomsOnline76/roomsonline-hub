

# Revamp Connect Portal — Hard-Sell for PMS-less Properties + TOBI Attention Animation

## Objective
Reposition the Connect portal to aggressively target properties that have **no PMS** and need an enterprise-grade solution at an unbeatable price. Emphasize value-for-money, flexible/negotiable pricing, extended free trials, live demo access, and TOBI as a standout AI assistant. Make the TOBI widget cat icon strobe/pulse to draw attention.

---

## Changes

### 1. ConnectHome.tsx — Complete hero & content rewrite

**Hero section:**
- New headline: "Running Your Property on Spreadsheets? There's a Better Way."
- Subheadline emphasizing: enterprise features at a fraction of enterprise cost, no PMS needed to get started
- Add a "See ROL'OS Live" demo button linking to a demo property showcase or interactive walkthrough
- Add trust line: "60-day free trial. No credit card. No lock-in contracts."

**Replace AUDIENCES cards** with a problem/solution narrative:
- "What you're doing now" (manual bookings, WhatsApp confirmations, no revenue tracking) vs "What ROL'OS gives you" (automated everything, AI assistant, channel management)
- Real examples: "A 12-room guesthouse in Stellenbosch saved 15 hours/week" style social proof

**Add new "More Than You Expect" section:**
- Comparison table: ROL'OS vs typical PMS competitors on price + features
- Highlight that ROL'OS includes features others charge extra for (channel manager, API access, white-label, AI assistant)

**Add TOBI spotlight section:**
- Dedicated card/banner: "Meet TOBI — Your 24/7 AI Operations Manager"
- Cat icon motif, description of what TOBI does (night audits, guest queries, revenue insights, booking assistance)
- "Try TOBI now" button that opens the widget

**Update stats bar:** Replace API-focused stats with property-manager stats:
- "60-day Free Trial", "R 0 Setup Fee", "24/7 AI Assistant", "Negotiable Plans"

### 2. ConnectPricing.tsx — Aggressive value messaging

**Hero rewrite:**
- "Enterprise Power. Startup Pricing." / "You'll Think We Made a Mistake on the Price."
- Emphasize negotiable structures, volume discounts, custom plans

**Update tiers:**
- Extend free trial from 30 to 60 days across all plans
- Add "Negotiable" badge on Professional and Enterprise tiers
- Add per-feature cost comparison vs competitors (e.g., "Channel manager included — others charge R 2,000+ extra")
- Add a "What Others Charge" comparison row beneath the cards showing typical PMS costs

**Add "Risk-Free Guarantee" section:**
- 60-day trial, month-to-month billing, no setup fees, cancel anytime, data export included

### 3. ConnectFeatures.tsx — Reframe for non-technical property managers

**Hero rewrite:**
- "Everything Your Property Needs. Nothing It Doesn't."
- Focus on operational pain points, not technical capabilities

**Add "Day in the Life" narrative section:**
- Morning: housekeeping board auto-assigns rooms
- Check-in: guest folio created automatically
- Evening: TOBI runs night audit
- End of month: revenue reports ready

**Add demo screenshots/mockup section:**
- Reference key PMS screens (calendar, housekeeping board, folio, TOBI chat)
- Use placeholder cards describing each screen with "See it in action" CTAs

### 4. ConnectTobiWidget.tsx — Strobing cat icon animation

**Floating button changes:**
- Replace `MessageCircle` icon with `Cat` icon (already imported)
- Add a CSS pulse/strobe animation: glowing ring that pulses outward every 2-3 seconds
- Add a small floating label on first visit: "Chat with TOBI" that fades after 5 seconds
- Use `animate-pulse` combined with a custom `ring` animation for the strobe effect

```text
┌──────────────────────┐
│          🐱          │  ← Cat icon with pulsing glow ring
│   "Chat with TOBI"   │  ← Label that fades after 5s
└──────────────────────┘
```

### 5. ConnectGetStarted.tsx — Warmer, less technical

- Change "Submit Inquiry" to "Start My Free Trial"
- Add reassurance: "No contracts. No setup fees. Cancel anytime."
- Change "Current PMS" field placeholder to include "None — I'm just getting started"
- Add a "Flexible pricing" note: "Every property is different. We'll build a plan that fits your budget."

---

## Files

| Action | File |
|--------|------|
| Rewrite | `src/pages/connect/ConnectHome.tsx` |
| Rewrite | `src/pages/connect/ConnectPricing.tsx` |
| Rewrite | `src/pages/connect/ConnectFeatures.tsx` |
| Modify | `src/components/connect/ConnectTobiWidget.tsx` — Cat icon + strobe animation |
| Modify | `src/pages/connect/ConnectGetStarted.tsx` — warmer copy + flexible pricing note |

No database changes needed.

