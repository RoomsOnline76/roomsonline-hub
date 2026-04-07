

# Fix Build Errors in GeneralTab.tsx

## Errors and Fixes

### 1. `pmsRateTypes` → `rateTypes` (line 220)
`RatesOverviewPanel` expects `rateTypes`, not `pmsRateTypes`. Rename the prop.

### 2. `syncFromWebsite` signature mismatch (line 566)
`syncFromWebsite` expects `(propertyId, propertyUrl, existingData, tripadvisorId?)` — four args. The call passes `(url, formData, selectedPMS)` — missing `propertyId` and passing wrong types. Fix: pass `propertyId` as first arg, `formData.property_url` as second, cast `formData` as `Record<string, unknown>` for third.

### 3. `WebsiteSyncModal` props (lines 775–781)
- `isOpen` → `open`
- `onClose` → `onOpenChange`
- `websiteUrl` → `scrapedUrl`
- `s.field` / `s.value` → `s.stateVariable` / `s.suggested` (per `WebsiteSyncSuggestion` interface)

## Files changed

| File | Change |
|---|---|
| `src/components/property/GeneralTab.tsx` | Fix 3 prop/call mismatches as described above |

