# Retire distribution account 742577 (ru-test-32@roomsonline.co.za)

## What this account is today

- Bound at **portfolio** scope to **DEMO C**, whose only member property is **RU Test 33** (slug `ru-test-3`).
- Company details still `pending`, no API key pair minted or verified on it.
- Neither RU Test 33 nor any of its 10 units carries a channel listing id yet, so nothing has actually been pushed under this OwnerID.

## What will happen

Run the existing **Retire a bound sub-account** workflow (Channel Monitor → Advanced) against OwnerID 742577 with a reason note:

1. Archive every listing this account owns at the channel. Because RU Test 33 and its units have no listing ids stored, this step will report "no listings to archive" rather than making channel calls.
2. Archive the sub-account into the retired registry, so 742577 disappears from every roster, sync and reconciliation read.
3. Disconnect DEMO C / RU Test 33: clear listing ids and verification state, turn channel pushing off, reset the Step A/B/Connect verdicts to pending, and delete the binding row.

Afterwards DEMO C has no distribution login, so a fresh Step A run provisions a new slug-based account whenever you want to onboard it again.

## Notes

- No code changes are needed — this uses the workflow already built for exactly this case.
- The run is executed via the admin panel (or the same edge action) and reports each step's outcome, so nothing is claimed silently. If the channel refuses an archive, the account is not marked retired and the panel says which listing failed.
