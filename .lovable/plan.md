## Goal

When a property is part of one or more portfolios, surface a copy-paste snippet on the **Integrations** page (just like the existing widget/embed snippets) that owners can drop into their external portfolio landing page. The snippet calls `setOriginPortfolio(portfolioId)` so any subsequent booking is tagged with `origin_portfolio_id` and feeds the cross-property revenue-share pipeline.

## Where it lives

Extend `src/components/integrations/PortfolioWidgetTab.tsx` (already rendered inside `PMSIntegrations`) with a new **"Origin Tracking Tag"** card directly under the existing portfolio embed snippets. Reuses the same `CodeSnippetBlock` + clipboard pattern, so the UX matches every other integration code block.

## What gets generated

For the portfolio selected in the existing dropdown (only portfolios this property belongs to), generate three copy-able variants:

1. **Drop-in script tag** — paste into the `<head>` or before `</body>` of the portfolio landing page:
   ```html
   <!-- ROL'OS Portfolio Origin Tag -->
   <script>
     (function () {
       try {
         sessionStorage.setItem('rol_origin_portfolio_id', '<PORTFOLIO_UUID>');
         sessionStorage.setItem('rol_origin_url', window.location.href);
       } catch (e) {}
     })();
   </script>
   ```

2. **Link decorator** — append to any outbound booking/embed link so origin survives a new tab/session:
   ```
   https://book.sleepinafrica.roomsonline.co.za/embed/portfolio/<slug>?ref_portfolio=<PORTFOLIO_UUID>
   ```

3. **NPM / module call** (for owners building their own React landing page):
   ```ts
   import { setOriginPortfolio } from '@rolos/origin';
   setOriginPortfolio('<PORTFOLIO_UUID>');
   ```

Each variant gets its own labelled `CodeSnippetBlock` with a copy button and short "where to paste" helper text.

## Supporting wiring

To make variant 2 (`?ref_portfolio=`) actually work, add a tiny hydration step at app entry:

- In `src/lib/bookingOrigin.ts`, add `hydrateOriginFromUrl()` that reads `ref_portfolio` (and optional `ref_url`) from `window.location.search` and calls `setOriginPortfolio(...)`.
- Call it once from `src/main.tsx` (or the existing brand-override bootstrap) so any booking, embed, or portfolio route honours the query param.

No other behaviour changes — `captureBookingOrigin()` already reads the sessionStorage key the snippet writes.

## UI / UX details

- Card title: "Portfolio Origin Tracking" with `Sparkles` icon, sub-copy explaining it powers cross-property revenue share.
- Show one snippet card per portfolio the property is a member of (collapsed accordion when >1).
- Disabled empty-state when the property isn't in any portfolio: "Join a portfolio in Admin → Portfolios to enable origin tagging." with a link.
- Uses existing semantic tokens (no hardcoded colours), matches the look of `WidgetTab` / `BookingBarTab`.

## Files

- Edit: `src/components/integrations/PortfolioWidgetTab.tsx` — add the new "Origin Tracking Tag" section + snippet generators.
- Edit: `src/lib/bookingOrigin.ts` — add `hydrateOriginFromUrl()`.
- Edit: `src/main.tsx` — call `hydrateOriginFromUrl()` at startup.
- (Optional) Edit: `src/components/integrations/IntegrationDocumentation.tsx` — add a short "Portfolio Origin Tag" doc entry mirroring the snippet.

No DB migrations, no edge function changes.
