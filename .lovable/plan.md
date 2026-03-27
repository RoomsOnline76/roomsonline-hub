

# Fix Brand Color Flash (FOUC) on White-Label Pages

## Problem
When loading branded pages (SIX on N showcase, checkout, confirmation), the default pink/theme colors render first, then the branded colors are applied after an async DB fetch completes — causing a visible flash of unstyled content (FOUC).

## Root Cause
`useBrandOverride` applies colors inside a `useEffect` that either reads from sessionStorage (fast but still async to React paint) or fetches from the database (slow). The page content renders with default CSS variables before the effect runs.

## Fix Strategy: Synchronous Pre-Paint + Opacity Gate

### 1. Add synchronous brand application before first render

**File: `src/lib/brandOverride.ts`**
- Add a new function `applyCachedBrandSync()` that reads sessionStorage and applies CSS vars **synchronously** (called outside React lifecycle)
- This runs before React hydrates, eliminating flash when sessionStorage has cached brand data

### 2. Add opacity gate for DB-fetch scenario

**File: `src/hooks/useBrandOverride.ts`**
- Return a `brandReady` boolean from the hook
- Set `brandReady = true` immediately if sessionStorage cache was applied, or after the DB fetch completes
- For non-branded properties, set `brandReady = true` immediately

### 3. Use `brandReady` to prevent flash in pages

**File: `src/pages/PropertyShowcase.tsx`**
- Use `brandReady` from `useBrandOverride` — show skeleton/loading state until brand is resolved when property has brand override

**File: `src/pages/Booking.tsx`**
- Same pattern — the existing loading skeleton already covers the DB fetch window, but ensure `useBrandOverride` applies cached brand synchronously before first paint

**File: `src/pages/BookingConfirmation.tsx`**
- Same pattern

### 4. Inline script for immediate sessionStorage application (optional enhancement)

**File: `index.html`**
- Add a tiny inline `<script>` that reads `rol_property_brand` from sessionStorage and applies CSS vars to `<html>` before any React code runs. This is the nuclear option that guarantees zero flash for return visits.

## Technical Detail

The inline script in `index.html`:
```javascript
(function(){try{var b=JSON.parse(sessionStorage.getItem('rol_property_brand'));if(!b||!b.enabled||!b.primaryColor)return;/* apply hex→hsl + set vars on documentElement */}catch(e){}})();
```

This ~200 byte script runs before React loads, setting CSS variables immediately. The React hooks then confirm/update as needed.

## Files

| Action | File |
|--------|------|
| Modify | `index.html` — inline brand pre-paint script |
| Modify | `src/hooks/useBrandOverride.ts` — return `brandReady`, sync cache path |
| Modify | `src/pages/PropertyShowcase.tsx` — gate on brandReady |
| Modify | `src/pages/Booking.tsx` — gate on brandReady |
| Modify | `src/pages/BookingConfirmation.tsx` — gate on brandReady |

No database changes needed.

