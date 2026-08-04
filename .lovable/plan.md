# Channels page: help line, hard billing gate, brand-aware embed, correct activation state

## 1. "Let's talk" line below the embed

Directly under the White Label embed, centered, muted small text:

`Don't see your channel manager? Let's talk — we'll bring it on board.`

"Let's talk" links to the existing contact route so an owner can request a new channel. Shown in every state of the page (embed loaded, loading, or not activated) so the invitation is always visible.

## 2. Channels stays gated until admin enables Channel Manager

Today the page only locks when the billing profile explicitly says `channel_manager_enabled = false`; a missing/unset value falls through to the embed. Change to strict: the embed renders only when Channel Manager is explicitly enabled (property, or the portfolio billing profile it inherits). Anything else — unset, false, or no billing profile — shows the existing "Channel Manager unavailable" card unchanged.

Verified for Tidal Pools: it inherits the Jongensfontein portfolio billing profile, where Channel Manager is enabled, so this property stays unlocked.

## 3. Embed adapts to the property's branding

The property's ROL'OS palette is already resolved by `PMSBrandContext` (Tidal Pools: primary `#1B7FAD`, secondary `#F5A623`, font `#333333`, white-label on). The Channels surface will consume it:

- The embed frame (border, background, spinner, empty-state icon, buttons, the "Let's talk" line) uses the branded semantic tokens instead of default chrome, so the page reads as the property's brand when branding/white-label is on, and falls back to ROL'OS styling when off.
- The White Label client is asked to theme itself: the brand colours are passed to the RU script container as CSS custom properties and, where RU's client renders into our DOM, a `#ruApp`-scoped style block maps those brand colours onto its variables. If RU renders its UI inside a cross-origin iframe, its internal colours cannot be restyled from our side — in that case the branded frame and surrounding chrome adapt and the inner client keeps RU's own theme. This will be confirmed live during the build and reported.

## 4. "Complete the RU sub-user setup first" is wrong for Tidal Pools — fix the activation logic

Confirmed by querying the backend:

- The RU sub-user **is** set up: verified API credentials exist for RU owner `741765` (`ru_api_credentials`, verified 3 Aug), which is the owner account resolved for Tidal Pools via its portfolio.
- The token resolver only looks at the RU owner-account row (`ru_owner_accounts`), where the API key, portal password and White Label token columns are all empty — so it returns "no credentials" and the page tells the owner to complete a setup that is already done.

Fixes:

- Resolve credentials from the verified sub-user credential store (`ru_api_credentials`, matched on RU owner id / login email) in addition to the owner-account row, so a verified sub-user is recognised.
- Attempt to obtain the White Label token pair using those verified sub-user keys before falling back, and cache the pair with its expiry as today.
- Replace the single generic empty state with accurate, distinct states:
  - no RU owner account for the property → "This property isn't linked to a Rentals United account yet."
  - sub-user verified but no White Label token pair yet → "Your Rentals United account is connected. The Channel Manager sign-in is being finalised — this is not a setup problem on your side." Admin/dev viewers additionally get a link into the property's RU owner panel where the White Label token pair can be pasted.
  - token minting failed → retry action plus the underlying reason (admin/dev only).
- The misleading "Complete the Rentals United sub-user setup first." copy is removed.

## Technical notes

- `src/pages/pms/PMSChannels.tsx`: strict billing gate, help line, branded wrapper.
- `src/components/pms/channels/RuWhiteLabelEmbed.tsx`: brand-aware frame + CSS variable injection, new state copy, admin-only detail.
- `src/hooks/useRuWhiteLabelTokens.ts`: surface the new reason codes.
- `supabase/functions/ru-whitelabel-token/index.ts`: read verified sub-user credentials from `ru_api_credentials`, try a key-based White Label token exchange, return granular reasons. Tokens stay server-minted, never logged, never persisted in the browser.
- No schema change. No changes to locked RU adapter push/pull or ARI paths.

## Verification

- `/rolos/channels` for Tidal Pools: no longer says "complete sub-user setup"; shows either the live embed or the accurate "finalising sign-in" state.
- Billing profile with Channel Manager off/unset → locked card; on → embed.
- Brand colours visible on the Channels frame for a branded property; default chrome for an unbranded one.
