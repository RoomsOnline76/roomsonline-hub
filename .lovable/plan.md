

# Fix Desktop Sidebar — Sync Missing Menu Items

## Root Cause

The desktop sidebar (`AppSidebar.tsx`) has its own **hardcoded navigation arrays** (lines 105-161) that are completely independent from `navigation.ts` (which the mobile nav uses). Every time a new page is added to `navigation.ts`, the desktop sidebar falls out of sync.

## Missing Items in Desktop Sidebar

Comparing `AppSidebar.tsx` arrays against `navigation.ts` and `App.tsx` routes:

| Page | Route | In `navigation.ts` | In `AppSidebar.tsx` |
|------|-------|--------------------|--------------------|
| Sales Reps | `/admin/sales-reps` | Yes | **No** |
| Commission Reports | `/admin/commission-reports` | Yes | **No** |
| Access Requests | `/admin/access-requests` | No (conditional) | Only when badge > 0 |
| API Docs | `/docs/api` | No | No |
| Dev Testing | `/dev/testing` | No | No |
| Promotion | `/admin/promotion` | No | No |

The first two are the critical missing links. Access Requests currently only shows when there are pending requests — it should always be visible for admins. API Docs and Dev Testing are utility pages that could optionally be added to System Control.

## The Fix

**Refactor `AppSidebar.tsx` to consume `navigationConfig` from `navigation.ts`** instead of maintaining duplicate arrays. This is the only way to prevent this from happening a third time.

### Changes

#### 1. Modify `src/components/layout/AppSidebar.tsx`

- Remove all hardcoded arrays (`adminItems`, `workspaceItems`, `insightsItems`, `editAuditItems`, `systemItems`, `pmsItems`)
- Import `navigationConfig` from `@/config/navigation`
- Map `NavSection` items using `hasMinRole(userRole, item.minRole)` for access control (same as mobile does)
- Render sections dynamically: non-collapsible sections as flat lists, collapsible sections using the existing `CollapsibleMenu` pattern
- Keep the special-case Access Requests badge (always show for admins, with badge count)

#### 2. Update `src/config/navigation.ts`

- Add missing pages that should be navigable:
  - `Access Requests` → Administration section (admin, always visible)
  - `API Docs` → System Control section (dev)
  - `Promotion` → Workspace section (owner)

This single-source-of-truth approach means future page additions to `navigation.ts` will automatically appear in both desktop and mobile navs.

## Files

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/config/navigation.ts` | Add Access Requests, API Docs, Promotion items |
| Modify | `src/components/layout/AppSidebar.tsx` | Consume `navigationConfig` instead of hardcoded arrays |

