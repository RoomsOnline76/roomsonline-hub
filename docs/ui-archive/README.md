# UI Archive - RoomsOnline Current State

**Version**: 1.0.0  
**Created**: 2025-01-07  
**Purpose**: Pre-transformation UI state capture for Phase 2 redesign

---

## Overview

This archive documents the exact current state of the RoomsOnline application UI/UX with zero redesign recommendations. It serves as:

- **Rollback reference** for reverting changes
- **Baseline comparison** for measuring Phase 2 improvements
- **Regression safety** for engineers and future AI systems

---

## Archive Contents

- `current-state.json` - Machine-readable complete snapshot
- `README.md` - This documentation file

---

## Quick Reference

### Route Summary

| Category | Count | Examples |
|----------|-------|----------|
| Public | 8 | `/`, `/property/:id`, `/booking/:id` |
| Auth Required | 15 | `/admin/*`, `/dashboard/*` |
| Admin Only | 4 | `/admin-users`, `/admin/access-requests` |
| Dev Only | 4 | `/admin-keys`, `/nb`, `/admin/test-booking-benson` |

### Largest Files (Complexity Indicators)

1. `AdminKeys.tsx` - 3,231 lines
2. `CalendarAccommodation.tsx` - 2,279 lines
3. `Dashboard.tsx` - 1,560 lines
4. `Bookings.tsx` - 903 lines
5. `PropertyOverview.tsx` - 756 lines

### Design System Summary

- **Primary Color**: `hsl(338 82% 52%)` (Pink/Magenta)
- **Accent Color**: `hsl(199 89% 48%)` (Cyan/Blue)
- **Font Stack**: System fonts (no custom)
- **Base Radius**: `0.75rem` (12px)
- **Component Library**: shadcn/ui + Tailwind CSS

---

## Constraints (Do Not Violate)

### Immutable Files

```
supabase/functions/_shared/adapter-contract.ts
supabase/functions/push-booking/index.ts (hard rules section)
src/integrations/supabase/client.ts
src/integrations/supabase/types.ts
.env
supabase/config.toml
```

### Booking Flow Invariants

1. Live PMS availability check is MANDATORY before booking
2. Never book from cached data
3. All PMS responses must use snake_case fields

### Role Boundaries

- `dev` → Full access including API keys
- `admin` → User management, insights, journals
- `user` → Own properties only

---

## Usage

### For Engineers

Reference `current-state.json` when:
- Implementing Phase 2 changes
- Debugging regression issues
- Understanding current data flows

### For AI Systems

Parse `current-state.json` to:
- Understand existing patterns
- Maintain backward compatibility
- Verify constraint compliance

---

## Schema

The `current-state.json` file follows this structure:

```typescript
interface UIArchive {
  metadata: ArchiveMetadata;
  routes: RouteDefinition[];
  navigation: NavigationStructure;
  pages: PageLayout[];
  components: ComponentInventory;
  design_language: DesignTokens;
  backend_dependencies: DataMapping[];
  constraints: ConstraintSnapshot;
  pain_points: PainPoint[];
}
```

See the JSON file for complete data.
