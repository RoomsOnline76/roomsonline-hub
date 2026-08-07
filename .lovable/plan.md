# ROL'OS Rate Plans — the single rate configurator

Turn `Rate Manager → Rate Plans` into the one place a ROL'OS property's rates are authored: base pricing, per-season pricing, restrictions, linked units, and a live effective-rate preview. The Calendar keeps owning *when* seasons happen; Rate Plans owns *what they cost*.

## What the page becomes

**List view** — a card per rate plan showing name, short description, a pricing summary ("Base R1 200 · 3 seasons priced"), linked unit count, min stay, and an active toggle. Header holds `+ New Rate Plan` and `Sync to Others` (copy a plan, its season pricing and its restrictions to sibling properties in the portfolio — same pattern already used in the admin Rate Manager).

**Edit view** — one screen, five plain sections, no nested wizards:

1. **Basics** — name, code, description, pricing model, base rate, cancellation policy link, active toggle.
2. **Pricing by Season** — a table with one row per season read from the Calendar. Each row takes either an absolute rate or a differential (`+R150` / `+10%`) off the base. Seasons are listed read-only with their dates; they cannot be created or edited here.
3. **Restrictions** — min stay, max stay, advance-booking minimum and maximum (days before arrival).
4. **Linked Units** — multi-select of the property's room types, each with an optional per-unit differential (amount or percent).
5. **Live Preview** — a compact 30-night calendar strip per linked unit showing the resulting nightly rate and which tier produced it, recalculated as the form changes.

## Where seasons come from

Calendar seasons live in the property record and are painted only by the existing Calendar UI, which this work does not touch. A read-only sync mirrors those seasons into the shared-seasons table when the page loads, so the Pricing-by-Season table always reflects exactly what the Calendar shows. The mirror never writes back to the Calendar.

## Keeping existing booking and ARI identical

This is the part that decides whether the page is safe. Every save writes three places in one transactional flow:

- the new relational model (plan, plan season rates, unit links, restrictions),
- the legacy relational mirror (already handled automatically by the database trigger added earlier),
- the Calendar season-rate buckets that today's booking engine, ARI and channel push actually read.

Because the Calendar season rate outranks the plan season rate in the resolver, skipping the third write would mean edits made here silently do nothing for live bookings. So a save is only reported as successful once all three agree.

## Verification

- Save one plan, then re-read the served rate through the live booking path and confirm the number matches the preview exactly.
- Re-run the parity gate (`scripts/verify-rate-compat.sql`) plus the pricing unit tests; all properties stay in `legacy` resolution mode, so no served price can change except the one the user just authored.
- Compare a spot booking quote and a channel rate push before and after a no-op save (open a plan, save without changes) — both must return byte-identical numbers.

## Manual walkthrough checklist

1. Open a ROL'OS property → Rate Manager → Rate Plans; confirm existing plans render as cards with correct linked-unit counts.
2. Create a plan: name, per-room model, base rate, min stay 2, link two units.
3. Confirm the Pricing-by-Season table lists the Calendar's seasons with correct dates and no edit affordance on the dates themselves.
4. Price two seasons — one absolute, one as a percent differential.
5. Give one linked unit a `+R200` differential.
6. Check the live preview: off-season nights show base, season nights show the authored/derived rate, and the differential unit prices higher.
7. Save, reload, and confirm every value round-trips.
8. Open the public booking page for those dates and confirm the quoted nightly rate equals the preview.
9. Run `Sync to Others` onto a sibling property and confirm plan, season pricing and restrictions all landed.
10. Confirm the Calendar still paints seasons exactly as before.

## Technical notes

- Page: `src/pages/pms/PMSRatePlans.tsx` splits into a list component plus `RatePlanEditor` with one child component per section, kept under the file-size rule; form state moves to `useReducer`.
- Preview uses the existing pure engine (`supabase/functions/_shared/ratePricing.ts`) through a thin new edge function so the UI and the booking path share one implementation rather than duplicating pricing logic in the browser.
- Additive migration needed: `min_advance_days` / `max_advance_days` on `rolos_rate_plans` (no advance-booking store exists today), and a shared-season upsert helper. No column is dropped or renamed.
- Restrictions write to `rolos_stay_restrictions` with `source = 'rate_plan'` and mirror min/max stay onto the plan row, which is what the current resolver and channel push read.
- Existing rate editors in the admin property form become read-only for ROL'OS properties with a link through to this page, so there is a single authoring surface.
