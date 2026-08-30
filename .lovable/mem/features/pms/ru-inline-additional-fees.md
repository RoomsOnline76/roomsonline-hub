---
name: RU fees ride inline AdditionalFees
description: RU has no separate fees verb — property_charges map into Push_PutProperty_RQ/Property/AdditionalFees with DiscriminatorID/FeeTaxType vocabularies
type: feature
---
Rentals United fees: there is NO Push_PutPropertyFees_RQ (RU answers "not implemented method"). Fees go inline in Push_PutProperty_RQ as `<AdditionalFees>` immediately after `</Descriptions>`, before the mandatory trailing `<SecurityDeposit>`.

- Built by `_shared/ruFees.ts` (`buildRuFeeEntries` from property_charges + legacy cleaning fallback; `buildAdditionalFeesXml`); wired in `rentalsunited-api` `buildPushPropertyXml`.
- DiscriminatorID: 1 FlatPerStay, 2 FixedPerDay, 3 IndependentPercentage (value = fraction, 2.5% → 0.025), 5 FixedAmountPerPerson, 6 FixedAmountPerPersonPerDay.
- FeeTaxType: 41 Cleaning, 34 Resort, 33 Service, 18 Housekeeping, 29 Pet, 31 Parking, 36 Tourism, 0 unknown.
- Deposits never in AdditionalFees — SecurityDeposit slot only (ruDeposits.ts).
- When fees are supplied, send `<CleaningPrice>0</CleaningPrice>` to clear the obsolete slot (RU transition guidance; Notif 258 echo is expected and harmless).
- The collection replaces the whole set per push, so charge deletions retract automatically; charges are part of the delta fingerprint.
