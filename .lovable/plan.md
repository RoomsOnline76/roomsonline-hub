

# Codebase Audit & Optimization Plan

## Analysis Summary

After scanning the codebase, here are the key findings across the project (~80+ pages, ~70+ edge functions, ~30+ hooks, ~50+ UI components):

### 1. Dead Code & Redundancies
- **`HomeOld.tsx`** (845 lines): Only referenced from a single `/home-old` route in App.tsx. Legacy page, candidate for removal.
- **`StagingBook.tsx`** (627 lines): Only on `/staging` route, appears to be a dev/test page.
- **Duplicate `/auth` route** in App.tsx (line 125–126): Exact same route registered twice.
- **`src/components/ui/use-toast.ts`**: Re-export shim — just forwards from `@/hooks/use-toast`. All 38 consumers already import from `@/hooks/use-toast` directly. File is unused.
- **413 `console.log` statements** across 15 files in `src/` — production debug noise.

### 2. TypeScript Debt
- **739 `as any` casts** across 43 files — already identified in Phase 3 but only 3 files were cleaned. Bulk remains.
- 10 `eslint-disable` / `@ts-ignore` annotations.

### 3. robots.txt Gaps
- Missing disallows for new routes added since Jan 2026: `/pms/`, `/dev/`, `/pulse`, `/journey/`, `/embed/`, `/staff-login`, `/onboarding/`, `/contract/`.
- Missing `Disallow: /how-our-booking-engine-works` (SEO landing page — actually should be *allowed*, but `/pms/` definitely shouldn't be crawled).

### 4. sitemap.xml Staleness
- Last updated 2026-01-08. Missing `/how-our-booking-engine-works` (public SEO page). Still has placeholder comments for dynamic generation.

### 5. Performance Concerns
- `PMSDashboard.tsx` is **1,789 lines** — a monolith that could benefit from extraction but is functional. Not a priority blocker.
- Several PMS pages use extensive `useState` arrays (e.g., PMSHousekeeping has 15+ state vars) — functional but verbose.

---

## Implementation Plan

### Phase A — Cleanup (safe removals, no behavior change)

1. **Remove duplicate `/auth` route** in App.tsx (line 126)
2. **Remove `src/components/ui/use-toast.ts`** — unused re-export shim (all consumers use `@/hooks/use-toast`)
3. **Strip production `console.log` calls** from `src/` files (keep `console.warn`/`console.error` for actual error paths). Target files:
   - `PropertyShowcase.tsx`, `JourneyCheckout.tsx`, `PayFastOnsiteModal.tsx`, `CalendarAccommodation.tsx`, `useNightsBridgeTracking.ts`, `AdminKeys.tsx`, and others
4. **Archive `HomeOld.tsx`** — remove route from App.tsx and delete the file (845 lines of dead weight). If needed later, it's in git history.
5. **Archive `StagingBook.tsx`** — remove `/staging` route and file (627 lines). Dev-only page accessible via git.

### Phase B — System Files Update

1. **robots.txt** — Add missing disallows:
   ```
   Disallow: /pms/
   Disallow: /dev/
   Disallow: /pulse
   Disallow: /journey/
   Disallow: /embed/
   Disallow: /staff-login
   Disallow: /onboarding/
   Disallow: /contract/
   ```
   Add allowed public page: `Allow: /how-our-booking-engine-works`

2. **sitemap.xml** — Add the `/how-our-booking-engine-works` page entry with current date. Update `lastmod` dates to `2026-03-09`.

### Phase C — TypeScript Hardening (targeted, safe)

Focus on the **highest-impact files** where `as any` casts mask real type issues:
- `PropertyOverview.tsx` — cast `property` fields that exist in the DB schema but aren't in the generated types (likely JSON column access)
- `PMSRoomTypes.tsx` — multiple `as any` for amenities/linked IDs
- `ItineraryContext.tsx` — insert/update casts

This phase creates typed interfaces for these patterns rather than blind casts.

### What We Will NOT Touch
- **Edge functions** — recently rewritten in Phase 1–3, stable
- **UI component library** (`src/components/ui/`) — auto-generated shadcn components
- **`src/integrations/supabase/`** — auto-generated, must not edit
- **PMSDashboard 1,789-line monolith** — functional, splitting risks regressions for zero user value
- **`StagingBook` and `HomeOld`** — will confirm with user before deleting

### Estimated Scope
- ~15 files modified
- ~1,500 lines removed (dead code + console.logs)
- 0 behavioral changes

