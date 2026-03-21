

# Embeddable PMS-Agnostic Booking Widget — `rol-embed.js`

## Goal
Create a standalone, CDN-hosted JavaScript snippet that any property owner can paste into any website (WordPress, Wix, Squarespace, static HTML) to get a fully functional, white-labelled booking engine. One line of code, 30-minute setup — the Homerunner-killer feature.

## Architecture Overview

```text
┌──────────────────────────────┐
│  Owner's Website (any CMS)   │
│  <script src="widget.rol...  │
│    /rol-embed.js">           │
│  <div id="rolos-booking"     │
│    data-property="slug"      │
│    data-brand-color="#xxx">   │
└──────────┬───────────────────┘
           │ iframe / postMessage
           ▼
┌──────────────────────────────┐
│  /embed/property/:slug       │
│  (Existing EmbedProperty.tsx │
│   + enhanced config params)  │
└──────────┬───────────────────┘
           │ Supabase client
           ▼
┌──────────────────────────────┐
│  Existing PMS Adapters       │
│  (roomsonline-pms-api,       │
│   hostfully, benson, etc.)   │
│  + push-booking              │
└──────────────────────────────┘
```

**Key insight**: The embed page (`EmbedProperty.tsx`) and booking flow (`Booking.tsx` → `push-booking`) already do everything — live availability, room selection, checkout, PMS push. The missing piece is a lightweight JS loader that creates and manages the iframe from any external site.

## Changes

### 1. Create `public/rol-embed.js` — CDN-hosted universal loader (~150 lines)
Self-contained IIFE script that:
- Scans for `<div data-rolos-property="slug">` containers on the page
- Reads config from data attributes: `data-brand-color`, `data-brand-logo`, `data-height`, `data-layout` (compact/standard/full), `data-payment-provider`, `data-lang`
- Creates a responsive iframe pointing to `book.sleepinafrica.roomsonline.co.za/embed/property/{slug}` with all config as URL params
- Handles iframe auto-resize via `postMessage` (height sync)
- Supports multiple widgets on one page
- Provides a global `window.RolosBooking` API for programmatic control (open, close, setDates)
- Zero dependencies, <10KB minified

**Usage (one-liner):**
```html
<script src="https://widget.roomsonline.co.za/rol-embed.js"></script>
<div data-rolos-property="ocean-view-lodge"></div>
```

**Advanced:**
```html
<div data-rolos-property="ocean-view-lodge"
     data-brand-color="#2563eb"
     data-brand-logo="https://example.com/logo.png"
     data-layout="compact"
     data-height="600">
</div>
```

### 2. Create edge function `booking-widget-api` — Public widget config endpoint
Lightweight edge function that:
- Accepts `GET /booking-widget-api?slug=xxx` (no auth required — public)
- Returns property config: name, brand colours, logo, payment provider, external_system, room types, and a pre-signed embed URL
- Caches responses (5-min TTL via Cache-Control headers)
- This lets `rol-embed.js` validate the property exists before creating the iframe, and pre-fetch brand config for loading states

### 3. Enhance `EmbedProperty.tsx` — Accept full white-label config via URL params
Add support for additional URL parameters:
- `brand_logo` — override logo URL
- `brand_secondary_color` / `brand_font_color` — full palette control
- `layout` — compact (date picker + book button only), standard (current), full (property info + gallery + rooms + calendar)
- `hide_powered_by` — optional removal of "Powered by ROL'OS" footer
- `payment_provider` — pass through to booking flow
- `lang` — future i18n support (placeholder)

### 4. Add iframe ↔ parent `postMessage` protocol
In `EmbedProperty.tsx` and `Booking.tsx`:
- Post `{ type: 'rolos:resize', height: N }` on content changes (via ResizeObserver)
- Post `{ type: 'rolos:booking-complete', bookingId, confirmationNumber }` on successful checkout
- Post `{ type: 'rolos:navigate', step: 'availability' | 'rooms' | 'checkout' | 'confirmation' }` for step tracking
- Listen for `{ type: 'rolos:setDates', checkIn, checkOut }` from parent

In `rol-embed.js`:
- Listen for resize messages and update iframe height
- Emit custom DOM events on the container: `rolos:booking-complete`, `rolos:step-change`

### 5. Add `WidgetSetupWizard` component — Admin UI for generating the snippet
New component at `/admin/integrations` or within the existing integration tabs:
- Property selector dropdown
- Visual brand customizer (color picker, logo upload, layout selector)
- Live preview iframe
- One-click copy of the `<script>` + `<div>` snippet
- QR code for the direct booking URL
- Installation guides for WordPress (plugin or manual), Wix, Squarespace, and generic HTML

### 6. Update existing integration tabs
- Update `WidgetTab.tsx` to reference the new `rol-embed.js` snippet as the **recommended** method (simpler than raw iframe)
- Keep existing iframe/JS snippets as "Advanced" options
- Add the `rol-embed.js` snippet as the primary code block

### 7. Track widget interactions
- Enhance existing `track-embed-interaction` edge function to log widget loads, date selections, and booking starts with `source=rol-embed`
- Add `integration=rol_embed` tracking parameter

### 8. Update Connect portal documentation
- Add a "Widget Installation" guide page under Connect docs
- Document the `data-*` attributes API
- Add curl examples for `booking-widget-api`
- Include WordPress, Wix, Squarespace step-by-step guides

## Technical Details

**`rol-embed.js` core logic:**
```javascript
(function() {
  var BASE = 'https://book.sleepinafrica.roomsonline.co.za';
  var containers = document.querySelectorAll('[data-rolos-property]');
  containers.forEach(function(el) {
    var slug = el.getAttribute('data-rolos-property');
    var params = new URLSearchParams({
      integration: 'rol_embed',
      mode: 'embedded',
      brand_color: el.getAttribute('data-brand-color') || '',
      layout: el.getAttribute('data-layout') || 'standard',
    });
    var iframe = document.createElement('iframe');
    iframe.src = BASE + '/embed/property/' + slug + '?' + params;
    iframe.style.cssText = 'width:100%;border:none;border-radius:8px;';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('allow', 'payment');
    el.appendChild(iframe);
  });
  // postMessage height sync listener
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'rolos:resize') {
      // find matching iframe and resize
    }
  });
})();
```

**postMessage protocol:**
```typescript
// From iframe → parent
{ type: 'rolos:resize', height: number, slug: string }
{ type: 'rolos:booking-complete', bookingId: string, confirmationNumber: string }
{ type: 'rolos:step-change', step: string, slug: string }

// From parent → iframe  
{ type: 'rolos:setDates', checkIn: string, checkOut: string }
{ type: 'rolos:setPromo', code: string }
```

## Files to Create/Modify
1. **Create** `public/rol-embed.js` — Universal widget loader
2. **Create** `supabase/functions/booking-widget-api/index.ts` — Public config endpoint
3. **Modify** `src/pages/EmbedProperty.tsx` — Extended URL param support + postMessage emitter
4. **Modify** `src/pages/Booking.tsx` — postMessage emitter for booking events
5. **Create** `src/components/integrations/WidgetSetupWizard.tsx` — Admin snippet generator
6. **Modify** `src/components/integrations/WidgetTab.tsx` — Add rol-embed.js as primary snippet
7. **Modify** `supabase/functions/track-embed-interaction/index.ts` — Track `rol_embed` source
8. **Update** `src/data/rolos-api-actions.ts` — Document `booking-widget-api` in API reference

## Result
- Property owners paste **one line** of HTML into any website
- Full booking flow: availability → room selection → checkout → PMS sync
- Works with all 13+ PMS adapters via existing unified model
- Fully white-labelled: brand colours, logos, payment provider
- Zero site rebuild required — matches Homerunner's 30-min setup promise
- Richer than Homerunner: supports ROL-native depth, multi-PMS, and the complete adapter contract

