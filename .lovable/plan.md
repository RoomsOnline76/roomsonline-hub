
# Fix: PMS property selection resets between Dashboard and Command Centre

## Root cause
The current selection is not truly shared across the PMS shell:

- `usePmsPropertyId` only caches the list of available properties, not the selected property
- `manualPropertyId` lives in local component state, so each hook instance has its own copy
- `PMSSidebar` reads `searchParams.get("property")` directly instead of the hook’s resolved `propertyId`
- `PMSCommandCentre` also reads the URL param directly and keeps its own `selectedPropertyFilter`

So when a property is changed on Dashboard, the sidebar and Command Centre can still use an older value during navigation, which looks like a reset.

## Implementation plan

### 1. Make selected PMS property a shared source of truth
Update `usePmsPropertyId.ts` so the selected property is shared across all PMS pages/components, not stored per hook instance.

Planned approach:
- store the selected property in a shared React Query cache key or small persistent client store
- keep URL `?property=` in sync with that shared value
- still support fallback order:
  1. explicit URL param
  2. shared selected property
  3. first allowed property

This removes the per-component `manualPropertyId` drift.

### 2. Make sidebar navigation use resolved property from the hook
Update `PMSSidebar.tsx` to:
- stop reading `searchParams` directly for navigation
- use `propertyId` returned by `usePmsPropertyId()`
- build menu links from the resolved/shared property, so sidebar clicks always carry the current selection

This is the main fix for Dashboard → Command Centre resets.

### 3. Align Command Centre with the same property source
Update `PMSCommandCentre.tsx` to:
- use `propertyId` from `usePmsPropertyId()` instead of raw `searchParams.get("property")`
- initialize and sync `selectedPropertyFilter` from the resolved hook property
- preserve the current property when entering the page, only using `"all"` when the user intentionally chooses it

This keeps Command Centre consistent with Dashboard and sidebar navigation.

### 4. Preserve portfolio context correctly
Ensure the shared selection still respects current portfolio behavior:
- if selected property belongs to a portfolio, portfolio-scoped lists remain intact
- the selected property must remain that exact property, not silently fall back to the first portfolio member

### 5. Regression check areas
After implementation, verify these paths:
- Dashboard → Command Centre
- Command Centre → Dashboard
- Dashboard → Rooms / Rate Plans / Portfolio
- property switch from page-level dropdown
- property switch from sidebar dropdown
- portfolio member property selection across pages

## Files to change

| File | Changes |
|------|---------|
| `src/hooks/usePmsPropertyId.ts` | Replace local-only selected property state with shared selection state; keep URL sync |
| `src/components/layout/PMSSidebar.tsx` | Use hook `propertyId` as navigation source instead of raw search params |
| `src/pages/pms/PMSCommandCentre.tsx` | Read/sync selected property from `usePmsPropertyId()` rather than direct URL param |

## Technical note
The existing code currently caches available properties, but not the selected property itself. That is why the previous “cache fix” did not fully solve the issue. The real fix is to centralize current PMS property selection and make all PMS navigation consume that same resolved state.
