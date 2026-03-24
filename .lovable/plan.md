

# Add Portfolio Tab to Admin Integrations Page

## Problem
The `/admin/integrations` page is missing the **Portfolio** tab that exists on both `PropertyFormIntegrationsTab` and `PMSIntegrations`. An owner with multiple properties (possibly across different PMS systems) currently has no way to configure a combined portfolio embed from this page — they'd have to know about `/admin/portfolios` separately.

The Portfolio Widget tab already exists and works well (`PortfolioWidgetTab.tsx`) — it lets a user select a portfolio, configure branding, and get embed snippets. It just needs to be added to the Admin Integrations page alongside the existing 8 tabs.

## Changes

### 1. Add Portfolio tab to `src/pages/AdminIntegrations.tsx`
- Import `PortfolioWidgetTab` and `Building2` icon
- Add a 9th tab trigger: "Portfolio" with `Building2` icon (matching the other integration pages)
- Add the `TabsContent` rendering `<PortfolioWidgetTab property={currentProperty} />`
- Update grid from `grid-cols-8` to `grid-cols-9`

### 2. Add inline portfolio creation shortcut
- Below the portfolio selector in `PortfolioWidgetTab.tsx`, add a "Create Portfolio" link/button that navigates to `/admin/portfolios` — so owners and admins can quickly create a new portfolio if none exist yet, without needing to discover the standalone page

This is a small UI gap fix — all the underlying portfolio infrastructure (tables, embed page, edge function, `rol-embed.js` support) is already built and working.

## Owner Workflow After Fix
1. Go to `/admin/integrations`
2. Select any property → click **Portfolio** tab
3. See portfolios this property belongs to (or all portfolios for admin/dev)
4. Select a portfolio → configure brand color, logo, layout
5. Copy the one-line snippet or iframe code
6. Paste on their website → visitors see all portfolio properties with search/filter and per-property booking

