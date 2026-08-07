# Choosing which rate plan is the live rate and which goes to channels

## How it works today

Right now there is **no way to configure this**. When a unit is linked to more than one active rate plan, the pricing engine silently picks a winner:

- For the base/fallback rate it keeps the plan with the **highest base rate** for that unit.
- Season prices from *all* plans linked to that unit are merged into one pool, so a cheaper plan can win on some nights.
- The channel push (Rentals United / OTAs) uses the **same** engine as the website/checkout, so you cannot send a different rate to channels than the one you sell directly.

Nearly every property today has a single plan, so this has not bitten yet. One property already has two plans, which is exactly the ambiguous case.

## What to build

Make plan selection explicit and visible.

### 1. Plan role settings (per rate plan)

Add three settings to each rate plan:

- **Primary sell plan** — this is the plan used for live direct rates (website, embed, checkout). Exactly one primary per property.
- **Send to channels** — on/off. Only plans with this on are considered for the channel push.
- **Priority** — a number used to break ties when several plans are eligible for the same unit and night (lower number wins).

### 2. Rate plan editor

New "Distribution" block in the editor:

- "Use as the live/direct rate" toggle (turning it on moves the flag off whichever plan held it).
- "Send this plan to channels (Channel Manager / OTAs)" toggle.
- Priority field, shown only when the property has more than one plan.

### 3. Rate plan cards

Badges so the answer is visible at a glance:

- **Live rate** on the primary plan.
- **Channels** on plans pushed to distribution.
- A warning line when a unit is linked to two or more plans and none is marked primary, with a "make this the live rate" shortcut.

### 4. Pricing engine

- Selection order becomes: primary plan → priority → base rate (current behaviour only as last resort), instead of "highest base rate wins".
- Season prices are read from the selected plan for that unit rather than merged across all plans.
- The resolver takes an audience argument: `direct` for booking/checkout, `channels` for the Rentals United push, so the channel push only ever prices from channel-enabled plans and falls back to the primary plan when none is flagged.

### 5. Safety

- Existing single-plan properties are auto-marked primary + channels on, so nothing changes for them.
- If a property somehow ends up with no primary, the engine falls back to today's behaviour and the card shows the warning instead of failing a booking.

## Technical notes

- Migration on `rolos_rate_plans`: `is_primary_sell boolean default false`, `push_to_channels boolean default true`, `sell_priority int default 100`; partial unique index on `(property_id) where is_primary_sell`; backfill the single active plan per property as primary.
- `supabase/functions/_shared/rateResolution.ts`: replace the `existing.base_rate >= base` winner rule with a comparator on `is_primary_sell`, `sell_priority`, then `base_rate`; scope `planSeasonRates` to the winning plan; add `opts.audience`.
- `supabase/functions/_shared/ratePricing.ts`: no formula changes, only the plan it receives.
- `push-property-to-ru` (and the ARI refresh cron) call `createRateResolver` with `audience: "channels"`.
- Frontend: `ratePlanDraft.ts` (new draft fields), `RatePlanEditor.tsx` (Distribution block), `RatePlansSurface.tsx` (badges + warning), `rolos-rate-plans` edge function for the save path and the "make primary" action.
- Unit tests for the new selection order: primary wins over higher base rate, priority tie-break, channel audience filtering, single-plan fallback.
