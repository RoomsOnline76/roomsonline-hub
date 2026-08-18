# Straighten out the company-details step in the Channels wizard

## What the data shows

For this sub-account (OwnerID 742004, [ru-owner@roomsonline.co.za](mailto:ru-owner@roomsonline.co.za)):

- API key pair stored and verified today at 18:52
- `company_details_status` is still `credentials_verified`, `company_filled_at` is empty

So the owner and keys steps really are done, and the automatic company push that is supposed to run straight after key verification did not leave any record — no `sent`, no `failed`, no reason. The wizard then presents "Company details accepted by the Channel Manager — Not sent" as a red *Fix* banner on step 7, which makes a finished step look 67% done and the whole distribution half feel back to front.

## The natural flow to restore

```text
6.  Push owner: create the distribution sub-user     (done)
7.  Create key & secret for the sub-account          (done once stored + verified)
8.  Company profile on the sub-account               (runs automatically)
9. Sub-account verification
10.  Pull listings (if any)
11. Push property & full ARI
...
```

1. **Step 7 completes on keys alone.** Storing and verifying the pair is the whole job of that step. The company-details task moves out of it, so a verified sub-account no longer reads 67%.
2. **Company details become their own step, and it self-runs.** When the wizard opens (or refreshes) and it sees: owner bound, key pair verified, and the push prerequisites met, it submits the company profile itself, once, without anyone pressing a button. The card shows "Sending company profile…" then "Accepted &nbsp;".
3. **The manual button is only a correction tool.** "Send company details" stays, but it is a re-send for when the profile changed or the automatic attempt failed — not the normal path.
4. **A failed attempt says why.** If the channel rejects or cannot be reached, the status is recorded as failed with the channel's own reason and the card shows that reason plus Retry, instead of falling back to the silent `credentials_verified` state.
5. **Nothing downstream is falsely blocked.** Pull listings and sub-account verification depend on the key pair, not on the company profile. Only the publish step and the sign-off checklist keep the company-profile requirement, and the sign-off item stays locked until a real push at/after key verification is on record.
6. **The banner stops shouting.** While the automatic attempt is in flight or simply pending, the highlighted next step is a neutral "Company profile is being sent" — the red *Fix* treatment is reserved for a recorded failure.

## First action

Run the company push for OwnerID 742004 with its verified key pair and capture the actual channel response. If it fails, the recorded reason drives the fix (location resolution, sub-user auth, or payload completeness) before the auto-run behaviour is relied upon. No status is fabricated.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts`
  - `save_api_keys` / key re-verify: stop leaving `company_details_status = "credentials_verified"` as the terminal state — after `provisionCompanyAfterKeyVerification()` persist the real outcome (`sent` + `company_filled_at`, or `failed` + reason in `company_details_error`/status detail).
  - Add an idempotent `ensure_company_details` entry the wizard's identity read can trigger: when keys are verified and the strict check in `_shared/ruCompanyDetails.ts` is unsatisfied, attempt once per account with a short cooldown so repeated wizard opens do not hammer the channel.
- `src/config/rolosOnboardingMacros.ts`: drop `{ kind: "state", key: "company_details" }` from the `keys` macro; add a `company_profile` macro at order 8 (`action: "ensure_company_details"`, admin-only) and renumber the later distribution steps; keep `company_details` in `ROLOS_SIGNOFF_CHECKLIST` with its lock.
- `src/config/channelOnboardingStages.ts`: add the new macro key to the distribution stage order.
- `src/hooks/useRolosOnboardingProgress.ts`: new state check for the company profile (pending / sending / accepted / failed), fire the auto-attempt when the gate is met and it is unsatisfied, and update `actionBlockedReason` step numbers so pull/verification are not blocked by the profile.
- `src/components/property/PropertyRuOwnerPanel.tsx` and the channel workspace: show status + timestamp + failure reason, one combined progress state, "Send company details" relabelled as a re-send/retry.
- No schema change beyond recording the failure reason on the existing account row.