# Fix /rooms property scoping

## Problem

The Rooms page opens in Portfolio view by default whenever the selected property belongs to a portfolio, so the grid shows sibling properties even though the top-left switcher points at one property. Switching the property from the top-left switcher does not reset the scope, so the extra properties stay on screen until the user manually clicks "Property".

There is also a fallback where, if the selected property has no portfolio, the portfolio list falls back to *every* property the account can see — a wider set than the property's own portfolio.

## What changes

1. Default the Rooms scope to the selected property (Property view), not Portfolio.
2. When the property is changed from the top-left switcher, snap the scope back to that property so the grid only shows it.
3. Portfolio view shows exactly the selected property's portfolio siblings — never a fallback to all visible properties. If the property has no portfolio, the toggle stays hidden and only that property is shown.
4. Keep the Portfolio | Property toggle in the header for portfolios, so the user can deliberately widen to the whole portfolio.

Result: the grid always matches either the selected property or its portfolio, and never mixes in unrelated properties.

## Technical notes

- `src/pages/pms/PMSRooms.tsx`
  - Remove the `autoDefaulted` effect that flips `viewMode` to `"portfolio"` when `showPortfolioToggle` is true; initialise `viewMode` as `"single"`.
  - Change `portfolioList` to `portfolioProperties ?? []` (drop the `|| properties` fallback) and derive `isPortfolio` from that list only.
  - Add an effect keyed on `propertyId` that resets `viewMode` to `"single"` when the shared selection changes, so sidebar switches re-scope the page.
  - Verify `activePropertyIds`, the empty-state guard, and the property section builder still behave when `portfolioList` is empty.
- No data, RLS, or query-shape changes; all fetches already filter with `.in("property_id", activePropertyIds)`.
