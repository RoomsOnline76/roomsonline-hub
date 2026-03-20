

# Remove `/connect` prefix on the Connect domain

## Problem
On `connect.roomsonline.co.za`, URLs read `connect.roomsonline.co.za/connect/features` — the word "connect" appears twice. All portal routes should be served at the root: `connect.roomsonline.co.za/features`.

## Approach

Use a helper function throughout the portal that returns the correct path prefix based on domain context. On the connect domain, routes live at `/`. On the main domain, they stay at `/connect/*` for dev/preview access.

## Changes

### 1. Add path helper (`src/lib/config.ts`)
Add a utility:
```ts
export const connectPath = (path: string) =>
  isConnectDomain ? path : `/connect${path}`;
```
This returns `/features` on the connect domain, `/connect/features` on the main domain.

### 2. Duplicate routes in `src/App.tsx`
When `isConnectDomain`, mount the `ConnectLayout` at `/` (root) instead of `/connect`. Keep the `/connect` routes for the main domain.

```text
// On connect domain:
<Route path="/" element={<ConnectLayout />}>
  <Route index element={<ConnectHome />} />
  <Route path="features" element={<ConnectFeatures />} />
  ...
</Route>

// On main domain (unchanged):
<Route path="/connect" element={<ConnectLayout />}>
  ...
</Route>
```

Update the catch-all to redirect to `/` on the connect domain.

### 3. Update `ConnectLayout.tsx` nav links
Replace all hardcoded `/connect/...` paths with `connectPath(...)`:
- NAV_LINKS hrefs
- Logo link → `connectPath("/")`
- "Get Started" CTA → `connectPath("/get-started")`
- All footer links

### 4. Update all 10 connect page components
Replace every `Link to="/connect/..."` with `connectPath("/...")` in:
- `ConnectHome.tsx` (~6 links)
- `ConnectDocs.tsx` (~2 links)
- `ConnectFeatures.tsx` (~2 links)
- `ConnectIntegrations.tsx` (~1 link)
- `ConnectPricing.tsx` (~1 link)
- `ConnectFAQ.tsx` (~1 link)
- `ConnectGetStarted.tsx` (~2 links)
- `ConnectQuickstart.tsx` (~4 links)
- `ConnectAbout.tsx` (~2 links)
- `ConnectWordPress.tsx` (check for links)

### Result
- `connect.roomsonline.co.za/` → Landing page
- `connect.roomsonline.co.za/features` → Features
- `connect.roomsonline.co.za/docs` → API docs
- Main domain `/connect/*` routes continue working for development

