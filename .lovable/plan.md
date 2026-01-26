

# Fix Dashboard Table Layout & Domain Fallback Standard

## Issues Identified

### Issue 1: Tables Not Filling Screen Width
The current layout uses multiple width constraints that prevent tables from using the full available screen space:

| Layer | Current | Problem |
|-------|---------|---------|
| `AppLayout.tsx` (line 23) | `container mx-auto max-w-[1600px]` | Double constraint: `container` class + explicit max-width |
| Card wrapper | `overflow-hidden` only | No explicit width directive |

The `container` class from Tailwind includes its own responsive max-widths (1400px at 2xl), which compounds with the explicit `max-w-[1600px]`.

### Issue 2: Wrong Fallback Domain
The `hostfully-oauth-callback` edge function uses an incorrect fallback URL:

| Current | Required |
|---------|----------|
| `https://roomsonline-hub.lovable.app` | `https://sleepinafrica.roomsonline.co.za` |

**Standing rule**: `lovable.app` should NEVER be part of any fallback URL. The production domain is always `sleepinafrica.roomsonline.co.za`.

---

## Solution

### Part 1: Expand Dashboard Layout Width

Remove the double-constraint by dropping the `container` class and relying solely on `max-w-[1600px]` with full-width flexibility:

**File: `src/components/layout/AppLayout.tsx`**

Change line 23 from:
```tsx
<div className="container mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 max-w-[1600px] animate-fade-in">
```

To:
```tsx
<div className="w-full mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 max-w-[2000px] animate-fade-in">
```

This:
- Removes `container` class (which adds its own max-width)
- Increases max-width from 1600px to 2000px for ultra-wide screens
- Adds explicit `w-full` for full-width inheritance

---

### Part 2: Fix Fallback URL in Edge Function

**File: `supabase/functions/hostfully-oauth-callback/index.ts`**

Change line 17 from:
```typescript
return 'https://roomsonline-hub.lovable.app';
```

To:
```typescript
return 'https://sleepinafrica.roomsonline.co.za';
```

---

### Part 3: Document Domain Standard (for future reference)

The system uses these production domains:

| Purpose | Domain |
|---------|--------|
| Admin Console | `https://sleepinafrica.roomsonline.co.za` |
| Public Booking | `https://book.sleepinafrica.roomsonline.co.za` |
| Survey | `https://survey.roomsonline.co.za` |

These are already defined in `src/lib/config.ts` as `ADMIN_DOMAIN`, `PUBLIC_DOMAIN`, and `SURVEY_DOMAIN`.

The fallback in the edge function should use the `ADMIN_DOMAIN` equivalent since OAuth callbacks redirect to admin pages.

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/layout/AppLayout.tsx` | Replace `container` class with `w-full`, increase `max-w` to 2000px |
| `supabase/functions/hostfully-oauth-callback/index.ts` | Change fallback URL from `roomsonline-hub.lovable.app` to `sleepinafrica.roomsonline.co.za` |

---

## Expected Outcome

After implementation:
1. **Dashboard tables** will expand to fill more screen width on large monitors (up to 2000px)
2. **Hostfully OAuth redirects** will always go to the correct production domain
3. No "No Results Found" errors from incorrect domain redirects

