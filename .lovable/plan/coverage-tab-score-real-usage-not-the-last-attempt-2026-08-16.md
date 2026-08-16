# Coverage tab: score real usage, not the last attempt

The Coverage tab ("Endpoint & integration coverage") currently grades each RU endpoint from the **latest** certification step or the **latest** `ru_sync_runs` row, and it ignores the raw XML call log entirely. That is why endpoints you know work read red, grey or "informational":

- A newer failing attempt on one sub-account overwrites an older success from another account.
- Several surfaces never write a `ru_sync_runs` row at all (amenity dictionary, composition rooms, location lookups, cities/currencies register, archive/re-activate, reservation-by-ID), so they can only ever show "never used".
- Some registry rows are flagged `informational` (excluded from the score) on the assumption the channel cannot answer them — the call log shows they answer fine.

## What changes

### 1. Any successful call, on any sub-account, counts as a success

Evidence resolution becomes **latest success wins**, drawn from three sources merged by RU method name:

```text
ru_api_log   (raw XML calls, per method, per ru_owner_id)  ← new primary evidence
ru_sync_runs (product surface actions)
ru_cert_runs (certification steps)
```

A failure only shows red when there is **no** successful call for that method in the retention window. Each row then shows the last success, how many sub-accounts have exercised it, and (separately) whether the most recent attempt failed — so a real regression is still visible as an amber "last attempt failed" note without wiping the green.

### 2. Method aliases fixed

The registry names methods the adapter does not actually send, so their real calls were invisible:

| Registry row | Real method(s) in the call log |
|---|---|
| Set listing status (archive / restore) | `Push_SetPropertiesStatus_RQ`, `Push_RemoveProperty_RQ`, `Push_DeleteProperty_RQ` |
| Cities + currencies register | `Pull_ListCitiesAndCurrencies_RQ`, `Pull_ListCitiesProps_RQ` |
| Location lookup helpers | `Pull_GetLocationByCoordinates_RQ`, `Pull_GetLocationByName_RQ` |
| Composition room dictionary | `Pull_ListCompositionRooms_RQ` |
| Create white-label sub-user | `Push_CreateUser_RQ`, `Pull_ListMyUsers_RQ` |
| List properties | `Pull_ListOwnerProp_RQ`, `Pull_ListSpecProp_RQ` |

### 3. Dictionary caches count as evidence

`ru_amenities` (1 637 rows) and `ru_locations` (80 098 rows) are the built product of the dictionary pulls, and the property editor's amenity picker and address resolution run off them. The dictionary rows read their cache row count + last refresh as usage evidence when the call itself has aged out of the 90-day XML log.

### 4. These stop being "informational" and re-enter the score

Amenity dictionary, composition room dictionary, location lookup helpers, cities + currencies register, and set listing status (archive / restore) all have confirmed successes, so they move into the scored denominators. Only the content-quality-check rows (`CM_LNM_OrderMinimumContentQualityCheck_RQ`) stay informational, because the channel still returns no usable result there.

### 5. Lifecycle rows read from the booking sync log

Cancel / reject / modify have successful `ru_sync_runs` rows (`cancel_reservation`, `reject_request`, `modify_stay`) and `Push_ModifyStay_RQ` successes in the XML log. With latest-success-wins they turn green, and `Push_CancelReservation_RQ` / `Push_RejectRequest_RQ` are added to the method aliases so future calls are picked up from the XML log too.

### 6. Reservation-by-ID and RLNM replay

`Pull_GetReservationByID_RQ` has 26 successful calls and `reservation_idempotency_test` / `rlnm_replay_test` have successful runs — both go green under the new resolution. No separate change needed beyond the alias work.

## Live verification after the change

Once deployed, I will prove the currency/cities path end to end as you asked, on a TEST-portfolio property:

1. Read the current RU currency (pull).
2. Change it, confirm the delta push is accepted by the channel.
3. Pull it back to confirm the channel stored the new value.
4. Change it back to the original and pull again to confirm restoration.

Then re-open Coverage and confirm the affected rows are green with the account count shown, and report the two compliance percentages before/after.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts`, `coverage_matrix` / `coverage_evidence`: add an `ru_api_log` aggregate (`action`, `success`, `created_at`, `ru_owner_id`) grouped by normalised method; build `latestSuccessByMethod` and `accountsByMethod`; change the per-row resolver so a success at any source/owner sets `status = "passed"` and only the absence of any success yields `failed`; keep the freshness (`max_age_hours`) check against the last **success**.
- Registry rows gain `api_methods?: string[]` for the alias table above and `cache_evidence?: { table: string }` for the dictionary caches; the `informational` flag is removed from the five rows named above.
- New response fields per row: `accounts_used`, `last_success_at`, `last_attempt_failed`, `evidence_sources[]` — surfaced in `src/components/integrations/RuCoverageTab.tsx` as an "accounts" column and an amber "last attempt failed" chip, and included in the JSON/PDF evidence export.
- No schema changes, no new tables, no adapter (locked-file) changes.
