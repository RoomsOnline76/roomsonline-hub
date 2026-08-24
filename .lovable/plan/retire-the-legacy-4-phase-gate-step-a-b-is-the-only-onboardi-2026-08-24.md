# Retire the legacy 4-phase gate — Step A/B is the only onboarding path

## What is actually happening

Dassiesingel Self-catering Units passed Step A at 18:13 (account 741761, credentials verified 18:13:43) and its Ready-to-sell ledger row is `passed`. Step B still refuses to run because the push function walks an older, separate 4-phase gate whose phase 1 re-judges the account and reports "blocked at phase 1 — Owner onboarding (RU sub-user)".

Confirmed cause: the phase-1 company-profile rule requires the company push (`company_filled_at` = 18 Aug 05:11) to be **at or after** the account's key verification (`verified_at` = 24 Aug 18:13). Step A re-verified the credentials, which pushed the verification timestamp past the earlier company push, so a profile that RU already accepted is graded "stale" and blocks the push. Step A itself treats the profile as accepted, so the two gates disagree — exactly the duplication being reported.

## What to change

1. **Make the Step A/B ledger the only push gate.**
   In the push function, replace `ready_for_push` from the phase gate with the ledger check: the property (or its portfolio account) must have `monitor_step_a = passed` and `ready_to_sell = passed`, plus a resolved account id and verified credentials. If those are satisfied, the push proceeds. Blocked responses reference Step A / Ready-to-sell wording, never "phase 1..4".

2. **Stop phase evaluation from producing blockers.**
   Keep the phase module only where it still supplies useful facts (owner id, owner scope, portfolio id, existing listing ids) and remove its veto: no more `PHASE_BLOCKED` bodies, no phase ordering, no phase numbers in any message. Callers that only wanted the OwnerID keep working.

3. **Fix the stale-company-profile rule so it cannot resurface.**
   A recorded `sent` / `already_set` outcome stays satisfied when credentials are re-verified later; only a profile pushed while *no* verified credentials existed counts as unproven. Step A additionally re-pushes the profile when it is genuinely unproven, so the two paths can never disagree again.

4. **Wording and UI.**
   The Step B card and its toast report the real channel outcome (or the missing Step A / Ready-to-sell prerequisite), with no phase language anywhere. Remove the retired phase copy from the monitor.

## Verification

- Re-run Step B for Dassiesingel and confirm the push executes and the listings read back, with Step B recorded as passed.
- Confirm a property that has *not* cleared Step A or Ready-to-sell is still refused, with ledger-based wording.
- Grep the codebase for remaining "phase" onboarding copy and confirm none is user-visible.

## Technical notes

- `supabase/functions/push-property-to-ru/index.ts` — swap `evaluatePhases`/`phaseBlockedResponse` gating for a ledger read of `property_channel_step_status` (`monitor_step_a`, `ready_to_sell`) plus `ru_owner_accounts` / `ru_api_credentials`; keep the force-push audit path.
- `supabase/functions/_shared/ruPhaseGate.ts` — reduce to owner/scope resolution helpers (`findOwnerAccount`, `resolvePortfolioId`, owner id resolution); delete phase construction, `phaseBlockedResponse`, and the ordering pass.
- `supabase/functions/_shared/ruCompanyDetails.ts` — treat a recorded push as satisfied unless it predates the *first* credential verification; re-verification no longer invalidates it.
- `supabase/functions/ru-cert-portal/index.ts` — drop the phase-gate call from the readiness path so it cannot block on phases either.
- `src/lib/channelOnboardOrchestrator.ts` / `src/components/admin/channel-monitor/ChannelOnboardTab.tsx` — surface the channel error or missing prerequisite; no phase wording.
- Redeploy `push-property-to-ru` and `ru-cert-portal` after the edits.
