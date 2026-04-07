

# Phase 1D (continued): Slim PropertyForm.tsx to ≤ 2,000 Lines

## Current state
`PropertyForm.tsx` is at **8,134 lines** after extracting RoomManager, RateManager, and PMS sync. The remaining bulk is inline tab content and ~60 scattered `useState` declarations with their handler functions.

## Strategy
Extract the remaining large tab sections into dedicated components and consolidate state into custom hooks. Modernize to 2026 React patterns: `useReducer` for complex form state, proper TypeScript interfaces (no `any`), and co-located logic.

Split into **4 implementation steps**:

---

### Step 1: Extract General Tab (~1,450 lines → `GeneralTab.tsx`)
**New file**: `src/components/property/GeneralTab.tsx`

Lines 3660–5107. Contains:
- Rates overview collapsible, property details form (name, type, address, contact)
- Owner assignment combobox, map/GPS, website sync button
- Offerings checkboxes (accommodation, venues, events, conference, Lekkeslaap UUID)
- PMS selection dropdown, linked owners panel, Hostfully OAuth flow

Receives shared state as props. Moves ~15 related `useState` declarations (owner search, website sync, linked owners, Hostfully OAuth) into the component.

### Step 2: Extract Info/Facilities + House Rules + House Style (~1,270 lines → 3 components)
- `src/components/property/InfoFacilitiesTab.tsx` (~440 lines, 5449–5889)
- `src/components/property/HouseRulesTab.tsx` (~536 lines, 5889–6425)
- `src/components/property/HouseStyleTab.tsx` (~294 lines, 5107–5401)

Each component receives `formData`, `handleInputChange`, `selectedPMS`, and tab-specific state.

### Step 3: Extract Addons + Specials + Packages + Images + Templates (~920 lines → `AddonsSpecialsTab.tsx`, `PackagesTab.tsx`, `ImagesTab.tsx`, `TemplatesTab.tsx`)
- Addons + Specials share CRUD patterns — consolidate into `AddonsSpecialsTab.tsx` (~560 lines)
- Packages tab → `PackagesTab.tsx` (~137 lines)
- Images tab → `ImagesTab.tsx` (~103 lines)
- Templates tab → `TemplatesTab.tsx` (~119 lines)

Move addon/special/package state and handlers into their respective components.

### Step 4: Consolidate state into `usePropertyFormState` hook + final cleanup
**New file**: `src/hooks/usePropertyFormState.tsx`

- Move `formData` state, `handleInputChange`, `handleSubmit`, `loadProperty`, `saveProperty`, validation schema, and the main `useEffect` that loads data
- Move image upload state/handlers, cancellation policies, facilities, star rating
- PropertyForm becomes a ~1,500–2,000 line orchestrator that renders the tab shell and passes props

**React 2026 modernizations applied throughout**:
- Replace `any` types with proper interfaces (RoomType, SeasonData, RateType, etc.)
- Use `useReducer` for `formData` instead of 30+ individual `useState` calls
- Use `useCallback` for stable handler references passed as props
- Co-locate related state in custom hooks rather than flat declarations

---

## Files changed per step

| Step | New Files | Modified |
|---|---|---|
| 1 | `GeneralTab.tsx` | `PropertyForm.tsx` |
| 2 | `InfoFacilitiesTab.tsx`, `HouseRulesTab.tsx`, `HouseStyleTab.tsx` | `PropertyForm.tsx` |
| 3 | `AddonsSpecialsTab.tsx`, `PackagesTab.tsx`, `ImagesTab.tsx`, `TemplatesTab.tsx` | `PropertyForm.tsx` |
| 4 | `usePropertyFormState.tsx` | `PropertyForm.tsx` |

## What does NOT change
- No database migrations or edge function changes
- No routing changes
- No user-facing behavior changes
- Already-extracted components (`RoomManagerTab`, `RateManagerTab`, `usePMSSync`, `BrandingTab`, `ROLSpecTab`, `PropertyFormIntegrationsTab`, etc.) remain untouched

## Target outcome
`PropertyForm.tsx` reduced from 8,134 → ~1,500 lines. All tab logic co-located with its UI. Modern React patterns throughout.

