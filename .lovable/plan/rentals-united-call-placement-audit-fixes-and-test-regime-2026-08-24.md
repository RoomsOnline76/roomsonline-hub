# Rentals United call-placement audit, fixes and test regime

## What the audit found (verified in code)

The adapter boundary is already intact, and most of section 3 is already live. Confirmed:

- XML is built in exactly two places: `rentalsunited-api/index.ts` and `ru-close-user/index.ts`. Nothing in `src/` builds, signs, or holds RU credentials — the UI only passes action names and reads masked key metadata.
- `push-property-to-ru`, `ru-cert-portal`, `ru-static-delta`, `ru-ari-delta`, `ru-lnm-handler`, `ru-reservation-handler` and every `cron-*` job reach RU only by invoking those two functions.
- Child keys resolve through `resolveChildAuth` (request keys → `ru_api_credentials` → legacy `ru_owner_accounts` → legacy password) and the strict action set hard-stops with `RU_CHILD_AUTH_REQUIRED` (422) when an `owner_id` is present and no child auth resolves.
- `ru-close-user` builds `Push_ArchiveUser_RQ` with child auth only and returns `422 API_KEYS_REQUIRED` with no master fallback. There is no archive action in `rentalsunited-api`.
- The manual key-generation step already exists as an explicit, `manual: true` onboarding macro (`keys`, order 7) with two confirmation states (`api_keys_stored`, `api_keys_verified`), sequenced after `push_owner` (create sub-user) and before `company_profile` (`FillCompanyDetails`) and the listing push.
- Push is server-gated: `ru-cert-portal` returns `push_gated` / `gate_reason` when the OwnerID or keys are missing, and `PushToRentalsUnited` disables the push buttons on it.
- `handleRUStatus()` is the shared validator and is called before the ROL write on the write branches sampled.

So this is a set of surgical corrections, not a rewrite.

## Real gaps to fix

1. **Silent master fallback on the non-strict path.** `effectiveCreds()` returns master credentials whenever child auth is null. The strict guard only fires when an `owner_id` was supplied *and* the action is in `CHILD_AUTH_STRICT_ACTIONS`. A child-scoped call that omits `owner_id`, or one of the actions outside the strict set, still executes as master.
   Fix: make every action in `CHILD_SCOPED_ACTIONS` refuse master credentials. Missing `owner_id` on a child-scoped action becomes `RU_OWNER_ID_REQUIRED`; unresolved child auth becomes `RU_CHILD_AUTH_REQUIRED`, keeping the existing "no keys" vs "secret could not be decrypted" distinction. Collapse `CHILD_AUTH_STRICT_ACTIONS` into the single child-scoped set so there is one rule, not two.

2. **Typed master/child credential distinction.** Introduce a discriminated credential type (`{ mode: "master" } | { mode: "child_keys" } | { mode: "child_password" }`) so a master credential object cannot be passed to a child-scoped handler without a type error, and `auth_mode` is returned on every response for evidence capture.

3. **Response validation holes.** Route the remaining read/probe paths that bypass `handleRUStatus` (the cities/currencies fallback path, the `ru-cert-portal` probe wrappers) through the shared validator, and map failures into the standard `{ success: false, error: { code, message, details } }` envelope instead of surfacing raw XML.

4. **Operator guidance for the manual step.** The macro note exists but there is no direct link to the sub-account Security page and no operator copy outside the wizard. Add the link plus a short "how to mint the key pair" block to the wizard step, the channel help article, and the TOBI channel-onboarding context so all three say the same thing.

5. **Audit-report artefact.** No written record of call-site placement exists. Produce one as a committed document.

## Technical scope

- `supabase/functions/rentalsunited-api/index.ts` — credential selector and guard only: `effectiveCreds`, the child-scope guard block, `resolveChildAuthDetailed` return shape, `auth_mode` on responses. This file is under adapter lock for `buildPushPropertyXml`, the child authentication builders, `push_property`, `push_building`, `list_buildings`, `get_building`, `fill_company_details`; the change touches the credential selector those handlers call, so I need your explicit go-ahead in the approving message.
- `supabase/functions/ru-cert-portal/index.ts` — probe response validation; no sequencing change.
- `src/config/rolosOnboardingMacros.ts` and the channel help/TOBI copy — operator guidance text and the RU Security link.
- `docs/verification/ru-call-placement-audit-2026-08-24.md` — the review report and completed test matrix.
- No schema changes, no new edge functions, no change to `fetchPmsAvailability()` routing, no calendar/booking/dashboard changes.

## Test regime

Run against a live RU sub-account and record request shape, credential mode, HTTP status and the RU status id for each row:

- Non-destructive, run immediately: list users (master), guard-fires-before-keys (negative), `FillCompanyDetails` (child), property push (child), rates/availability/prices read-back (child), cert-console playground parity for each action, and the negative set (missing keys, master key on a post-create write, malformed payload).
- Destructive, needs your go-ahead: `Push_CreateUser_RQ` and `Push_ArchiveUser_RQ` create and retire a real RU sub-account. I will run these against a disposable `RUTEST` sub-user and will confirm the target with you before firing, rather than touching a production account.
- Wizard evidence for the manual key step captured as a Playwright screenshot plus a state dump of `api_keys_stored` / `api_keys_verified`.
- Closing checks: no RU XML outside the two isolated functions, the frontend never carries master keys, the Close/Archive button in the accounts tab still archives via child auth, and the onboarding payload still carries the density GeneralTab / CompanyInformationCard expect (TimeZone, location typeFilter, key_representative, surroundings, property_floor, property_size_sqm).

Final deliverable is the single markdown report: change summary, call-site findings with credential type before/after, the completed pass/fail matrix with evidence, residual risks, and confirmation that the adapter boundaries held.
