---
name: RU White Label Channel Manager embed (ROL'OS Channels)
description: ROL'OS /pms/channels is a full-height Rentals United White Label one-line-script embed with server-minted token pair
type: feature
---

`src/pages/pms/PMSChannels.tsx` is header + currency notice + a single full-height
Rentals United **White Label Channel Manager** embed. No ROL'OS connection cards,
mapping tables or sync log live on this page — all of that is inside the RU UI.
The RU Readiness scorecard and onboarding pipeline live on the admin RU pages.

Embed method = docs "Option 2: One-Line Script": empty `<div id="ruApp">` +
injected `https://new.rentalsunited.com/white-pms-client/script?token=…&refreshToken=…&languageId=1&uiVersion=2&ownerId=…`.
`RuWhiteLabelEmbed.tsx` tears the script down and empties `#ruApp` on token/property
change so two clients are never mounted.

Token pair comes from `useRuWhiteLabelTokens(propertyId)` →
`supabase/functions/ru-whitelabel-token`, which resolves the owner account
(`findOwnerAccount`: portfolio → property → owner email), then:
cached pair on `ru_owner_accounts.ru_wl_access_token/_refresh_token/_expires_at`
→ mint by signing in with `ru_login_email` + decrypted `ru_login_password_enc`
→ admin-pasted pair (`ru_wl_token_source = 'admin'`, entered in
`RuWhiteLabelTokenFields` inside the property RU owner panel).

Verified 2026-08: RU exposes no public programmatic portal login
(`/api/authorization/login`, `/api/auth/login`, `/api/account/login` all 404), so in
practice the admin-pasted pair is the working source; the mint path stays as a
forward-compatible fallback. The script endpoint itself returns 403 for an invalid token.
Tokens are never logged and are not persisted in the browser (`gcTime: 0`).
The existing Channel Manager billing lock still short-circuits the page.

Update 2026-08 (gating, states, branding):
- Page is gated **strictly**: `channel_manager_enabled === true` required (unset/null ⇒ locked card).
- Below the embed: "Don't see your channel manager? Let's talk — we'll bring it on board." (`/contact`).
- The embed obeys the property ROL'OS branding / white-label toggle: when `usePMSBrand().brandEnabled`,
  brand custom props (`--ru-brand-*`, `--primary-color`, `--secondary-color`, `--accent-color`, `--text-color`)
  and the frame border/text colour follow the property palette.
- Never tell a connected owner to "complete RU sub-user setup". `ru-whitelabel-token` reads the canonical
  sub-user key store `ru_api_credentials` (+ `ru_owner_accounts.ru_api_access_key`) and returns
  `sub_user_verified: true` with reason `awaiting_wl_token`; the UI then says the account is connected and
  the Channel Manager sign-in is being finalised. Diagnostic message text is shown to staff roles only.
