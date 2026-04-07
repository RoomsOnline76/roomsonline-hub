

# Phase 5: Unify Routing and Concerns in App.tsx

## Current State (714 lines)

`App.tsx` is functional but has several structural issues:

1. **No `PMSConnection.tsx` exists** — the original brief mentioned merging it, but it was never created as a standalone page. PMS adapter/connection logic already lives in `PropertyForm`'s GeneralTab (`OwnerPMSConnectionCard`). No merge needed.

2. **Duplicate Connect portal routes** — lines 176–191 mount the Connect portal at `/` when on the connect domain, AND lines 682–696 mount the same routes under `/connect`. Both blocks lazy-load the same 12 components.

3. **Inconsistent route grouping** — admin, dev, dashboard, journey, embed, and public routes are interleaved rather than grouped by concern. Indentation is inconsistent (2-space vs 4-space mixing).

4. **Redundant redirect routes** — 5 legacy redirects (`/admin/system-health`, `/admin/supporting-systems`, `/admin/all-bookings`, `/admin/all-properties`, `/admin/system`) could be consolidated.

5. **No route-level layout wrapping for admin** — admin routes repeat `<ProtectedRoute>` individually (~30 times) instead of using a nested layout route.

6. **PMS routes are already clean** — the `/pms` nested route with `PMSShell` is well-structured and needs no changes.

## Plan

### Step 1: Group routes by concern with layout routes

Restructure `App.tsx` into clearly separated sections using React Router v6 nested layout routes:

```text
Routes
├── Connect domain routes (conditional)
├── Public routes (/, /book, /property/:id, /embed/*, /staff-login, etc.)
├── Auth route (/auth)
├── Journey routes (/journey/*)
├── Admin layout route → <ProtectedRoute> wrapper
│   ├── /admin/properties/*
│   ├── /admin/bookings
│   ├── /admin/dashboard, /admin/payments
│   ├── /admin/journals/*
│   ├── /admin/contracts, /admin/onboarding
│   ├── /admin/portfolios, /admin/billing-defaults
│   └── ... (all admin routes)
├── Dashboard routes (/dashboard/*)
├── Dev layout route → <ProtectedRoute requireDev>
│   ├── /dev/system-health
│   ├── /dev/pms, /dev/features, /dev/testing, /dev/tasks
├── PMS routes (/pms/*) — already nested, keep as-is
├── Connect portal routes (/connect/*)
├── Legacy redirects (consolidated)
└── Catch-all (*)
```

### Step 2: Create `AdminLayout` and `DevLayout` wrapper routes

Create two small layout components that wrap children in `<ProtectedRoute>` + `<AppLayout>`:

- `src/components/layout/AdminRouteLayout.tsx` — wraps with `<ProtectedRoute requireAdmin>`
- `src/components/layout/DevRouteLayout.tsx` — wraps with `<ProtectedRoute requireDev>`

This eliminates ~25 repeated `<ProtectedRoute>` wrappers. Routes that need different permission levels (e.g., `requireDevOrFearless`) use inline overrides.

### Step 3: Deduplicate Connect portal routes

Extract the 12 Connect child routes into a shared array or fragment, used by both the domain-root mount and the `/connect` path mount. Eliminates the duplicated block.

### Step 4: Consolidate legacy redirects

Group the 5 redirect routes into a single block with a comment, and remove the empty lines / inconsistent spacing throughout.

### Step 5: Verify PMS adapter layer consistency

Confirm all PMS-related pages under `/pms/*` use `usePmsPropertyId` + edge function calls (not direct DB queries). Based on the Phase 2–4 work:
- `booking-orchestrator-api` handles availability
- `data-access-api` handles user context
- PMS pages use `callPmsApi` via `usePmsApi` hook

No additional adapter changes needed — this is a verification step.

## Files changed

| File | Change |
|---|---|
| `src/App.tsx` | Restructure into grouped sections, add nested layout routes, deduplicate Connect routes |
| `src/components/layout/AdminRouteLayout.tsx` | **New** — `<ProtectedRoute>` + `<Outlet>` wrapper for admin routes |
| `src/components/layout/DevRouteLayout.tsx` | **New** — `<ProtectedRoute requireDev>` + `<Outlet>` wrapper for dev routes |

## What does NOT change
- No database migrations
- No edge function changes
- No PMS page modifications
- No user-facing behavior changes — all routes resolve to the same components
- `PMSShell` and PMS nested routing stays as-is
- `ProtectedRoute` component stays as-is

## Target outcome
`App.tsx` reduced from 714 → ~400 lines. Routes grouped by domain. Permission wrapping deduplicated. Modern React Router v6 nested layout pattern throughout.

