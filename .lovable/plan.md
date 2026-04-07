

# Final Validation and Polish

## Summary of Current State

After completing Phases 1-6, the project is in strong architectural shape. Here is what the validation audit reveals and what remains to address.

---

## Step 1: Console and Build Verification

**Finding**: No runtime errors detected. The App.tsx routing is clean (376 lines, down from 714). Lazy loading and code-splitting are properly configured in vite.config.ts.

**Action**: Run `tsc --noEmit` and verify zero type errors. Check dev-server logs for any warnings.

---

## Step 2: Security and RLS Validation

**Findings from scan (180 items total)**:

All findings are already triaged and ignored with documented justification:
- 3x `SECURITY_DEFINER_VIEW` (ERROR) — intentional for PII encryption/decryption, properly scoped
- 5x `function_search_path_mutable` (WARN) — fixed in migration, remaining are Supabase internal (btree_gist)
- 12x `rls_policy_always_true` (WARN) — intentional for public booking, access requests, telemetry tables
- 80+ `anonymous_access_policies` (WARN) — by design for public booking site
- 1x `extension_in_public` (WARN) — btree_gist required in public schema

**2 active ERROR findings (supabase_lov scanner)**:

| Finding | Severity | Action |
|---------|----------|--------|
| **Itineraries guest PII exposed** — SELECT policy allows any anonymous user to read rows where `session_id IS NOT NULL`, exposing guest names/emails/phones | ERROR | Fix: scope the RLS policy so only the originating session can read its own itinerary (match session_id from request header or token) |
| **Property documents bucket open** — any authenticated user can read/write/delete all property documents regardless of ownership | ERROR | Fix: restrict storage policies to property owners/staff by encoding property_id in path and checking ownership |

**Action**: Create a migration to fix both active security errors. These are genuine vulnerabilities.

---

## Step 3: Performance Validation

**Already implemented**:
- Code-splitting via `manualChunks` (vendor-react, vendor-query, vendor-motion, vendor-ui)
- Lazy loading for ~20 public/admin pages (only Home, Auth, NotFound eager)
- QueryClient global defaults (staleTime 5min, gcTime 10min, refetchOnWindowFocus false)
- PropertyCard wrapped in React.memo with custom comparator
- `decoding="async"` on property images

**Action**: Use browser Lighthouse on the booking page to measure FCP and confirm < 2s. This is a manual verification step.

---

## Step 4: Code Review Checklist

| Check | Status | Notes |
|-------|--------|-------|
| snake_case API fields | Done | Zod schemas in `src/lib/schemas/pms.ts` enforce snake_case at API boundaries |
| Zod validation | Done | 184-line schema file covers all PMS response types |
| Adapter isolation | Done | `booking-orchestrator-api` centralizes PMS routing; AI concierge uses orchestrator |
| Duplicate contexts | Clean | `SearchContext` (UI state) and `AISearchContext` (AI search) are distinct concerns |
| useAuth direct DB calls | Done | Routed through `data-access-api` edge function |
| PropertyForm decomposition | Done | Extracted to RoomManagerTab, RateManagerTab, GeneralTab, HouseStyleTab, InfoFacilitiesTab, HouseRulesTab |
| Route organization | Done | App.tsx 376 lines, nested layout routes with AdminRouteLayout/DevRouteLayout |

**No duplicate contexts or vibe-coding remnants found.**

---

## Step 5: Extension Cleanup

This requires the `manage_extensions` tool which is not available in the current environment. This step should be deferred to the Lovable Cloud dashboard.

---

## Step 6: Documentation Update

Update `DEV_BRIEF.md` to reflect:
- New component structure (extracted tabs from PropertyForm)
- booking-orchestrator-api and data-access-api edge functions
- Performance optimizations (lazy loading, code-splitting, React.memo)
- Updated file structure showing new components
- PMS Zod schema location (`src/lib/schemas/pms.ts`)

Update `docs/system-export/` manifest to reference new edge functions and component hierarchy.

---

## Implementation Plan

| Step | Files | Type |
|------|-------|------|
| 1. Fix itineraries RLS policy | DB migration | Security fix |
| 2. Fix property-documents storage policies | DB migration | Security fix |
| 3. Run tsc build verification | CLI | Validation |
| 4. Update DEV_BRIEF.md | Documentation | Polish |
| 5. Update docs/system-export/ | Documentation | Polish |
| 6. Run Lighthouse on booking page | Browser | Validation |

## What does NOT change
- No frontend component changes
- No edge function changes
- No routing changes
- All user-facing functionality remains identical

