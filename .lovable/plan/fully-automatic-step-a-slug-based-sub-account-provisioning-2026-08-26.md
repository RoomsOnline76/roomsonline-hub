# Fully Automatic Step A — Slug-Based Sub-Account Provisioning

## Goal

One click runs Step A end-to-end. If the chosen distribution login is rejected by the channel (already exists, archived, or not under our master account), the system generates a new login from the property slug (`<slug>@channels.roomsonline.co.za`, suffixing `-2`, `-3`… on collision), binds it, creates the sub-account, mints and stores the API key pair, verifies, pushes company details, and adopts existing listings — all atomically. The "Distribution account — preview Step A" modal now appears **only on failure**. The manual "change email" step is gone.

## Backend — `supabase/functions/ru-cert-portal/index.ts`

### 1. Generated-login fallback in `ensure_owner_account`

- Add a `generateDistributionLogin(slug, attempt)` helper: slugifies the property name if no `slug` column value, returns `<slug>@channels.roomsonline.co.za` (or `<slug>-N@channels.roomsonline.co.za` for attempt N ≥ 2).
- In the `Push_CreateUser_RQ` failure path (currently the `RU_EMAIL_IN_USE` 409 at ~line 7061, plus the internal-login rejection of a confirmed email), instead of returning the error, loop up to 4 attempts:
  1. Skip candidates already stored as live on a **different** scope in `ru_owner_accounts`.
  2. Retry `create_user` with the generated email.
  3. On success, continue the existing flow (roster merge, row save with `ru_login_email` = generated email, encrypted password, key minting, company details, listing adoption).
  4. If all generated attempts fail, return `RU_EMAIL_IN_USE` as today so the modal still opens with the candidates list.
- `plan_owner_account` gains a `fallback_login` field showing the generated address the run would use, so the (failure-only) modal preview stays accurate.
- The internal-login guard (`dev@`, `noreply@`) short-circuits straight to the generated login instead of blocking.

### 2. Confirmation flag

- The existing `confirmed_owner_email` override stays, but the auto flow sends no confirmation — the backend resolves, and the generated fallback is now part of the default cascade.

## Frontend — Channel Monitor → Onboard

### `src/components/admin/channel-monitor/ChannelOnboardTab.tsx`

- Remove the auto-open effect (`autoOpenedRef`) and the "open plan on property select" behaviour.
- On property select (Step A not passed): immediately `runStep("a")` silently — a compact progress card shows the live task lines + rate-limit countdown in place of the modal.
- Open `StepAccountDialog` **only** when the run returns a blocker: `RU_EMAIL_IN_USE` (after generated fallbacks exhausted), `NO_OWNER_EMAIL`, `PASSWORD_RETENTION_FAILED`, or another `blocked` code.
- On pass: toast "Distribution account confirmed — ready for Step B", collapse Step A, keep modal closed.
- Keep the "Preview account" button next to Refresh as the manual way to inspect the plan.

### `src/components/admin/channel-monitor/StepAccountDialog.tsx`

- Remove the "Change account email" manual step and email-conflict chooser as the primary path; keep the candidates list only as the last-resort UI when all generated attempts fail.
- Show the resolved/generated login in the preview when opened after a failure.

## Verification

- Typecheck/build clean.
- Deploy `ru-cert-portal`.
- Manual: pick a property whose owner email is unusable → Step A provisions `pufferfish@channels.roomsonline.co.za`-style login, keys minted/verified, company details pushed, modal never opens; simulate total failure → modal appears with candidates.

## Memory

- New project memory: distribution login fallback — unusable owner emails auto-fall back to `<slug>@channels.roomsonline.co.za` (auto-suffix on collision); manual email change removed; preview modal is failure-only.
