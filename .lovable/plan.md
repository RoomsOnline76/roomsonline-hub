# Add Portfolio View Toggle to ROL'OS Dashboard

## What
Add a toggle next to the property selector that switches between **Single Property** view (current behavior) and **Portfolio** view. In portfolio view, the calendar grid shows all portfolio properties stacked, each with a property name header row followed by its room types/rooms.

## How

### 1. Add state + toggle UI
In `PMSDashboard.tsx`, add a `dashboardView` state (`"single" | "portfolio"`). Render a toggle button group (similar to `PulseViewToggle` style) next to the property selector. Only show when `portfolioProperties` exists and has >1 property.

### 2. Portfolio data fetching
When in portfolio view, fetch room types, rooms, bookings, rate data, and overrides for **all** portfolio property IDs (not just the selected one). Use parallel queries keyed by `portfolioProperties.map(p => p.id)`.

### 3. Portfolio calendar rendering
When `dashboardView === "portfolio"`, render a modified grid that groups by property:
- For each property in the portfolio, render a **property header row** (property name, styled distinctly)
- Below it, render that property's room types and rooms (same grid cells as current single-property view)
- Stat pills at the top aggregate across all portfolio properties

### 4. Reuse existing grid components
Pass property-scoped data subsets to the existing `WeekCalendarGrid` / `MonthCalendarGrid` components per property, or extend them to accept a `propertyGroups` array.

## Files to Change

| File | Changes |
|------|---------|
| `src/pages/pms/PMSDashboard.tsx` | Add `dashboardView` state, toggle UI, multi-property data fetching, grouped rendering loop |
