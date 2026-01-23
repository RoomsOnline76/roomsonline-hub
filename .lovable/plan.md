
# Fix Double Logo + Color Update to ROL Pink

## Summary

Two issues to address:

1. **Double Logo on Contract PDF** - The contract shows the full "roomsonline" logo at the top, then a second "ROL" wreath logo below it within the contract body content.

2. **Color Update** - Replace the wrong pink shade (`#e91e63`) with the correct ROL pink (`#e91e8c`) in email templates.

---

## Issue 1: Double Logo in Contract

### Root Cause Analysis

Looking at the PDF screenshot, there are TWO logos displayed:
- **Logo 1**: Full "roomsonline" logo with tagline at the very top header
- **Logo 2**: Small "ROL" wreath logo inside the contract content area

The double logo occurs because:

1. `generateContractHTML()` (line 78-80 in `src/lib/contractAgreementText.ts`) includes a logo in its output:
   ```html
   <div class="text-center mb-6">
     <img src="${ROL_LOGO_URL}" alt="RoomsOnline" class="h-12 mx-auto" />
   </div>
   ```

2. When this is used with `generatePdfFromDynamicTemplate()` (lines 267-271), it wraps the content with ANOTHER header containing the logo:
   ```html
   <div class="header">
     <img src="${logoSrc}" alt="Roomsonline" />
     <p class="tagline">Strategize - Optimize - Maximize</p>
   </div>
   ${templateHtml} <!-- This already contains a logo! -->
   ```

3. Similarly, `generateSignedContractHTML()` (lines 193-196) also has a header with logo that wraps content which may contain its own logo.

### Solution

**Remove the logo from `generateContractHTML()`** since the wrapper functions (`generateSignedContractHTML` and `generatePdfFromDynamicTemplate`) already add a proper header with the logo.

**File**: `src/lib/contractAgreementText.ts`

**Change**: Lines 76-80 - Remove the logo div from the contract content:

```typescript
// BEFORE:
return `
<div class="contract-text">
  <div class="text-center mb-6">
    <img src="${ROL_LOGO_URL}" alt="RoomsOnline" class="h-12 mx-auto" />
  </div>
  <h1 class="text-2xl font-bold text-center mb-6">ROOMSONLINE ACCOMMODATION...

// AFTER:
return `
<div class="contract-text">
  <h1 class="text-2xl font-bold text-center mb-6">ROOMSONLINE ACCOMMODATION...
```

---

## Issue 2: Color Inconsistency

### Problem

Some email templates use `#e91e63` (Material Design Pink) instead of the correct ROL pink `#e91e8c`.

### Files to Update

| File | Line | Current | Target |
|------|------|---------|--------|
| `supabase/functions/reset-user-password/index.ts` | 149 | `#e91e63` | `#e91e8c` |
| `supabase/functions/send-access-request/index.ts` | 194 | `#e91e63` | `#e91e8c` |

### Note on Green Color

The dark green color `#2c5530` in `src/lib/contractAgreementText.ts` is used for contract headers and borders. This appears to be intentional brand styling for the contract document and should NOT be changed to pink, as it provides good readability for official legal documents.

---

## Implementation Summary

| Task | File | Change |
|------|------|--------|
| Remove duplicate logo | `src/lib/contractAgreementText.ts` | Delete logo div from `generateContractHTML()` lines 78-80 |
| Update color | `supabase/functions/reset-user-password/index.ts` | `#e91e63` to `#e91e8c` |
| Update color | `supabase/functions/send-access-request/index.ts` | `#e91e63` to `#e91e8c` |

---

## Expected Result

After implementation:
- Contract PDF will show only ONE logo at the top (the full "roomsonline" logo with tagline)
- The duplicate "ROL" wreath logo below will be removed
- All email buttons will use consistent ROL pink (`#e91e8c`)
