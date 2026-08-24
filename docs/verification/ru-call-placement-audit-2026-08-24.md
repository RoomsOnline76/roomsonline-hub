# Rentals United — API call placement audit, corrections and test regime

Date: 2026-08-24
Scope: every RU call site in the codebase, the Master/Child credential rules, response validation,
the manual key-generation step in onboarding, and the mandatory test matrix.

## 1. Call-site inventory

RU request XML is constructed in exactly two places (verified by scanning for `<Push_` / `<Pull_`
across `src/` and `supabase/functions/`):

| File | Role |
| --- | --- |
| `supabase/functions/rentalsunited-api/index.ts` | Primary adapter — every Pull/Push verb except archive |
| `supabase/functions/ru-close-user/index.ts` | Isolated `Push_ArchiveUser_RQ` (child auth only) |
| `supabase/functions/_shared/ruReadiness.test.ts` | Test fixtures only, no transport |

Everything else reaches RU by invoking those functions:

- `push-property-to-ru`, `ru-static-delta`, `ru-ari-delta`, `ru-cert-portal`, `ru-lnm-handler`,
  `ru-reservation-handler`, `cron-pull-ru-reservations`, `cron-*` ARI jobs.
- Frontend (`src/lib/channelSavePush.ts`, `ruPushDriver.ts`, panels) passes action names and
  identifiers only. No RU credentials and no RU XML exist client-side.

Conclusion: the adapter boundary holds. No misplaced or unauthenticated call sites were found
outside the two isolated functions.

## 2. Findings and corrective actions

### 2.1 Silent master fallback (FIXED)

`effectiveCreds()` returned master credentials whenever child auth was null, and the hard stop only
fired when (a) an `owner_id` was supplied **and** (b) the action was in a second, laxer
`CHILD_AUTH_STRICT_ACTIONS` set. A child-scoped call that omitted `owner_id` executed as master.

Reproduced live before the fix (`set_property_status`, no `owner_id`): the call went out on master
credentials and RU answered `Status ID=0` with `Warning StatusID=18` — i.e. the write was accepted
against our own account.

Correction, in `rentalsunited-api`:

- `CHILD_AUTH_STRICT_ACTIONS` deleted. `CHILD_SCOPED_ACTIONS` is now the single rule.
- New `CHILD_SCOPED_WRITE_ACTIONS` (pushes, status, currency, MCQ, confirm/reject/cancel/modify,
  LNM subscribe).
- When no child auth resolves:
  - named `owner_id` that is not our master OwnerID → `422 RU_CHILD_AUTH_REQUIRED`;
  - a **write** with no `owner_id` at all → `422 RU_OWNER_ID_REQUIRED` (the credential choice may
    never be inferred);
  - a **read** with no `owner_id` → explicit master-account scope, allowed and logged.
- `masterOwnerId()` / `isMasterOwnerId()` resolve our own account from `RU_OWNER_ID`, so legitimate
  master-account operations keep working without reopening the fallback.
- Both refusals write a `logRuNotAttempted` row under the real RU verb, so "never attempted" stays
  distinguishable from "no log row".

### 2.2 Typed master/child distinction (FIXED)

`RUCredentials` now carries `auth_scope: 'master' | 'child_keys' | 'child_password'`, set by
`effectiveCreds()` and reported as `auth_mode` on responses, so a master credential object can no
longer be mistaken for a sub-user one in logs or evidence exports.

### 2.3 Response validation (VERIFIED, one hardening)

All 59 `callRentalsUnited()` call sites were walked. 57 validate through `handleRUStatus()` before
any ROL write; the two that do not are advisory-only lookups (`resolveOwnerId` fallback and the
key-identity probe) which treat any non-success as "unknown" and never write. The
cities/currencies fallback validates both the primary and the fallback response and degrades to
`endpoint_disabled` rather than surfacing raw XML.

Hardening applied: `ru-cert-portal`'s `preview()` now redacts `AccessKey`, `SecretKey`, `UserName`
and `Password` (XML nodes and JSON fields) before any evidence preview is returned or exported.

### 2.4 Archive path (VERIFIED, no change)

`ru-close-user` resolves child auth in the order request keys → `ru_api_credentials` → legacy
`ru_owner_accounts` keys → legacy sub-user password, and returns `422 API_KEYS_REQUIRED` when none
resolve. The master pair is never used and no archive action exists in `rentalsunited-api`.

### 2.5 Manual key generation step (COPY ADDED)

The step already exists as `manual: true` macro `keys` (order 7), after `push_owner` (sub-user
creation) and before `company_profile` (`FillCompanyDetails`) and the listing push, with two truth
states (`api_keys_stored`, `api_keys_verified`). Push is gated on it server-side by `ru-cert-portal`
(`push_gated` / `gate_reason`).

Added consistent operator guidance in three surfaces:

- `src/config/rolosOnboardingMacros.ts` — vendor-free wizard copy: portal → Security settings →
  generate pair → capture in ROL'OS; secret shown once; pushes are held until stored and verified.
- `src/components/integrations/RuOnboardingPipeline.tsx` — admin dialog now links the RU Security
  settings page directly and names scope `XmlApi`.
- `supabase/functions/help-assistant/index.ts` — TOBI channel-onboarding context states the step is
  manual, cannot be automated, and that nothing is sent for the account until it passes.

## 3. Test matrix

Auth mode is read from the `auth_mode` field on each response.

| # | Test | Credential | Expected | Result |
| --- | --- | --- | --- | --- |
| 1 | `list_users` (master dictionary) | master | `Status 0`, retired OwnerIDs filtered | PASS — 4 live users, 6 retired excluded |
| 2 | Child-scoped read, OwnerID with no keys (`742126`) | none resolvable | `422 RU_CHILD_AUTH_REQUIRED`, no RU call | PASS |
| 3 | Child-scoped write, no OwnerID | none | `422 RU_OWNER_ID_REQUIRED`, no RU call | Pre-fix run reproduced the master fallback (RU accepted the write). Guard is in source; re-run pending the next deploy of `rentalsunited-api` |
| 4 | `list_properties` for a bound sub-user | `child_api_keys` | `Status 0`, sub-account inventory | PASS |
| 5 | `fill_company_details` | `child_api_keys` | `Status 0` | PASS |
| 6 | Property push | `child_api_keys` | `Status 0`, listing on the sub-account | PASS |
| 7 | Prices / availability read-back | `child_api_keys` | pushed values returned | PASS |
| 8 | Master-account read, no OwnerID | master | allowed, logged as master scope | PASS |
| 9 | Malformed payload | n/a | `400` with `{ code, message }`, no RU call | PASS |
| 10 | Evidence preview contains credentials | n/a | `[REDACTED]` | PASS |
| 11 | `Push_CreateUser_RQ` | master | new sub-account | DEFERRED — destructive, awaiting go-ahead on a disposable `RUTEST` account |
| 12 | `Push_ArchiveUser_RQ` (`ru-close-user`) | `child_api_keys` | `Status 0`; refuses with `API_KEYS_REQUIRED` when keys are absent | DEFERRED — destructive, same condition |

## 4. Closing checks

- No RU XML outside `rentalsunited-api` and `ru-close-user`.
- Frontend carries no RU credentials and no master keys.
- Archive still runs on child auth only, with no master fallback.
- Onboarding payload density unchanged (TimeZone, location typeFilter, key_representative,
  surroundings, property_floor, property_size_sqm still sent).
- `tsgo --noEmit` clean.

## 5. Residual risks

- Legacy sub-users holding only a portal UserName/Password still authenticate in
  `child_password` mode. That is genuine child auth, not a master fallback, but the accounts should
  be migrated to key pairs.
- Master-scoped reads with no `owner_id` remain allowed by design (our own inventory). They are now
  logged explicitly so an unintended master read is visible in the function logs.
- Tests 11 and 12 create and retire real RU state; they stay deferred until a disposable `RUTEST`
  sub-account is confirmed as the target.
