# Make Connect work inside the Channel Manager

Clicking a specific channel does nothing because our host page around the vendor's channel client is missing the assets its Connect dialog needs, and the frame is not allowed to open a real sign-in window. Fix is to strip our extras and follow the vendor's documented install exactly.

## What changes

1. **Rebuild the embed host page** (`public/ru-embed.html`)
   - Add the documented head assets, verbatim: `<base href="/">`, Open Sans, jQuery 3.4.1, Popper 1.16.0, Bootstrap 3.3.7 (CSS + JS, with integrity/crossorigin), Font Awesome 4.6.3.
   - Replace jQuery 3.7.1 with 3.4.1; no second Bootstrap version anywhere on that document.
   - Keep only `html, body { margin:0; padding:0; height:100%; background:#fff }` and `#ruApp { min-height:100% }`.
   - Delete: the centering/float/`max-width:1280px` rules on `.container`/`.row`/card lists, the logo-fallback spans and image-error rewriter, the 1s `setInterval` image scan, and the theme `postMessage` handler.
   - Keep the boot sequence: read `token`, `refreshToken`, `ownerId`, `languageId`, `uiVersion` from the query string; missing pair → `ru-wl-error`; inject the one-line script with `uiVersion=2`; script error → `ru-wl-error`.
   - Ready signal: first channel card seen, or 8s after script load, whichever comes first → `ru-wl-ready`, then disconnect the observer permanently. No post-boot DOM edits.

2. **Frame permissions** (`src/components/pms/channels/RuWhiteLabelEmbed.tsx`)
   - sandbox becomes `allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation-by-user-activation` so channel sign-in windows open as normal browser windows.
   - Keep the same-origin `/ru-embed.html?…` src (no `srcdoc`), keep the token shape untouched, leave `referrerPolicy` default.
   - Bump `EMBED_DOCUMENT_VERSION` (currently `2026-08-05-2`) so cached host pages reload.
   - Loading overlay: unmount on ready, and make it non-interactive while visible so it can never swallow a click.

3. **Remove the extra card from the live Channels canvas** (`src/components/onboarding/channel/ChannelOnboardingWorkspace.tsx`)
   - Drop `<ChannelConnectEligibilityPanel …>` from the compact-live branch (around line 759). Keep `RuCurrencyNotice` and the embed.
   - It is only rendered there, so no other branch changes. Keep the go-live steps 1–5 and the Ready-to-sell scorecard as they are.
   - Keep the files `ChannelConnectEligibilityPanel.tsx`, `channelConnectRequirements.ts` and `goToField` for a later staff-only page.

## Untouched

Token minting (`ru-whitelabel-token`, `useRuWhiteLabelTokens`), legacy connect cards, Channel Monitor, entitlement gating, currency verify card, property form registry, all channel XML verbs. No new tables, no edge function changes, no reading or patching the vendor DOM.

## How we confirm

- Channels page still shows the vendor catalogue with "Connect more channels".
- Clicking a channel opens the vendor's connect dialog; channels that need external sign-in open a normal popup.
- No "What this sales channel will check" card on that page, no substituted logo labels inside the frame, app routing unchanged.

If Connect still fails after this, the remainder is on the channel vendor's side (profile certification, channel not enabled, missing API scope) and will be surfaced as a staff-only banner — not another overlay.
