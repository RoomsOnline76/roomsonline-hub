# ROL'OS Channels page → Rentals United White Label embed

## What the page becomes

`/rolos/channels` keeps the ROL'OS header and page chrome, and everything below it is replaced by a single full-height Rentals United White Label Channel Manager embed (Option 2: one-line script into a `#ruApp` container).

Removed from the page: Connections cards, Mappings tables, Sync Log, RU Readiness scorecard, onboarding pipeline, and the Connect Channel dialog. All of that behaviour now lives inside the White Label UI. The readiness scorecard and onboarding pipeline remain available on the admin Rentals United pages, so nothing is lost for staff.

Kept: the PMS shell (left sidebar), the currency notice, and the existing Channel Manager billing lock (owners without the Channel Manager module still see the "unavailable" card instead of an embed).

Header wording:
- Title: `Channels`
- Subtitle: `Connect and manage distribution channels for your property`

## States

```text
tokens loading      -> centered spinner + "Loading Channel Manager…"
tokens present      -> <div id="ruApp"> full-height embed, rounded-lg + border
tokens unavailable  -> "Channel Manager is not activated for this owner yet.
                        Complete the Rentals United sub-user setup first."
billing locked      -> existing Channel Manager unavailable card (unchanged)
```

## Where the tokens come from

The embed needs a White Label **access token + refresh token + ownerId**. Today we store the RU sub-user *API* AccessKey/SecretKey and, for some owners, the RU portal login (`ru_owner_accounts.ru_login_email` / encrypted password) — not White Label tokens. So they get minted server-side:

1. A new edge function `ru-whitelabel-token` resolves the property's RU owner account (property → portfolio → owner scope, the same resolution the RU panels already use), decrypts the stored portal password, signs in to Rentals United, and returns `{ accessToken, refreshToken, ownerId, expiresAt }`. Tokens are never stored in the browser beyond the live page and are never logged.
2. A short-lived server-side cache per `ru_owner_id` avoids re-authenticating on every page view.
3. A new hook `useRuWhiteLabelTokens(propertyId)` calls that function via React Query, refetches shortly before expiry, and exposes `{ tokens, isLoading, isUnavailable }` for the three states above.

Note on the login endpoint: RU's docs page is behind a bot challenge, so the exact White Label auth endpoint and payload are not yet confirmed from the source article. First build step is to confirm it against RU (their auth endpoint on `new.rentalsunited.com`) and verify a real token pair for owner `741765`. If RU does not expose a programmatic login for White Label, the function falls back to reading an admin-entered token pair stored on the owner account, and the page behaviour stays identical.

Today there is exactly one RU owner account in the database and it has no portal password saved, so until a password (or token pair) is captured for an owner, that owner will legitimately show the "not activated" empty state.

## Embed mechanics

- Container: `<div id="ruApp" className="w-full h-[calc(100vh-12rem)] rounded-lg border bg-background overflow-hidden" />`, sitting directly under the header with normal page padding, no extra card wrapper.
- Script injected once per token set, exactly as documented:
  `https://new.rentalsunited.com/white-pms-client/script?token=…&refreshToken=…&languageId=1&uiVersion=2&ownerId=…`
- The effect appends the script to the container, and on unmount / property switch / token refresh removes the script tag and empties `#ruApp` so switching properties never leaves two White Label instances mounted.
- Script load failure surfaces the same empty state with a retry action rather than a blank frame.

## Technical notes

- Files: rewrite `src/pages/pms/PMSChannels.tsx` (thin: header, billing lock, currency notice, embed); new `src/hooks/useRuWhiteLabelTokens.ts`; new `supabase/functions/ru-whitelabel-token/index.ts` (JWT verified in code, caller must have access to the property).
- No schema change unless the admin-token fallback is needed, in which case two nullable columns are added to `ru_owner_accounts` in a separate migration.
- The now-unused channel components (`ChannelCard`, `MappingTable`, `SyncLogTable`, `ConnectChannelDialog`, `RuReadinessScorecard` mount here) stay in the codebase — they are still used by the admin RU pages or harmless — but are no longer imported by this page.
- Adapter locks respected: no changes to `rentalsunited-api` push/pull regions or ARI paths.

## Verification

- Load `/rolos/channels` for an RU-connected property and confirm the White Label UI renders full-height inside the ROL'OS shell with the sidebar intact.
- Confirm loading, unavailable, and billing-locked states each render correctly.
- Switch property in the PMS selector and confirm the embed re-initialises once (no duplicate `#ruApp` script tags).
