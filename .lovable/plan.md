# Step A / Step B call-sequence clean-up (Rentals United)

You are right about the buildings list: a read probe sent with only a login and password can never succeed, so it was guaranteed to log "Incorrect login or password" before any key existed. Reviewing the whole chain, several calls were either impossible-by-design, duplicated inside one run, or asked the channel a question we already knew the answer to.

## What is wrong today

| Call | Where | Problem |
|---|---|---|
| Listing/buildings read with password auth | password verification | Cannot succeed — the channel refuses password-only envelopes on read endpoints. Always a false failure. |
| Key verification read | right after minting | The mint itself already proved the credential. The re-read spends the tightest quota on a known answer. |
| Company profile push | after key provisioning | Provisioning already sends the company profile, so the same run pushes it twice. |
| Sub-account listing roster read | adopt / review / verify listings | The same owner-scoped question asked up to three times per run. |
| Listing read-back | after the publish | The publish returns the channel's listing id per unit — that already is the confirmation. |
| Key verification with no key stored | verify step | Runs even when nothing is stored, producing a wire failure instead of a clear "nothing to verify". |

## Correct sequence

```text
Step A: identity check (local) → create/confirm sub-account
        → mint key pair  (this IS the password verdict)
        → company profile (skip if provisioning sent it)
        → verify keys    (skip if minted/proven this run; refuse early if none stored)
        → adopt existing listings  (roster read — once, cached)

Step B: review scope (local fingerprint compare, no wire call)
        → publish property + ARI (returns a listing id per unit)
        → confirm listings (use the publish's own ids; roster read only as fallback)
        → currency read-back
```

## Guided recovery

Because minting is now the only place a password is judged, a wrong password surfaces as a specific prompt rather than a generic non-2xx: the credentials card opens, focuses the password field, and explains that the password must be confirmed or reset in the channel portal and re-saved. Rate-limited minting is reported as queued, not failed.

## Technical notes

- `rentalsunited-api`: password-mode read probes are refused locally with `RU_PASSWORD_PROBE_UNSUPPORTED`; key creation maps an auth refusal to `RU_CREATE_KEY_BAD_LOGIN`.
- `ru-cert-portal`: saving a password stores it and mints immediately, returning the mint verdict; key verification short-circuits on a 6-hour freshness stamp.
- `channelOnboardOrchestrator.ts`: run context carries `keysProvenInRun`, `companyPushedInRun`, `listingRoster`, and `pushConfirmedListings` so tasks share results instead of re-reading.
- `StepAccountDialog.tsx`: single "Save password & mint keys" action plus a retry-mint button; the standalone password probe is gone.
- Remedy registry gains `RU_CREATE_KEY_BAD_LOGIN` and `RU_PASSWORD_PROBE_UNSUPPORTED`.

## Still outstanding

The Live Channel Traffic counters read zero because `ru_api_log`, `ru_call_queue`, and `ru_roster_cache` lack table grants; the aggregate helpers also need to run as security-definer with an internal role check. That is a separate database change.
