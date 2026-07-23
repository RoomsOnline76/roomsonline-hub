## Goal
Surface PriceLabs Push/Pull and suggestions directly inside **ROL'OS → Revenue Mgmt** as a new tab, so it's discoverable without hunting the sidebar.

## Changes

1. **`src/pages/pms/PMSRevenue.tsx`**
   - Add a new `TabsTrigger value="pricelabs"` with the Sparkles icon, placed after **Rate Suggestions** in the tab list at line 762–767.
   - Add a matching `TabsContent value="pricelabs"` that renders the existing PriceLabs UI.

2. **`src/pages/pms/PMSPriceLabs.tsx`**
   - Extract the page body (config panel + Push/Pull buttons + suggestions table) into an exported `PriceLabsPanel` component that accepts `propertyId` as a prop.
   - Keep the default page export as a thin wrapper (`<PriceLabsPanel propertyId={usePmsPropertyId()} />`) so the standalone `/pms/pricelabs` route still works.
   - The Revenue Mgmt tab imports `PriceLabsPanel` and passes the currently selected property.

3. **`src/config/navigation.ts`** — leave the standalone `pms-pricelabs` nav entry in place (harmless fallback for deep links).

## Result
- In Revenue Mgmt (Single-property view), a new **PriceLabs** tab appears alongside Demand Forecast, Performance, Rate Suggestions, Active Plans, Yield Rules, Rate Strategies.
- The tab contains the enable toggle, floor/ceiling settings, credentials override (admin only), Push-to-PriceLabs and Pull-Suggestions buttons, and the per-date suggestions table with Apply actions — identical to the standalone page.
- No backend or edge-function changes needed; secrets `PRICELABS_INTEGRATION_NAME` / `PRICELABS_INTEGRATION_TOKEN` are already configured.
