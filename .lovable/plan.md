

## Plan: Enhance `Push_PutPrices_RQ` to Full RU Spec (LOSS, EGPS, FSP)

### Context
RU docs reveal our current `Push_PutPrices_RQ` builder only sends the basic `<Season><Price/><Extra/></Season>` shape. We're missing three optional-but-supported pricing constructs:

1. **EGPS** — Extra Guest Pricing per season (`<EGP ExtraGuests="N"><Price/></EGP>`)
2. **LOSS** — Length-of-Stay pricing per season (`<LOS Nights="N"><Price/><LOSPS><LOSP NrOfGuests="N"><Price/></LOSP></LOSPS></LOS>`)
3. **FSPSeasons** — Full-Stay Pricing matrix (alternative to seasons; per-day grid by guests × nights)

We also need to harden the **Notifs** parser — RU returns per-range failures (StatusID 5, 6, etc.) with `DateFrom`/`DateTo` we should log granularly.

### Investigation needed
1. Read `buildPushPricesXml` in `supabase/functions/rentalsunited-api/index.ts` — confirm current structure and where to add LOSS/EGPS/FSP branches.
2. Check internal pricing model — `seasons`, `rate_types`, `extra_guest_charges`, LOS rules — to map our data → RU constructs:
   - Memory: `mem://architecture/revenue/pricing-calculation-engine-logic`
   - Memory: `mem://features/property-management/seasons-and-rates-calendar-system`
   - Memory: `mem://features/charges/property-level-charges-system`
3. Decide: do we emit standard (`<Season>`) or FSP (`<FSPSeasons>`) — these are mutually exclusive within a single `<Prices>` payload per RU example.

### Tasks

| # | Task | File | Severity |
|---|------|------|----------|
| T1 | Extend `RUPriceSeason` interface with optional `extraGuestPrices?: {extraGuests, price}[]` and `losPricing?: {nights, price, losps?: {nrOfGuests, price}[]}[]` | `supabase/functions/rentalsunited-api/index.ts` | 🟡 Medium |
| T2 | Update `buildPushPricesXml` to emit `<EGPS>` block when `extraGuestPrices` present and `<LOSS>` block (with optional nested `<LOSPS>`) when `losPricing` present, in canonical order: `Price → Extra → LOSS → EGPS` | same file | 🔴 Blocker |
| T3 | Add `buildPushFspPricesXml(propertyId, fspSeasons[])` for Full-Stay Pricing matrix using `<FSPSeasons><FSPSeason Date DefaultPrice><FSPRows><FSPRow NrOfGuests><Prices><Price NrOfNights>...` | same file | 🟡 Medium |
| T4 | Add `push_prices_fsp` action handler routing to FSP builder (keep existing `push_prices` for standard pricing) | same file | 🟡 Medium |
| T5 | Harden `parseRUNotifs` to capture per-range `StatusID` codes (5=internal, 6=dates mishmash, etc.) and log each `<Notif>` separately to `sync_logs` with date range context | same file | 🟡 Medium |
| T6 | Map our internal pricing → RU payloads in the orchestrator: extra-guest charges → `EGPS`, LOS rate rules → `LOSS`. FSP only when explicitly enabled per property (new `pms_settings.use_fsp_pricing` flag, default false) | RU push orchestrator | 🟡 Medium |
| T7 | Deploy `rentalsunited-api`; test enhanced `push_prices` against Steenbok (RUID 4707752) with one season including both EGPS and LOSS; confirm Status 0 | edge function deploy + curl | 🔴 Verification |
| T8 | Update `/mnt/documents/RU-Response-QA.md` Section A — replace minimal price example with full canonical schema (EGPS + LOSS + Notifs handling); add FSP as Section A.alt | doc artifact | 🟢 Hygiene |
| T9 | Update `mem://integrations/pms/rentals-united-xml-adapter` with full `<Prices>` element ordering rules and FSP alternative | memory | 🟢 Hygiene |

### Element ordering (per RU XSD inference from example)
Within each `<Season>`:
```
Price → Extra → LOSS → EGPS
```
LOSS-vs-FSP: mutually exclusive at the `<Prices>` level (use either `<Season>` or `<FSPSeasons>`, not both).

### Notif status codes observed
| StatusID | Meaning |
|---|---|
| 5 | Internal error (transient — retry candidate) |
| 6 | Dates mishmash (DateFrom > DateTo or overlapping) |

### Out of scope
- No UI changes for managing LOS/extra-guest pricing (assumed already in `seasons`/`extra_guest_charges`)
- Not changing availability/discounts builders (working ✅)
- Not implementing FSP UI — backend-only support; orchestrator decides which path

### Verification
After T7, expected response:
```xml
<Push_PutPrices_RS>
  <Status ID="0">Success</Status>
  <ResponseID>...</ResponseID>
</Push_PutPrices_RS>
```
or Status 5 with empty/handled `<Notifs>` block.

