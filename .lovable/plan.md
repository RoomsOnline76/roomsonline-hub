

## Root Cause

Every PMS page independently wraps itself in `<PMSLayout>` and every route in `App.tsx` independently wraps in `<PMSBrandProvider>`. When navigating between PMS pages:

1. **Full unmount/remount cycle** — sidebar, brand provider, all hooks (`usePmsPropertyId`, `usePmsStaffRole`, `usePMSBrand`) are destroyed and recreated
2. **Brand CSS vars flash** — `PMSBrandProvider` removes all custom CSS properties on unmount, then re-applies them after async fetch, causing a visible color flash
3. **Lazy loading white screen** — the single top-level `<Suspense>` shows a centered skeleton (`PageFallback`) that replaces the entire viewport (including sidebar) while the next PMS page chunk loads

## Fix

### 1. Create a persistent PMS shell route (`PMSShell.tsx`)

A new wrapper component that renders once and persists across all `/pms/*` navigation:

```text
PMSBrandProvider (persists)
  └─ PMSLayout shell (sidebar persists)
       └─ Suspense (PMS-scoped fallback — sidebar stays, only content area shows skeleton)
            └─ <Outlet /> (swaps page content only)
```

### 2. Refactor App.tsx PMS routes to nested layout

Replace the 17 individual PMS routes with a single parent route using `<Outlet>`:

```tsx
<Route path="/pms" element={<ProtectedRoute><PMSShell /></ProtectedRoute>}>
  <Route index element={<PMSDashboard />} />
  <Route path="rooms" element={<PMSRooms />} />
  <Route path="housekeeping" element={<PMSHousekeeping />} />
  {/* ... all other PMS routes */}
</Route>
```

### 3. Remove `<PMSLayout>` wrapper from all 17 PMS pages

Each page currently does `return <PMSLayout>..content..</PMSLayout>`. Strip the wrapper — each page returns only its content since the shell provides the layout.

### 4. PMS-specific Suspense fallback

Inside `PMSShell`, the `<Suspense>` fallback renders a content-area skeleton (not full-page), so the sidebar remains visible during lazy chunk loading. No more white screen flash.

---

### Files to modify

| File | Change |
|------|--------|
| **New:** `src/components/layout/PMSShell.tsx` | Persistent shell: PMSBrandProvider + PMSLayout + Suspense + Outlet |
| `src/components/layout/PMSLayout.tsx` | Accept `children` as content-only (remove HelpProvider duplication if shell handles it) |
| `src/App.tsx` | Replace 17 individual PMS routes with nested route structure |
| `src/pages/pms/PMSDashboard.tsx` | Remove `<PMSLayout>` wrapper |
| `src/pages/pms/PMSRooms.tsx` | Remove `<PMSLayout>` wrapper |
| `src/pages/pms/PMSRoomTypes.tsx` | Remove `<PMSLayout>` wrapper |
| `src/pages/pms/PMSRatePlans.tsx` | Remove `<PMSLayout>` wrapper |
| `src/pages/pms/PMSGuests.tsx` | Remove `<PMSLayout>` wrapper |
| `src/pages/pms/PMSHousekeeping.tsx` | Remove `<PMSLayout>` wrapper |
| `src/pages/pms/PMSReports.tsx` | Remove `<PMSLayout>` wrapper |
| `src/pages/pms/PMSBranding.tsx` | Remove `<PMSLayout>` wrapper |
| `src/pages/pms/PMSIntegrations.tsx` | Remove `<PMSLayout>` wrapper |
| `src/pages/pms/PMSStaff.tsx` | Remove `<PMSLayout>` wrapper |
| `src/pages/pms/PMSChannels.tsx` | Remove `<PMSLayout>` wrapper |
| `src/pages/pms/PMSGroups.tsx` | Remove `<PMSLayout>` wrapper |
| `src/pages/pms/PMSEvents.tsx` | Remove `<PMSLayout>` wrapper |
| `src/pages/pms/PMSNightAudit.tsx` | Remove `<PMSLayout>` wrapper |
| `src/pages/pms/PMSMessaging.tsx` | Remove `<PMSLayout>` wrapper |
| `src/pages/pms/PMSPortfolio.tsx` | Remove `<PMSLayout>` wrapper |
| `src/pages/pms/PMSRevenue.tsx` | Remove `<PMSLayout>` wrapper |

This eliminates all re-mounting, keeps the sidebar persistent, and confines lazy-load skeletons to the content area only.

