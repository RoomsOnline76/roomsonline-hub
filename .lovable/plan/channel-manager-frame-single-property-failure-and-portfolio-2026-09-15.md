# Channel Manager frame: single-property failure and portfolio clarity

## What is actually happening

Two separate things, both confirmed from the live data.

**1. Leopard Cottage shows the channel provider's own error screen.**
Leopard Cottage is a standalone property with its own distribution account (login `ru-two@polka.co.za`).
Every attempt to get a fresh Channel Manager sign-in for that account is refused by the provider
(`403`, six refusals on 14 September; the portfolio account `rooms@roomsonline.co.za` succeeds every time).
When the refusal happens, our backend falls back to the **last saved sign-in, which expired on 30 August**,
and still reports it as usable. The frame therefore loads with a dead sign-in and the provider's own
generic error message appears — which is why no detail is shown: the message is theirs, not ours.

So this is not a portfolio-vs-property loading bug. Portfolios happen to work because their account
signs in cleanly; the single property does not.

**2. A portfolio frame gives no per-property distinction.**
The frame is opened per distribution account, and one account covers the whole portfolio. Nothing on
screen says which properties and which listings that account holds, so an operator cannot tell what
they are connecting.

**Are all properties connected when the wizard finishes?** Completing the provider wizard connects the
**account** to the channel. Every listing already pushed under that account becomes available to that
channel, but each channel still needs its listings mapped/activated on its side. Our own status stays
"Awaiting channels" for a property until a channel is recorded against that property specifically.
So: the account is connected in one pass, individual properties are only "connected" once their listing
is mapped.

## What to change

### A. Never boot the frame on an expired sign-in
- Treat the saved sign-in as usable only while it is still inside its validity window.
  If refreshing fails and the saved one has expired, report the session as unavailable instead of
  handing a dead one to the frame.
- The frame then shows our own explanation and Retry, not the provider's error screen.

### B. Explain the refusal properly
- New reason for a provider refusal of the sign-in exchange, carrying the refusal code.
- Owner-facing wording: the property is connected to ROL'OS; Channel Manager sign-in for this
  account has not been granted yet and is being followed up — no action needed from them.
- Staff (admin/dev/fearless leader) additionally see the diagnostic code and the account/login involved,
  plus the existing links, so the account can be raised with the provider without digging through logs.

### C. Scope header above the frame
A short header stating exactly what the open frame covers:
- the account it is signed in as, and whether the scope is a portfolio or a single property;
- for a portfolio: each member property with its listing count and a status chip
  (Channels connected / Awaiting channels / Not pushed), read from data we already hold;
- a one-line note that the wizard connects the account and each property's listing must be mapped
  per channel, so the operator knows what "complete" means.

Properties with no listing yet are flagged in that list, because they cannot be mapped in the wizard.

### D. Same treatment on both surfaces
The header and the new messages live in the shared embed component, so the admin Channel Monitor
Onboard tab and the owner-facing ROL'OS Channels page behave identically.

## Technical notes

- `supabase/functions/ru-whitelabel-token/index.ts`: drop the unconditional stale-pair fallback
  (currently returns `available: true, source: 'stale'` even when `ru_wl_token_expires_at` is in the past);
  return `reason: 'wl_signin_refused'` with the exchange error (`sub_user_http_403`) preserved as
  `diagnostic`, and keep `sub_user_verified` so copy stays accurate. Also return `owner_id`,
  `login_email` and `scope` for the header.
- `src/hooks/useRuWhiteLabelTokens.ts`: surface `diagnostic`, `login_email`, `scope`.
- `src/components/pms/channels/RuWhiteLabelEmbed.tsx`: new `wl_signin_refused` branch; staff-only
  diagnostic line; render the new scope header component above the iframe.
- New `src/components/pms/channels/ChannelScopeHeader.tsx`: resolves the account (portfolio row, own row,
  or a sibling's row — same precedence as `findOwnerAccount`), then reads
  `property_portfolio_members` → `properties` → `hostfully_room_types`
  (listing ids) → `ru_platform_settings` (`ru_channel_id:<propertyId>`) for the chips.
- No change to push, gate or ledger logic. Channel vendor naming stays out of owner-facing copy.

## Out of scope

- Fixing the provider-side `403` for account 742640 — that is a permission grant on their side;
  this work makes it visible and explains it instead of hiding it behind their error screen.
- Reading or scripting anything inside the provider frame.
