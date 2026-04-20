

## Plan: Fix `Push_PutAvbUnits_RQ` to Match RU's Canonical Schema

### Context
RU support pointed us to the official documentation at https://developer.rentalsunited.com/#upload-available-units. The endpoint uses a **`<MuCalendar>`** wrapper (not `<Availabilities>`/`<Availability>`) with a completely different element naming convention than what we currently send.

### Canonical Schema (per RU docs)
```xml
<Push_PutAvbUnits_RQ>
  <Authentication>...</Authentication>
  <MuCalendar PropertyID="4707752">
    <Date From="2026-04-21" To="2026-04-21" MSMXTypeID="1">
      <U>2</U>   <!-- Units available -->
      <MS>1</MS> <!-- Min stay -->
      <MX>30</MX><!-- Max stay -->
      <C>1</C>   <!-- Changeover: 1=both, 2=checkin, 3=checkout, 4=none -->
    </Date>
  </MuCalendar>
</Push_PutAvbUnits_RQ>
```

### Current (broken) Schema
We're sending `<Availabilities><Availability PropertyID="..."><AvailabilityDay date="..." units="..."/>` — which RU returns Status 17 ("Unexpected error") for.

### Key Differences to Fix

| Current | Correct |
|---|---|
| `<Availabilities>` wrapper | `<MuCalendar PropertyID="X">` wrapper |
| `<Availability PropertyID="...">` | (PropertyID is on `<MuCalendar>`) |
| `<AvailabilityDay date="..." units="N" min_stay="..." max_stay="..." changeover="...">` | `<Date From="..." To="..." MSMXTypeID="1"><U>N</U><MS>...</MS><MX>...</MX><C>...</C></Date>` |
| Per-day rows | Range-based (`From`/`To`) — can collapse contiguous identical days |

---

### Tasks

| # | Task | File | Severity |
|---|------|------|----------|
| T1 | Rewrite `buildPushAvailabilityXml` in `rentalsunited-api/index.ts` to emit `<MuCalendar PropertyID="X">` with `<Date From="..." To="..." MSMXTypeID="1"><U/><MS/><MX/><C/></Date>` rows | `supabase/functions/rentalsunited-api/index.ts` | 🔴 Blocker |
| T2 | Map our internal availability fields → RU short codes: `units→U`, `min_stay→MS`, `max_stay→MX`, `changeover→C` (with sensible defaults: U=0, MS=1, MX=30, C=1) | same file | 🔴 Blocker |
| T3 | Default `MSMXTypeID="1"` (1 = nights, per RU). Omit when not needed for last range (matches RU example pattern) | same file | 🟡 Medium |
| T4 | Optional optimization: collapse contiguous days with identical (U, MS, MX, C) values into a single `<Date From="X" To="Y">` range (reduces payload size) | same file | 🟢 Hygiene |
| T5 | Deploy `rentalsunited-api` and re-push Steenbok (RUID 4707752); confirm Status 0 | edge function deploy + curl | 🔴 Verification |
| T6 | Update `/mnt/documents/RU-Response-QA.md`: mark §A3 (`Push_PutAvbUnits_RQ` syntax) as **RESOLVED** with the canonical schema reference and ResponseID from successful push | doc artifact | 🟢 Hygiene |
| T7 | Update memory `mem://integrations/pms/rentals-united-xml-adapter` with the canonical `<MuCalendar>` structure so we don't regress | memory | 🟢 Hygiene |

### Changeover code reference (for our mapping)
- `1` = check-in & check-out allowed (default)
- `2` = check-in only
- `3` = check-out only
- `4` = neither (closed)

### Out of scope
- Not changing `Push_PutPrices_RQ` (already returning Status 0 ✅)
- Not addressing building `UnitTypeID` linkage (awaiting RU follow-up)
- Not touching reservation polling

### Verification
After T5, expected response:
```xml
<Push_PutAvbUnits_RS>
  <Status ID="0">Success</Status>
  <ResponseID>...</ResponseID>
</Push_PutAvbUnits_RS>
```

