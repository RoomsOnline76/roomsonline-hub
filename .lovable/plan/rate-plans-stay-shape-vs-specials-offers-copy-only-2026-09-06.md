# Rate Plans stay-shape vs Specials offers — copy only

Rename and re-explain so operators stop authoring "7 nights cheaper" twice. Rate Plans owns the tariff shape (LOS / Full Stay); Specials owns campaigns on a quoted stay. **No quote math, no RU XML, no schema, no logic changes.** `deal_type` wire values stay `long_stay` / `advance_purchase` / `last_minute` — only labels change.

## 1. Rate Plans editor

**`src/components/pms/rateplans/RatePlanEditor.tsx` (~L696)**
- Card title `Longer stays` → `Stay shape`.
- Optional one-line `CardDescription`: "How this plan prices a stay as nights or guests change. Campaigns (percent off, book-early) live under Specials — they apply after this total."

**`src/components/pms/rateplans/RatePlanStayShapeSection.tsx`**
- LOS label unchanged ("Length of stay (nightly by nights)").
- Replace LOS help paragraph with: "This is the plan's nightly ladder, not a special. Checkout uses the highest matching rung. The Channel Manager receives it as stay-shape on the nightly season. A 'stay 7 nights, save 10% this winter' campaign belongs under Specials." Keep the existing Dates / event-weekend sentence.
- FSP help: keep the checkout fallthrough sentence; add "Not a package special. Unmatched occupancy stays on the parent nightly."
- No changes to the Full Stay confirm dialog.

**`RatePlansSurface.tsx`** — badges LOS / Full stay unchanged; fix any tooltip still saying "display only" if found.

## 2. Specials wizard + tab

**`src/lib/specialsResolver.ts`** — labels only:
- `long_stay: "Long-stay offer"`, `advance_purchase: "Book early"`, `last_minute: "Last minute"`.
- `basic` / `package` / `rate_grid` untouched.

**`src/components/property/specials/SpecialWizard.tsx`** — DEAL_CARDS blurbs:
- `long_stay`: "A campaign off the already-quoted stay after a minimum night count. Not the Rate Plans length-of-stay ladder (that changes the nightly itself)."
- `advance_purchase`: "A campaign for guests who book well before arrival. Lead time, not stay shape."
- `last_minute`: "A campaign for guests booking a few days or hours before arrival."
- Step 0, under the deal-type grid, one muted line: "Rate Plans → Stay shape sets what a night costs. This wizard discounts that total for a date window."

**`src/components/property/AccommodationSpecialsTab.tsx` (~L276)**
- Under the "Specials" heading, one muted sentence: "Offers on a quoted stay. To change what 7 nights costs as the tariff, open Rate Plans → Stay shape."
- Tab not renamed; no second wizard.

## Explicitly out of scope

- Merging `property_specials` ↔ `rolos_rate_plan_los_rungs`; no auto-enable of `ru_push_fsp`.
- No changes to `supabase/functions/**`, `ratePricing.ts`, `ratePlanDraft.ts`, `stayQuote`, `ruLosPricing`, `ruFspPricing`, `ruDiscounts.ts`, `specialsResolver.ts` logic, or Calendar files.
- No guest-facing `SpecialOfferPicker` copy changes.

## Verification

- `npx tsgo --noEmit -p tsconfig.app.json` clean; build log OK.
- `git diff --stat supabase/functions src/lib/ratePricing.ts src/components/pms/rateplans/ratePlanDraft.ts` is empty; `specialsResolver.ts` diff touches only `DEAL_TYPE_LABELS`.
- Visual check of the Rate Plans card and Specials wizard step 0 in the preview.

## Suggested commit

`copy(rates): separate stay shape from specials offers`
