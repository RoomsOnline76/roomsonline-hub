# Step B: location & currency — stop re-writing what Step A already set

## What the wire log actually shows (Leopard / ru-test-4, location 83272)

- 18:02 `Push_CreateUser_RQ` — succeeded, and it carried `<Locations><LocationId>83272</LocationId></Locations>`.
- 18:12 `Push_FillCompanyDetails_RQ` — succeeded, and it carried `<Locations><Location Id="83272" /></Locations>` again.
- The same 18:12 call **did** include the legal representative:

```text
<LegalRepresentativeInfo>
  <FirstName>Julius</FirstName><LastName>Erasmus</LastName>
  <Email>connect@roomsonline.co.za</Email>
  <City>Still Bay</City><CountryOfResidenceId>345</CountryOfResidenceId>
  <Address>38 Geelhout Avenue</Address><PostCode>6674</PostCode>
  <Birthday>1976-02-29</Birthday><NationalityId>345</NationalityId>
  <Region>Western Cape</Region>
</LegalRepresentativeInfo>
```

So the legal rep was sent, complete, on the child pair. Note the channel's legal-rep block has **no** location element at all — it carries City / Region / CountryOfResidenceId only, so there is nothing location-shaped missing there. Both location writes we do make are legitimate but they are the account's *operating region* list, which is why the same id appears twice.

## The real problem to fix

The property's own location is published on the listing, not on the account. Step B currently treats "location & currency" as a write step, so a run that already agrees end to end can still spend an owner-window write. Change it to:

1. **Location is never re-pushed on its own.** The listing's location travels with the property push. Step B's location task becomes a read-back comparison (published location vs `properties.ru_location_id`), reporting agree / differ, and it only offers a corrective push when they differ.
2. **Currency write only on a genuine mismatch.** Keep the existing skip when the scoped location currency already holds the authored ISO; extend it so a fresh read-back in the same run also satisfies it, and label the outcome plainly ("already set at the channel — no write sent") instead of a generic pass.
3. **Account region list is set once.** The company-profile push keeps `<Locations>`, but the account's location list is only re-sent when the composed set differs from what was last accepted — the create-user call already established it.
4. **Show the provenance.** The Step B card states where the location id came from and when each side last confirmed it, so the same id appearing in create-user and company-profile reads as expected rather than as a duplicate.
5. **Legal rep becomes a visible prerequisite.** The company-profile card lists the legal-rep fields with a sent/missing state, so it is never a guess whether that block travelled.

## Technical notes

- `src/lib/channelOnboardOrchestrator.ts`: split the current `verify_currency` task into a location read-back comparison plus the currency verdict; pass a run-scoped flag so the currency task never re-writes when the read-back in the same run already agreed.
- `supabase/functions/_shared/ruCurrency.ts`: no new write paths; add `already_set_readback` as a first-class `flip_outcome`/`skip_reason` and return the read-back ISO for the UI label.
- `supabase/functions/ru-cert-portal/index.ts` (`ensure_company_details`): fingerprint the composed `location_ids` on the account row and skip re-sending an unchanged region list; record legal-rep field coverage alongside `company_details_status`.
- Step B UI card: location provenance line, currency verdict wording, legal-rep coverage list.
- No schema change beyond the existing `company_profile` / status columns on `ru_owner_accounts`.
