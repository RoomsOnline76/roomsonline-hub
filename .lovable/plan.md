# Plan: /rooms — single property dropdown + Property/Portfolio toggle

## Problem
On `/pms/rooms` (`src/pages/pms/PMSRooms.tsx`) the page header carries a property `Select` (top-right) that mixes "All properties" with each individual property, plus prev/next cycle buttons and a counter. The sidebar already provides a property switcher (top-left, for platform users), so the page dropdown is redundant. The user wants only the top-left dropdown and a Property/Portfolio toggle instead of the page dropdown.

## Current state (verified)
- `PMSRooms.tsx` uses local state `propertyScope` (`ALL_PROPERTIES` sentinel vs a property id) and derives `isPortfolio = propertyScope === ALL_PROPERTIES && properties.length > 1`.
- Header (lines ~513–564) renders: title (left) + a cluster (right) with prev button, `Select` (All properties + each), next button, counter, Refresh, Add Room.
- `usePmsPropertyId` exposes `showPortfolioToggle` (true when portfolio has >1 property), `propertyId`, `properties`, `switchProperty` — the same hook the sidebar switcher drives.
- `PMSRevenue.tsx` (lines 696–745) already implements the target pattern: a segmented `Portfolio | Single` toggle gated on `showPortfolioToggle`, with no separate "All properties" option.

## Change (scoped to `src/pages/pms/PMSRooms.tsx`)
1. **Drop the page property dropdown + cycle controls.** Remove `ALL_PROPERTIES`, `propertyScope`, `selectSingleProperty`, `currentIdx`, `canCycle`, `goPrev`, `goNext`, the header `Select` block, and the prev/next buttons + counter.
2. **Add a `viewMode` state** (`"single" | "portfolio"`), defaulting to `"portfolio"` when `showPortfolioToggle` is true and there are multiple properties, else `"single"`.
3. **Derive scope from the toggle:** `isPortfolio = viewMode === "portfolio" && (portfolioProperties?.length ?? properties.length) > 1`. In single mode, `activePropertyIds = propertyId ? [propertyId] : []`. In portfolio mode, `activePropertyIds = (portfolioProperties || properties).map(p => p.id)`.
4. **Render a segmented toggle** in the header right cluster (next to Refresh), gated on `showPortfolioToggle`, mirroring PMSRevenue: `Portfolio` (active in portfolio mode) / `Property` (active in single mode). Single-property accounts see no toggle and stay in single mode — unchanged behaviour.
5. **Property switching in single mode** is handled by the sidebar switcher (top-left), which writes `propertyId` via `switchProperty`. The page reads `propertyId` from the hook. No in-page property `Select`.
6. **Keep** Refresh, Add Room (single mode only), ReservationFinder, and all filter chips unchanged. Update the subtitle text to read "Portfolio view — N properties" vs the single-property copy.
7. Update the early-return guard: `if (!propertyId && !isPortfolio) return <PmsNoPropertyState …/>` stays valid.

## Edge case (noted, not blocking)
Non-platform users with multiple properties in a portfolio don't see the sidebar switcher. They still get the Portfolio toggle (all properties) and, in single mode, operate on the currently selected property via URL/shared store. If switching within single mode is needed for them, a follow-up can add a compact single-mode Select like PMSRevenue — out of scope here per the user's "only top left is needed" instruction.

## Files
- `src/pages/pms/PMSRooms.tsx` (only file touched)

## Verification
- Build/typecheck pass.
- On `/pms/rooms` with a multi-property portfolio: header shows a `Portfolio | Property` toggle; no property dropdown on the right; sidebar switcher (left) picks the active property in Property mode; Portfolio mode stacks all property bands.
- Single-property account: no toggle, single property shown — identical to today.
