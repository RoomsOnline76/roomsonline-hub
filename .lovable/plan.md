# Repair the Rentals United White Label sign-in flow

## Confirmed diagnosis

This is not currently proven to be a Rentals United provisioning problem.

- Tidal Pools resolves to the correct portfolio RU account, OwnerID `741765`.
- Its canonical sub-user AccessKey/SecretKey pair exists and was verified on 3 August 2026.
- The White Label resolver does **not** call a documented authentication endpoint. It tries three guessed API-key exchange URLs and three guessed JSON login URLs; the live logs show repeated HTTP 404 responses from those guesses.
- RU's actual portal login is a form-based `POST /Account/Login` flow with an anti-forgery token, not any of the JSON login URLs currently attempted.
- The existing seven-step contract says White Label connection is master/partner → sub-user scoped, but the current function only tries the child API keys directly and has no verified partner/OAuth exchange implementation.
- Tidal Pools was adopted from an existing RU account, so no retained portal password exists locally. That prevents the current fallback, but it does not show that White Label access was not granted.

## Phase 1 — establish the exact RU White Label contract

1. Use the supplied RU White Label documentation and the live RU client/portal network contract to identify the authoritative source of the one-line script's `token`, `refreshToken`, and `ownerId` values.
2. Confirm whether authentication is:
   - a partner/master credential exchange scoped to OwnerID `741765`,
   - an OAuth client flow,
   - or a portal-session bootstrap that returns the token pair.
3. Record the exact endpoint, HTTP method, required headers/body, token response shape, expiry/refresh behavior, and OwnerID semantics. No more candidate/guessed endpoints.
4. Verify the ROL'OS RU partner account has the required White Label client/config values already available in backend secrets or platform configuration. If RU supplied a dedicated credential that is genuinely absent, request that specific credential only after its documented name and purpose are known.

## Phase 2 — replace the incorrect token resolver

1. Remove the six speculative 404 exchange/login attempts from `ru-whitelabel-token`.
2. Implement the single documented partner/master → sub-user token flow, validating the authenticated caller and the resolved property/portfolio OwnerID as today.
3. Use the verified sub-user scope for Tidal Pools and reject owner-scope mismatches rather than silently falling back to another RU account.
4. Cache only the documented token pair and expiry; refresh it through RU's documented refresh operation before expiry.
5. Keep tokens out of logs and browser persistence. Retain manual token entry only as an explicitly labelled emergency support path, not as the expected activation method.
6. Return safe ROL'OS-branded owner copy while storing actionable technical reason codes for staff diagnostics.

## Phase 3 — harden the embed and retry behavior

1. Validate the token response before injecting the one-line script and pass RU's exact parameter names and OwnerID type.
2. Make **Retry** invalidate the cached response and execute the complete documented authentication/refresh flow, then remount the script once on success.
3. Remove the raw backend `message` from all owner-visible UI and toast paths. Toasts and empty states will say ROL'OS/TOBI only; technical RU details remain staff-only diagnostics.
4. Distinguish token-auth failure, owner-scope mismatch, script rejection, and script-load failure so Retry never reports a misleading generic success/failure.

## Phase 4 — live verification for Tidal Pools

1. Call the repaired token function for Tidal Pools and confirm a valid access token, refresh token, expiry, and OwnerID `741765` are returned without exposing their values.
2. Load `/pms/channels?property=af57b357-9c95-47f5-b7d5-43d3b2f05bb7` and verify the White Label client renders inside the ROL'OS shell.
3. Refresh/retry and switch properties to verify one embed instance, correct owner isolation, and no stale-token reuse.
4. Confirm billing gating and property branding remain unchanged.

## Technical scope

- Primary backend: `supabase/functions/ru-whitelabel-token/index.ts`
- Frontend: `src/hooks/useRuWhiteLabelTokens.ts` and `src/components/pms/channels/RuWhiteLabelEmbed.tsx`
- Supporting configuration only if the documented RU contract requires it.
- No changes to locked RU XML adapter, ARI, pricing, LNM, or reservation paths.