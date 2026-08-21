# Fix "Invalid domain for site key" on reports.roomsonline.co.za

## What I verified

- Loading `https://reports.roomsonline.co.za/auth` in a clean browser right now works: Google's script loads, and executing the site key `6Lf4TVAs…Wmko` for the `login` action returns a valid token. No console errors, no overlay.
- The host already resolves to "native" reCAPTCHA mode (any `*.roomsonline.co.za` host does), so no host-mode change is needed.
- Conclusion: the domain registration you saved in Google is being accepted. The "ERROR for site owner: Invalid domain" you see comes from a **different (older) site key being mounted in your browser**, not from the key Google now serves. Feature flags — including the reCAPTCHA site key — are cached in `sessionStorage` under `rolos.feature_flags` and used as the *initial* value for the first render, with no version stamp and no expiry, so a tab that cached the previous key keeps mounting it.

## What to change

**1. Stop stale keys from being mounted (root cause)**
- Version and time-limit the feature-flags cache: bump the cache key, store a `cachedAt` stamp, and ignore cached entries older than a short window.
- Never seed publishable keys (`google_recaptcha_site_key`, `google_maps_api_key`) from cache — those come only from the live flag fetch. Behavioural flags can still paint instantly from cache, so first-paint speed is unchanged.

**2. Self-heal instead of blocking sign-in**
- Detect a failed native reCAPTCHA (script/badge reports an invalid domain, or `execute` throws / returns no token) and automatically fall back to the existing canonical-host token bridge, then retry once. Sign-in and forms keep working even if a key/domain pairing is wrong.
- If both native and bridge fail, the existing overlay stays, but with a clearer message and a one-line diagnostic in the console (host + first 8 chars of the key in use) so the mismatch is identifiable without guessing.

**3. Remove the visible site-owner error**
- Hide Google's badge error surface on failure by unmounting the native provider once fallback engages, so guests/staff never see Google's red "ERROR for site owner" text.

## How to confirm after the change

Hard-reload `reports.roomsonline.co.za/auth` (or open a new tab) and sign in — the badge should show normally and login should proceed without the overlay. Because of the cache fix, any tab still holding the old key drops it on next load.

## Technical notes

- `src/hooks/useFeatureFlags.tsx`: cache key → `rolos.feature_flags.v2`, add `cachedAt` + max-age check, strip key fields from `initialData`.
- `src/lib/recaptchaMode.ts`: no host-list change; export a helper for the runtime fallback state.
- `src/hooks/useRecaptcha.tsx`: add a module-level `nativeFailed` latch; on native execute failure route through `requestBridgeToken()` and retry; expose the effective mode.
- `src/components/RecaptchaProvider.tsx`: skip mounting `GoogleReCaptchaProvider` when the native latch has tripped.
- No backend, schema, or edge-function changes; `GOOGLE_RECAPTCHA_SECRET_KEY` verification path is untouched.
