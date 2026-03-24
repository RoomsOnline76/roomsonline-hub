

# Standalone Portfolio Management Page

## Overview
Create a full-page admin tool at `/admin/portfolios` where admin/dev users can create, edit, and manage cross-owner portfolios — viewing member properties with owner labels, editing portfolio details inline, and managing property membership without needing to navigate into any specific property's edit form.

## Changes

### 1. Create `src/pages/admin/AdminPortfolios.tsx`
Full-page portfolio management with:
- **Portfolio list** (table or card grid): name, slug, owner, property count, created date, actions
- **Create Portfolio** dialog (reuse pattern from `PortfolioManager.tsx`): name, slug, property picker with owner name shown next to each property
- **Edit Portfolio** dialog: update name/slug, add/remove member properties
- **Delete** with confirmation
- Property picker shows all active properties grouped or labeled by owner email so admin/dev can build cross-owner portfolios
- Each portfolio row expands or links to show its member properties
- Embed snippet preview (portfolio slug → `/embed/portfolio/:slug`)

### 2. Add route in `App.tsx`
`/admin/portfolios` → `AdminPortfolios` wrapped in `ProtectedRoute requireAdmin`

### 3. Add nav item in `navigation.ts`
Add `{ id: 'portfolios', title: 'Portfolios', icon: FolderOpen, href: '/admin/portfolios', minRole: 'admin' }` to the Administration section

## Files
| Action | File |
|--------|------|
| Create | `src/pages/admin/AdminPortfolios.tsx` |
| Modify | `src/App.tsx` — add route |
| Modify | `src/config/navigation.ts` — add nav item |

