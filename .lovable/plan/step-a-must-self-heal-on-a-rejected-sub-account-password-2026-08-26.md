# Step A must self-heal on a rejected sub-account password

## What actually happened

Reading today's channel traffic for this run:

- `Push_CreateUser_RQ` at 13:14 — **Success**, new account 742555 created for `dawienew@polka.co.za`.
- `Push_CreateApiKey_RQ` two seconds later — **`<error ID="-4"> Incorrect login or password`**.
- The same `-4` came back at 12:27, 12:44, 13:13 and again at 14:29 — every attempt, on brand-new and existing accounts alike, always with a `UserName`/`Password` envelope.

So the stop is real, but the cause is not the specific login: a sub-account created seconds earlier, with the password we just set, is refused too. Unbinding and re-creating under a fresh slug login would very likely earn the same `-4` and would leave a trail of throwaway accounts on the master. The plan therefore does both things: it makes Step A recycle instead of stopping (what you asked for), and it fixes the mint itself so recycling has something to succeed at.

## What changes

**1. The mint gets more than one way to authenticate.**
Before giving up on a key pair, Step A tries, in order:
- the current sub-account `UserName` + `Password` envelope (today's only attempt);
- a short propagation re-try (one retry after a brief pause) — new accounts may not be live on the XML surface at the instant they are created;
- a master-authenticated variant that scopes the request to the sub-account instead of logging in as it.
The first variant that returns a pair wins and is stored and verified exactly as today.

**2. On a genuine password refusal, Step A recycles the login instead of stopping.**
When every mint variant is refused with an auth error, Step A automatically, in one run:
- generates the next slug login (`<slug>@channels.roomsonline.co.za`, `-2`, `-3`… on collision);
- rebinds the property/portfolio to it, keeping `properties.owner_email` (the contracting identity) untouched;
- creates the sub-account with a freshly generated password, stored encrypted before the mint is attempted;
- mints, verifies, pushes company details and adopts existing listings.
Capped at **two** recycle attempts per run so a systemic channel refusal cannot spawn accounts indefinitely. The account left bound is always the last one created — never an orphan.

**3. The stop message tells the truth.**
If both recycles are exhausted, Step A stops on a distinct blocker: "the channel is refusing API-key creation for this account — escalate this OwnerID for XML API key enablement", not "password incorrect". The failure-only preview modal opens with that wording, the accounts it created, and a retry button. The health report classifies it as a channel entitlement gap, not a pipeline fault.

**4. Nothing is silently abandoned.**
Every leg (rebind, create, mint attempt, recycle decision) is written to the run's task lines, so the dots on the Step A card show `key pair — attempt 2 of 2` rather than a dead stop, and to `ru_api_log` / `ru_archive_events`.

## Technical notes

- `mintChildKeyPair` in `supabase/functions/ru-cert-portal/index.ts` gains an ordered variant list and returns `authRefused` distinctly from `rateDeferred`; the propagation retry is bounded and does not count against the recycle cap.
- The master-scoped variant is added to `create_child_api_key` in `rentalsunited-api` and to `buildCreateApiKeyXml` in `supabase/functions/_shared/ruApiKeyXml.ts`, keeping RU's ordered schema (Authentication → Label → Scope) and leaving the existing password/keys modes intact. Covered by `ruApiKeyXml.test.ts`.
- The recycle loop reuses the existing `generateDistributionLogin` + rebind path already used for `RU_EMAIL_IN_USE`, promoted to a shared helper so both the email-in-use and the auth-refused paths run the same sequence.
- New stop code `RU_KEY_CREATION_NOT_ENABLED` surfaces through `channelOnboardOrchestrator.ts`, `channelStepBRemedies.ts`-style remedy text, `StepAccountDialog.tsx` and `daily-health-report`'s non-fault taxonomy.
- Passwords are generated per account and encrypted (`ru_login_password_enc`) before the mint call, so a retry never re-uses a password the channel has already rejected for a different login.

## Verification

- Unit test for each XML variant's shape and ordering.
- Deploy `ru-cert-portal` and `rentalsunited-api`, then re-run Step A on this property and read `ru_api_log`: expect either a `Push_CreateApiKey_RS` with a pair, or one recycle followed by the explicit entitlement blocker — never a silent stop.
