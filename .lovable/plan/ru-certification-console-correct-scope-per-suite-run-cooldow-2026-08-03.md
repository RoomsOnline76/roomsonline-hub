# RU certification console: correct scope per suite + run cooldown

## What's wrong today

Verified in `supabase/functions/ru-cert-portal/index.ts` (`run_suite`) and `src/components/integrations/RuCertificationConsole.tsx`:

1. **Account-level runs silently test a random property.** When "Account-level only" is selected, the read-only suite calls `list_properties` and then adopts `list.properties[0]` as the RU property, running "Get property content", "Get availability (365 days)" and "Get prices (365 days)" against whichever property RU happens to return first. Those results are meaningless at account level (and can fail for reasons unrelated to the account), yet they count as mandatory pass/fail.
2. **No scope labelling.** Steps and the milestone matrix don't distinguish account-scoped checks (auth, list properties, reservations, leads, composition rooms, cities/currencies, location lookup, RLNM handler) from property-scoped checks (get/push content, availability, prices, discounts, buildings/sub-user).
3. **Suite/scope combinations aren't enforced.** The "Mandatory push" and "Discounts" suites are only useful with a property selected; today they run and produce skipped-step noise instead of being blocked with a clear reason.
4. **No rate-limit protection.** Neither the console nor the portal enforces RU's 1-call-per-sliding-minute limit, so a second run can be fired immediately and get throttled mid-suite.

## What will change

### 1. Explicit step scope
Give every step in `run_suite` a `scope` of `account` or `property`:

- Account: connectivity/auth, list properties, list reservations, get leads, list composition rooms, list cities & currencies, resolve location, subscribe RLNM handler.
- Property: get property content, get availability, get prices, push content, push ARI, all read-backs, long-stay/last-minute discounts, list owner buildings (sub-user scoped).

When no property is selected, property-scoped steps are recorded as `skipped` with detail "Property-scoped check — select a ROLOS property"; the fallback that borrows `list.properties[0]` is removed so an account run never grades a foreign property. Property-scoped skips do not count as failures in the pass/fail totals.

### 2. Suite / scope matrix in the UI
The runner shows what each suite covers and blocks impossible combinations:

| Suite | Account-level only | Property selected |
|---|---|---|
| Read-only | account reads only (7 checks) | account reads + property reads |
| Mandatory push | RLNM handler only, rest blocked | full push + read-back |
| Discounts | blocked | push + verify discounts |
| Full | account reads + RLNM | everything |

"Mandatory push" and "Discounts" are disabled in the suite dropdown while "Account-level only" is chosen, with a hint line explaining why. Step rows and the milestone matrix get an Account / Property badge.

### 3. Run cooldown (1 call per sliding minute)
- Server: `ru-cert-portal` rejects `run_suite` (and the discounts run) if the latest `ru_cert_runs` row for the account started less than 60 seconds ago, returning the remaining seconds instead of firing RU calls.
- Client: after any run, the Run buttons are disabled with a live countdown ("Rate limit — 43s"), driven by the newest run's `started_at` so the cooldown survives a page reload. Applies to `RuCertificationConsole.tsx` and the `RuCertificationCheckButton` in `RuCertificationActions.tsx`.
- A rejected run surfaces as a toast with the wait time; no `ru_cert_runs` row is created.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts`: add `scope` to the `CertStep` type and to `CERT_MILESTONES`; thread a `scope` option through the `call()` helper; drop the `list.properties[0]` fallback; add the 60s cooldown guard before the run insert; return `{ cooldown_seconds }` on rejection. Pass/fail counting ignores property-scoped skips.
- `src/components/integrations/RuCertificationConsole.tsx`: suite metadata gains `requiresProperty`; disable invalid options; scope badges in the run detail sheet and milestone matrix; shared `useRunCooldown` derived from `runs[0].started_at`.
- `src/components/integrations/RuCertificationActions.tsx`: same cooldown gate on the embedded check button.
- No adapter-locked files are touched (`rentalsunited-api`, `ru-reservation-handler`, `push-property-to-ru` push builders stay as-is).
- Redeploy `ru-cert-portal` and verify one account-level read-only run (property checks show as scope-skipped) plus an immediate re-run showing the countdown.
