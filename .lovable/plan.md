

# Staff Login: Single URL with Smart Branding

## Problem

Two issues:
1. **404 on custom domain** — The route `/staff-login/:propertySlug` exists in `App.tsx` (line 541), so the 404 is a deployment/DNS routing issue on `sleepinafrica.roomsonline.co.za`, not a missing route. The SPA catch-all likely isn't configured on that domain.
2. **Scalability** — Generating a unique URL per property (`/staff-login/latter-days`) is fragile: slugs change, properties rename, URLs break.

## Proposed Solution: Single `/staff-login` with Smart Memory

One universal URL: **`/staff-login`** (no slug required).

**Branding logic:**
1. If a `?property=slug` query param is present → fetch and display that property's branding (used for first-time links from the Staff Management page)
2. Else if `localStorage` has a previous property login → auto-apply that property's branding
3. Else → show RoomsOnline default branding (clean, professional fallback)

**After successful login:**
- Save the property's brand data + slug to `localStorage` key `rol_staff_last_property`
- Next time staff visits `/staff-login` (bookmark, typed URL), they see their property's branding automatically

**Staff Management page update:**
- Change the displayed URL from `https://sleepinafrica.roomsonline.co.za/staff-login/latter-days` to the published app URL with query param: `https://roomsonline-hub.lovable.app/staff-login?property=latter-days`
- This URL is a convenience link, not a requirement — staff can just bookmark `/staff-login`

## Changes

### 1. `src/pages/StaffLogin.tsx`
- Make `propertySlug` param optional — support both `/staff-login` and `/staff-login/:propertySlug` (backward compat)
- Add `?property=` query param support as primary resolution
- Add localStorage read/write for `rol_staff_last_property` (stores `{ slug, name, logo, colors }`)
- On successful login, persist brand to localStorage
- Default fallback: ROL branding (dark navy gradient, ROL logo)

### 2. `src/App.tsx`
- Keep existing route `/staff-login/:propertySlug` for backward compatibility
- Add `/staff-login` route (no param) pointing to same component

### 3. `src/pages/pms/PMSStaff.tsx`
- Change `staffLoginUrl` from hardcoded custom domain to use `window.location.origin + /staff-login?property=${propertySlug}`
- This makes the URL work on any domain the app is deployed to

## UX Flow

```text
First-time staff member:
  Manager shares: /staff-login?property=latter-days
  → Page loads with Latter Days branding
  → Staff logs in → branding saved to localStorage
  → Staff bookmarks /staff-login

Returning staff member:
  Opens bookmark: /staff-login
  → localStorage has Latter Days brand → shows branded login
  → Feels like "their" portal

Staff at new property:
  Manager shares: /staff-login?property=new-place
  → Overrides localStorage with New Place branding
```

