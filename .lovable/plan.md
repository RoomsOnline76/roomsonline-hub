

## Plan: Add `Push_PutLongStayDiscounts_RQ` & `Push_PutLastMinuteDiscounts_RQ` to RU Adapter

### Context
RU docs provide two additional discount-push endpoints we don't currently implement:
- **Long Stay Discounts** — % off based on stay length (e.g. 10% off for 2–20 night stays)
- **Last Minute Discounts** — % off based on days-to-arrival (e.g. 20% off when booking 1–4 days out)

Both follow the same attribute-on-wrapper pattern we just fixed for prices/availability, so the schema risk is low.

### Canonical Schemas (per RU docs)

**Long Stay:**
```xml
<Push_PutLongStayDiscounts_RQ>
  <Authentication>...</Authentication>
  <LongStays PropertyID="X">
    <LongStay DateFrom="YYYY-MM-DD" DateTo="YYYY-MM-DD" Bigger="2" Smaller="20">10</LongStay>
  </LongStays>
</Push_PutLongStayDiscounts_RQ>
```
- `Bigger` = min nights (inclusive lower bound)
- `Smaller` = max nights (inclusive upper bound)
- Inner text = discount %

**Last Minute:**
```xml
<Push_PutLastMinuteDiscounts_RQ>
  <Authentication>...</Authentication>
  <LastMinutes PropertyID="X">
    <LastMinute DateFrom="YYYY-MM-DD" DateTo="YYYY-MM-DD" DaysToArrivalFrom="2" DaysToArrivalTo="5">10</LastMinute>
  </LastMinutes>
</Push_PutLastMinuteDiscounts_RQ>
```

### Investigation needed before coding
1. Read `supabase/functions/rentalsunited-api/index.ts` — confirm where to add the two new XML builders and action handlers (next to existing `Push_PutPrices_RQ` / `Push_PutAvbUnits_RQ`).
2. Check `specials` table / `dynamic-policy-engine` memory — figure out which existing internal records map to "long stay" and "last minute" discount types so the orchestrator can source data from one place rather than inventing new tables.
3. Check `mem://features/property-management/specials-management-system` for our internal discount taxonomy.

### Tasks

| # | Task | File | Severity |
|---|------|------|----------|
| T1 | Add `buildPushLongStayDiscountsXml(propertyId, discounts[])` builder using `<LongStays PropertyID="X"><LongStay DateFrom DateTo Bigger Smaller>%</LongStay></LongStays>` | `supabase/functions/rentalsunited-api/index.ts` | 🔴 Blocker |
| T2 | Add `buildPushLastMinuteDiscountsXml(propertyId, discounts[])` builder using `<LastMinutes PropertyID="X"><LastMinute DateFrom DateTo DaysToArrivalFrom DaysToArrivalTo>%</LastMinute></LastMinutes>` | same file | 🔴 Blocker |
| T3 | Add two new action handlers (`push_long_stay_discounts`, `push_last_minute_discounts`) wired into the action router; both parse RU response for `Status ID` + per-range `<Notifs><Notif>` errors | same file | 🔴 Blocker |
| T4 | Add typed interfaces `RULongStayDiscount` and `RULastMinuteDiscount` mirroring RU attribute names (camelCase internally) with field validators (Bigger ≤ Smaller, DateFrom ≤ DateTo, percent 0–100) | same file | 🟡 Medium |
| T5 | Map our internal `specials` records (long-stay-% and last-minute-% types) → RU discount payloads in the orchestrator that triggers RU pushes | RU push orchestrator (TBD via investigation) | 🟡 Medium |
| T6 | Deploy `rentalsunited-api`; test both endpoints against Steenbok (RUID 4707752) with a sample 30-day window; confirm Status 0 (or Status 5 with no `<Notifs>` failures) | edge function deploy + curl | 🔴 Verification |
| T7 | Update `/mnt/documents/RU-Response-QA.md` — add new Section D "Discount endpoints" recording the two endpoints, sample requests, and ResponseIDs from successful pushes | doc artifact | 🟢 Hygiene |
| T8 | Update `mem://integrations/pms/rentals-united-xml-adapter` with the canonical `<LongStays>` / `<LastMinutes>` patterns | memory | 🟢 Hygiene |

### Response handling note
Both endpoints can return **Status 5** ("An error occurred for some of the ranges") with a partial-success `<Notifs>` block. Handler must:
- Treat Status 0 as full success
- Treat Status 5 as **partial success** — log each `<Notif>` range to `sync_logs` but don't fail the whole push
- Treat any other Status ID as full failure

### Out of scope
- Not building UI for managing long-stay / last-minute discounts (assume they already exist in `specials`)
- Not changing prices/availability builders (working ✅)
- Not addressing building→property linkage (awaiting RU)

### Verification
After T6, expected response for both endpoints:
```xml
<Push_Put{LongStay|LastMinute}Discounts_RS>
  <Status ID="0">Success</Status>
  <ResponseID>...</ResponseID>
</...>
```
or Status 5 with empty `<Notifs>` — both acceptable.

