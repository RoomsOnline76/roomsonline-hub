# Show the RU Test Clone properties in the channel onboarding queue

## What's happening (verified)

The four clones exist and are perfectly normal records: `RU Test Clone A/B/C/D` are all active, not deleted, `external_system = roomsonline`, and **both** flags are false (`is_sandbox = false`, `is_test_property = false`).

They disappear because the onboarding queue additionally guesses at names: `src/pages/AdminOnboarding.tsx:534` drops any property whose name matches `/\b(test|demo|staging|dummy|sandbox)\b/i`. "RU **Test** Clone A" matches, so all four are filtered out before the list is built — nothing to do with scope, entitlement or readiness.

This is also the only place in the codebase that filters properties by name (nothing else uses that pattern), and it contradicts the standing rule that the Test flag is a marker only and a flagged property behaves normally everywhere.

## The change

Remove the name-guessing filter from the onboarding queue and keep only the explicit flags as the exclusion signal:

- A property is excluded only when `is_sandbox = true` (a genuine sandbox environment).
- `is_test_property` stays a label, not an exclusion — matching the existing Test-flag rule — so the clones appear in the queue with their amber Test badge if that flag is ever set.
- Names are never inspected. Real properties with words like "Test" or "Demo" in their name stop vanishing.

Result: the four RU Test Clone properties show up in the onboarding queue and their channel wizard becomes reachable at `/admin/onboarding/<id>`, counted in the queue counters like any other ROL'OS property.

## Technical notes

- `src/pages/AdminOnboarding.tsx`: delete the `testPattern` constant and its `!testPattern.test(prop.name)` condition in the `realProperties` filter; keep the `is_sandbox !== true` guard and drop the `is_test_property` guard. No query change — the flags are already selected.
- No database migration, no edge-function change; the clones already satisfy `is_active` and `permanently_deleted_at is null`.
- Verify afterwards by opening `/admin/onboarding`, confirming the four clones are listed, and opening one clone's wizard.
