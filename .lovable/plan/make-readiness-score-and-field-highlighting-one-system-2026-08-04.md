# Make readiness score and field highlighting one system

## What is wrong today

There are two completely separate evaluators, so the two numbers can (and do) contradict each other — your screenshot shows "Mandatory 100%" next to "Mandatory 1 of 14 outstanding".

1. **The score badge** calls the `check-activation-readiness` backend function. It grades ~9 grouped checks (contract, content, media, commercial, PMS, location, contact, rooms, policies, plus RU checks). Each check's tier is decided at runtime from the severity it happens to return, so the mandatory/recommended totals shift depending on the property.
2. **The field highlighting / stepper** grades 21 individual fields from the client-side registry (`propertyFieldRequirements.ts`), with fixed tiers.

They also disagree on truth for the same subject:
- Policies: the backend check reads only the legacy `amenities` keys; the client reads the actual policy rows (`rolos_reservation_policies`) and the "None" mode.
- Check-in/check-out times exist only in the client registry, so they never affect the score.
- Media, contact and rooms are single pass/fail checks in the backend but several separate fields in the client.

## The fix: one readiness model, two renderings

Make the **field-level registry the single source of truth** for scoring and highlighting, and let the backend contribute only the checks a browser cannot do.

```text
properties row + policy rows        server-only checks
        |                                   |
        v                                   v
   field registry  ------ merge ------>  unified readiness model
                                            |
        +-----------------+-----------------+-----------------+
        v                 v                 v                 v
   Score badge      Field borders      Requirement       Checksheet /
   (Offerings)      (pink / blue)        stepper         section badges
```

### Behaviour after the change

- The badge percentages are computed from exactly the same items the highlighting counts: "Mandatory 13 of 14 (93%)", "Nice to have 5 of 7 (71%)" — never 100% while a field is still outstanding.
- Server-only items (contract signed, PMS conflicts, RU location/currency) appear in the same list as non-field requirements: they are counted in the score, listed in the checksheet, and route to the right tab, but they draw no field border because there is no field to paint.
- Clicking the badge still opens the setup wizard; the checksheet and stepper walk the same unified list, in section order.
- Every item shows one consistent state everywhere: satisfied, outstanding-mandatory (pink), outstanding-recommended (blue).

## Technical detail

- New hook `usePropertyReadiness(propertyId)` in `src/hooks/`:
  - reuses the existing query (property row + `rolos_reservation_policies`) and `evaluateRequirements()`;
  - invokes `check-activation-readiness` once and keeps only the checks that have no field-registry counterpart (`contract`, `pms`, `rentalsunited_location_currency`), mapped through `CHECK_TO_FIELD_KEYS` so nothing is double counted;
  - returns `items` (unified, each with `key`, `label`, `tier`, `section`, `satisfied`, `paintable`), plus `mandatoryTotal/Passed/Score`, `recommendedTotal/Passed/Score`, `outstandingBySection`, and `refresh`.
- `usePropertyFieldRequirements` becomes a thin wrapper over the new hook, filtering `items` to `paintable` ones for the active section, so `decorateRequirements` and the stepper keep working unchanged.
- `RolosReadinessScoreBadge` drops its own `check-activation-readiness` query and renders the unified totals; `passed` becomes `mandatoryOutstanding === 0`.
- `RolosReadinessChecklist` renders the unified `items` grouped by tier and section instead of the backend's `blockers` / `warnings` arrays, keeping the existing deep links (`?focus=<key>`).
- Backend alignment so the shared checks agree with the client registry:
  - `checkPoliciesComplete` accepts a master row in `rolos_reservation_policies` and `cancellation_master_mode === 'none'`;
  - add check-in/check-out times to the backend check set (recommended tier) reading both `amenities.house_rules.*` and the legacy flat keys;
  - fix tier stability so a check does not flip between blocker and warning across branches.
- Query keys unified to `["property-readiness", propertyId]` so saving a field refreshes badge, borders, stepper and checksheet together.

## Out of scope

No change to what activation actually blocks on server-side, and no new requirement fields beyond the check-in/out times already shown in the stepper.
