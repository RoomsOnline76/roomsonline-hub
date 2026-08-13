# Test flag becomes a marker only — Trading is the single counting gate

Right now the "⚠ Test" checkbox silently also sets a second, hidden flag (`is_sandbox`), and that hidden flag is what several counters, dashboards and channel screens filter on. That means marking a property as being under test quietly pulls it out of counts *and* out of channel/Rentals United tooling, even when Trading is switched on. This plan separates the two concerns.

## Intended behaviour

- **Trading toggle** — the only thing that decides whether a property's data reaches dashboards, counters, occupancy, forecasts and revenue reporting.
- **Test flag** — a label to find properties used for feature development. It changes nothing else: the property behaves as a natural property everywhere, including channel/RU pushes, syncs, readiness, monitors and certification screens.

## What changes

1. **Stop coupling the two flags.** Ticking Test no longer writes the sandbox flag. Test properties keep whatever Trading state they were given.
2. **Counts follow Trading only.** The shared trading-scope helpers (client and edge) drop the sandbox condition, so every dashboard, KPI, forecast and acquisition tracker that uses them counts a Test property exactly as it counts any other trading property.
3. **Channel / RU surfaces stop filtering out test rows.**
   - Channel Cost Monitor counters (sub-accounts, push enabled, forecast spend) include test rows.
   - Portfolio RU accounts tab stops excluding them.
   - RU certification portal listings stop excluding them.
4. **Copy and badges.** Identity & Location keeps two clearly separate controls: Flags (ROL / Test) and Trading status. The Trading helper text no longer says a test property is "never counted"; the Test label reads as "under test — behaves normally, excluded from nothing". Existing amber Test badges elsewhere stay as-is, since finding these properties is the point.
5. **Genuine sandbox environments are untouched.** Payment-gateway sandbox mode and the Hostfully sandbox OAuth path are separate mechanisms (driven by gateway config and `[SANDBOX]` name patterns) and keep working exactly as they do now.

No database migration and no data edits: the legacy sandbox column simply stops being read as a gate, so nothing has to be rewritten on existing rows.

## Technical notes

- `src/lib/propertyScope.ts` and `supabase/functions/_shared/propertyScope.ts`: `isTradingProperty`, `applyTradingScope`, `applyTradingScopeOn` reduce to the `is_trading` condition; `TRADING_SCOPE_COLUMNS` narrows to `is_trading`. `isSandboxProperty` stays exported for badge/label use only.
- Direct `.eq("is_sandbox", false)` call sites to update: `src/pages/Dashboard.tsx`, `src/pages/DevOverview.tsx`, `src/pages/AdminDashboard.tsx`, `src/components/dashboard/PortfolioDemandForecast.tsx`, `src/components/dashboard/PropertyAcquisitionTracker.tsx`, `src/hooks/useChannelCostMonitor.ts` (lines 341, 362), `src/components/portfolio/PortfolioRuAccountsTab.tsx` (line 742), `supabase/functions/ru-cert-portal/index.ts` (two `.neq("is_sandbox", true)` filters).
- `src/pages/PropertyForm.tsx`: remove `setIsSandbox` from the Test checkbox handler and stop OR-ing `isTestProperty` into the saved `is_sandbox` value; update the Trading status helper copy. `src/components/property/GeneralTab.tsx` label wording aligned.
- `src/pages/PropertyOverview.tsx`: keep the sandbox/test detection for the badge, but stop using it inside the trading computation.
- Redeploy `ru-cert-portal` after the edge-side change.
