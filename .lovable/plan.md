
# White-Label Integrations — In-Page, Chrome-less, Own-Domain

Today every Integrations tab (`/rolos/integrations`) generates code that either navigates to `book.sleepinafrica.roomsonline.co.za` or embeds an iframe that shows our chrome (PublicHeader / PublicFooter / PoweredByRolOS / JourneyBuilder). This plan adds a real white-label path so the guest never leaves the property's own site and — where possible — never sees our URL.

## Gate

Reuse the existing property/portfolio flag `white_label_allowed` (already on `property_billing_configs`, referenced by `calculate-billing`, `BillingConfigTab`, `PaymentAdviceDialog`, `BookingConfirmation`). The Integrations page reads it via the property/portfolio record. When true:

- Every card shows a **"White-label mode"** badge and switches its preview + snippet output to the WL variants below.
- When false, the card behaves exactly as today (no visual change).

No new toggle. No schema change.

## Three delivery modes (per user decision, all shipped, chosen per card)

```text
Mode A  Headless JS SDK           in-page DOM, property's URL, no iframe
Mode B  Chrome-less iframe        embedded in property page, neutral path, no ROL chrome
Mode C  Custom subdomain (CNAME)  book.<their-domain> → our hosting, full page but on their DNS
```

Card → mode mapping:

| Card | Non-WL (today) | WL mode |
|---|---|---|
| Smart Button | opens book.sleepinafrica… in new tab | **A** — opens a modal on their page hosting Mode B iframe (no navigation away) |
| Direct Link | link to book.sleepinafrica… | **C** if CNAME configured, else Mode B modal launcher snippet |
| Widget | iframe → /embed/property/:slug | **B** — chrome-less route + snippet |
| Booking Bar | iframe bar → book.sleepinafrica… | **B** — chrome-less bar route, submit posts into same Mode B modal |
| Full Embed | full-page iframe | **B** (chrome-less) or **C** if configured |
| WordPress plugin | shortcode → iframe | **B** shortcode variant that also strips our origin from visible copy |
| Elementor | widget → iframe | **B** widget variant |
| Portfolio | iframe → /embed/portfolio/:slug | **B** — chrome-less portfolio route |

## New routes (chrome-less)

Add sibling routes under `/embed/*` that render exactly the same booking components but wrapped in a new `ChromelessLayout` (no header, no footer, no PoweredByRolOS, no JourneyBuilder). Path pattern keeps the neutral word `embed` and drops the "sleepinafrica" host when Mode C is used:

- `/embed/wl/property/:slug` — property booking flow
- `/embed/wl/portfolio/:slug` — portfolio browse+book
- `/embed/wl/bar/:slug` — booking bar
- `/embed/wl/confirmation/:bookingRef` — in-place confirmation view

All existing `PublicLayout` / `WhiteLabelLayout` references are untouched; new layout is additive.

## Headless SDK (Mode A)

New file `public/rol-sdk.js` (companion to `rol-embed.js`) exposing:

```js
window.RolosSDK.init({ property: 'slug', apiKey: 'pub_xxx' })
window.RolosSDK.searchAvailability({ checkIn, checkOut, guests })
window.RolosSDK.getRoomTypes()
window.RolosSDK.openCheckout({ selection, container })   // renders Mode B iframe inside `container` — property never leaves the page
window.RolosSDK.on('booking:complete', handler)
```

Under the hood it calls the existing `booking-orchestrator-api` and `booking-widget-api` edge functions. `openCheckout` mounts the Mode B iframe into a property-supplied element (usually a modal they already have), so checkout stays visually inside their site.

Smart Button's WL snippet uses this SDK to open an in-page overlay rather than `window.open(...)`.

## Custom subdomain (Mode C)

Add a **"Connect your booking subdomain"** panel to the Integrations page (only visible when `white_label_allowed`). It:

1. Lets the owner enter e.g. `book.theirdomain.com`.
2. Writes to a new column `property_billing_configs.white_label_domain text` (single migration; grants preserved).
3. Shows the CNAME target (`sleepinafrica.roomsonline.co.za`) and a "Verify" button that pings a lightweight edge function to check DNS resolution and issues a status pill (Pending / Active / Failed).
4. Once Active, Direct Link and Full Embed snippets swap `book.sleepinafrica.roomsonline.co.za` → `book.theirdomain.com`. Booking Confirmation emails also use this host via a helper `getWhitelabelHost(propertyId)` in `src/lib/config.ts`.

Provisioning SSL on their subdomain is a hosting responsibility — the plan surfaces the DNS instructions but does not attempt automatic cert issuance (out of scope; documented).

## Card-by-card edits

Each card gets a `whiteLabel` prop derived from the property record. Snippet generators branch on it:

- `DirectLinkTab.tsx` — swap URL host to WL domain when Active; otherwise render a "Book Now" button that loads the SDK and calls `openCheckout`.
- `WidgetTab.tsx`, `BookingBarTab.tsx`, `FullEmbedTab.tsx`, `PortfolioWidgetTab.tsx` — snippets point to `/embed/wl/...`; preview uses `ChromelessLayout`.
- `WordPressTab.tsx`, `ElementorTab.tsx` — shortcode/widget attributes gain `whitelabel="1"`; plugin already reads params and forwards to embed URL, so only the emitted host + path change here.
- `SmartBookButtonGenerator.tsx` — WL variant emits inline `<script src="…/rol-sdk.js">` + a data-attribute button that calls `RolosSDK.openCheckout` into a generated modal container.
- `EntryPointSelector.tsx` / `buildEntryUrl` — accept a `whitelabel` flag that flips the base host (Mode C domain) and the path prefix (`/embed/wl/...`).

`IntegrationDocumentation.tsx` gains a WL section per integration explaining behavior.

## Confirmation & emails

- `BookingConfirmation` gains a `?embed=wl` param that renders inside `ChromelessLayout` and posts `rolos:booking-complete` upward (SDK/embed already listen for this).
- `send-invoice`, `guest-portal-access`, `cancel-booking` emails: use `getWhitelabelHost(propertyId)` when the booking was created via a WL integration (booking row already has `origin` / `integration_source` from `bookingOrigin`). Fallback stays `PUBLIC_DOMAIN`.

## Booking origin

`src/lib/bookingOrigin.ts` — add `whitelabel: boolean` to the origin payload; the new `/embed/wl/*` routes call `hydrateOriginFromUrl` and set it. Downstream analytics + email host selection use this bit.

## Out of scope

- Automatic SSL provisioning for custom subdomains (documented, manual for now).
- Booking orchestrator / PMS adapters (locked — untouched).
- Changing how `white_label_allowed` is set or billed.
- Non-integration surfaces (portfolio pages, journey builder, guest portal live on our host by design).

## Files

**New**
- `src/components/layout/ChromelessLayout.tsx`
- `src/pages/embed/EmbedWlProperty.tsx`, `EmbedWlPortfolio.tsx`, `EmbedWlBar.tsx`, `EmbedWlConfirmation.tsx`
- `public/rol-sdk.js`
- `src/components/integrations/WhiteLabelDomainPanel.tsx`
- `supabase/functions/verify-whitelabel-domain/index.ts`
- one migration adding `white_label_domain` + `white_label_domain_status` on `property_billing_configs` (+ GRANTs)

**Edited**
- `src/App.tsx` (new `/embed/wl/*` routes)
- `src/lib/config.ts` (`getWhitelabelHost`, WL URL helpers)
- `src/lib/bookingOrigin.ts`
- `src/components/integrations/`: `DirectLinkTab`, `WidgetTab`, `BookingBarTab`, `FullEmbedTab`, `PortfolioWidgetTab`, `WordPressTab`, `ElementorTab`, `SmartBookButtonGenerator`, `EntryPointSelector`, `IntegrationDocumentation`, `PropertyFormIntegrationsTab` (fetch + pass `white_label_allowed` and WL domain)
- `src/pages/BookingConfirmation.tsx` (chrome-less variant when `?embed=wl`)
- `supabase/functions/send-invoice/index.ts`, `guest-portal-access/index.ts`, `cancel-booking/index.ts` (host selection helper)
