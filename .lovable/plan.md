# Rebuild Step A from scratch — one linear sub-account run

Step A today is a tangle: it re-reads the user roster after almost every leg, treats a
submitted email as a suggestion and jumps straight to a generated slug login, auto-subscribes
live notifications mid-run, and then lands on a failure screen even after the account was
created and keys were stored. It gets throttled by the channel because of the repeated roster
reads. Replace it with a single, strictly ordered run.

## The new sequence

Exactly these legs, in this order, once each, with no hidden extra channel calls:

```text
property selected      → read the sub-account roster ONCE (cache it for the whole run)
Step A.0  account?     → if the property is already linked, adopt that account and skip to A.2
                       → if not linked: use the email the operator submitted;
                         only when none was given, generate <slug>@roomsonline.co.za
Step A.1  create user  → one Push_CreateUser_RQ with that email + the shared password
                         (no second roster read; resolve OwnerID from the run's read-back)
Step A.2  keys         → PAUSE. Operator pastes the AccessKey / SecretKey from the portal
Step A.3  verify pair  → confirm the pair belongs to the account used in A.1, then store it
Step A.4  company      → push the company profile as that sub-account
Step A.5  listings     → pull the sub-account's listings and adopt them
                       → Step A complete; wait for Step B
```

## Rules the rebuild enforces

- **One roster read per run.** The read happens when the property is picked. Every later leg
  reads that cached list. The only exception is the single read-back that resolves the new
  OwnerID after create; a throttled read-back parks the run for its cooldown instead of
  looping.
- **The submitted email is authoritative.** A generated slug login is a fallback used only
  when no email was supplied, or after the channel itself rejects the submitted one
  (already in use / archived / not under our master). No silent substitution.
- **"Email already exists" is an adopt, not a retry.** The roster already in memory tells us
  which OwnerID owns that login: bind it and go to A.2. No further create attempt, no
  further roster call.
- **Keys are manual.** A.2 always stops and asks. No mint attempt, no `-4` refusals, no
  master-authenticated fallback.
- **A.3 proves ownership before storing.** The pair must identify the exact login used in
  A.1/A.0. A pair that enumerates the roster is a master pair and is rejected outright.
- **No live-notification work in Step A.** RLNM / LNM subscribe and read-back move out of
  this run entirely (they belong to Step B / the notifications panel), so a failed LNM push
  can never fail or noise up Step A.
- **Outcome is honest and terminal per leg.** A run that created the account and stored a
  verified pair reports success even if a later leg parks; the screen shows the leg reached,
  never a red "failed" over a completed account.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts`: replace the `ensure_owner_account` /
  `plan_owner_account` body with a staged runner (`resolve → create → adopt-or-park`) whose
  only roster source is one run-scoped read; delete the in-run auto-subscribe hook and the
  duplicate roster look-ups in the create/adopt branches. Keep `save_api_keys` and
  `verify_child_key_owner` as the A.2/A.3 surface, and keep the existing per-account row
  writes (`ru_owner_accounts`, `ru_api_credentials`) unchanged.
- `src/lib/channelOnboardOrchestrator.ts`: Step A becomes the five tasks above
  (`owner_account`, `api_keys`, `verify_keys`, `company_profile`, `adopt_listings`); the
  `RU_MANUAL_KEYS_REQUIRED` pause stays the normal path rather than a recoverable error.
- `src/components/admin/channel-monitor/ChannelOnboardTab.tsx` +
  `StepAccountDialog.tsx`: the optional email input is offered before the run starts (A.0),
  the key/secret card is the A.2 pause, and a completed account never renders the failure
  screen — it renders the stage reached plus the account details.
- Channel-call budget per Step A run: 1 roster read, 1 create, 1 verify, 1 company push,
  1 listings pull. Anything beyond that is a bug.

## Verification

Run Step A against a fresh property with a supplied email and with no email, and read the
live traffic monitor to confirm the exact call budget above and no `Pull_ListMyUsers_RQ`
repeats.
