# AlbatrosTEST: cost monitor says "no account", the wizard says ready

## What is actually wrong

Both screens are looking at the same property but resolving its distribution account differently, and only one of them knows about portfolio inheritance.

Confirmed in the data:

- AlbatrosTEST sits in the portfolio **RentalsTest**, together with **Sealion**.
- The distribution account (login `rentalsu@polka.co.za`, account 742649, key stored, company details sent) is recorded against **Sealion**, not against the portfolio and not against AlbatrosTEST.
- AlbatrosTEST's owner email on the property record is `ru-owner@roomsonline.co.za`, which matches no account row at all.

So:

- The onboarding wizard asks the backend, which walks portfolio → property → **portfolio siblings** → email, finds Sealion's account and correctly reports AlbatrosTEST as bound and ready. That is why it goes green after a moment (the answer arrives from the server after first paint).
- The cost monitor does its own lookup in the browser: property row, then portfolio row, then owner email. It has no sibling step, so it finds nothing, prints "No channel account linked", and — because it treats a missing account as "push cannot be on" — labels the property **Paused** with the portfolio name RentalsTest beside it.
- The property's push panel does a third, weaker lookup: match `ru_owner_accounts` on owner email alone, any scope, first row wins. That result lands after the backend answer and overwrites it, which is how a different account number can appear on screen a moment after the page settles.

Nothing is misconfigured at the channel. Three screens each implement their own version of "which account does this property use".

## The fix: one answer, from the backend

1. **One resolver, exposed once.** Add a bulk read to the channel portal function that takes a list of property ids and returns, per property, the resolved account (account number, sub-user, portal login, key captured, company details sent) plus how it was resolved — `own`, `portfolio`, `inherited from sibling`, `by email`, or `none`. It reuses the existing shared resolver, so it cannot drift from what push and onboarding use.
2. **Cost monitor consumes it.** The monitor stops resolving accounts in the browser and uses the returned values. AlbatrosTEST then shows account 742649 / `rentalsu@polka.co.za`, and its state follows the same push-on rule the rest of the platform uses — so it reads **Live**, not Paused.
3. **Inheritance is visible, not silent.** Where the account is inherited, the monitor shows it as "inherited — RentalsTest" on the account cell, so an operator can see the property has no row of its own without thinking it is unlinked.
4. **The push panel stops guessing.** Its email-only lookup is removed; it displays the account from the same backend answer it already requests for the identity gate, so the number on screen cannot change after load.
5. **A "paused" label must mean paused.** The monitor separates "push switched off" from "account could not be resolved": the second becomes its own state, **Not linked**, with the reason, so a resolver gap can never again be reported as a business decision.

## Verification

- Reload the cost monitor: AlbatrosTEST shows Live, 742649, login `rentalsu@polka.co.za`, marked inherited from RentalsTest; the onboarding page and the push panel show the same number, with no flicker to a different one.
- Spot-check a genuinely unlinked property (PufferFish, whose account row carries no key) still reports Not linked, and a property with push switched off still reports Paused.
- Portfolio counts on the monitor ("push enabled without a linked account") should drop to only genuinely unlinked properties.

## Technical notes

- New `ru-cert-portal` action `resolve_owner_accounts` (`{ property_ids: string[] }`) → `{ accounts: Record<propertyId, { ru_owner_id, ru_user_id, owner_email, keys_captured, company_details_sent, scope, source_property_id, portfolio_name }> }`, built with `findOwnerAccount` from `_shared/ruPhaseGate.ts` plus the `ru_api_credentials` key check; admin-scoped, falls back to `can_access_property` for non-admins as the other property-scoped reads do.
- `src/hooks/useChannelCostMonitor.ts`: delete the local `ruAccounts` / `accountByProperty` chain and the `ru_api_credentials` fetch; call the new action for the relevant property ids; add `accountScope`/`accountSourceName` to `ChannelPropertyRow` and a `"unlinked"` member of `ChannelSyncState`.
- `ChannelPropertyTable.tsx`: render the inherited badge and the new Not-linked state; keep `pushReportedOn` as the live/paused decision for linked properties.
- `src/components/property/PushToRentalsUnited.tsx`: drop the `ru_owner_accounts.eq(owner_email)` query; take the account fields from the `property_ru_identity` response already fetched for `identityGate`.
- `src/hooks/useChannelRailStatus.ts` keeps its platform-wide account list (it is not per-property) — no change.
