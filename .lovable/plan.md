# Permanently clear the currency verification gate

## Confirmed failure

For property `700a9471-6c1d-4ad5-b889-1f3c71a0e9fc`, all four channel listings return ZAR, but there is still no durable `ru_currency_state` row. The existing currency ledger row therefore remains `unknown`, and the wizard correctly keeps the step incomplete even though the card's temporary response state shows green checks.

The current verification handler only persists through one selected non-master listing. A successful read can therefore paint all listing rows green without creating the property-level record that the gate actually reads.

## Fix

1. Refactor `verify_ru_currency` to aggregate all listing read-backs first, then persist one property-level currency verdict whenever the successful answers agree with the intended published currency. Do not make persistence depend on which listing is first or whether it is on the master account.
2. Treat persistence as required, not best-effort: return a failed verification result if the `ru_currency_state` upsert fails, and include the database error in backend logs without exposing secrets.
3. After the durable row is confirmed, record the `currency` channel-step ledger verdict as `passed` in the same backend flow. This removes dependence on a later re-grade request and replaces the old `unknown` result.
4. Tighten the currency card so green success and the success toast appear only after the response confirms both durable currency state and the passed gate. A successful channel read without persistence will show an actionable error instead of a false success.
5. Deploy the updated function, run verification for the affected property, then verify in the database that:
   - `ru_currency_state.verified_at` exists and ZAR matches ZAR;
   - `property_channel_step_status.currency` is `passed`;
   - reopening the wizard shows the currency step complete;
   - an immediate repeat request is deferred without clearing either durable verdict.

## Scope

Only the currency verification persistence, its currency ledger update, and the card's success criteria will change. No pricing, rate-gate, account, or other onboarding logic will be modified.