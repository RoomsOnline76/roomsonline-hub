

## Plan: Force-Re-Push Fonteinhutte (Jongensfontein) Units to RU + Verify

### Diagnosis (already confirmed)

Direct query to RU `Pull_GetProperty` for two Fonteinhutte units returned:

| RUID | Name | RU `Currency` | RU `DetailedLocationID` | Last Mod |
|------|------|---------------|------------------------|----------|
| 4692658 | GALJOEN | **USD** ❌ | 83272 | 2026-04-19 19:02 |
| 4692654 | BLAASOPPIE | **USD** ❌ | 83272 | 2026-04-19 19:02 |

- All 9 units (`GALJOEN`, `BLAASOPPIE`, `KAREL GROOTOOG`, `MOSSELKRAKER`, `KABELJOU`, `KAAPSE NOOINTJIE`, `ROMAN`, `PEREKIL`, `STEENBRAS`) belong to building **Fonteinhutte Self-Catering Chalets** (`00015d06-…`), owner `julius@polka.co.za`, country **South Africa**, coords `-34.43, 21.34`.
- DB has correct `country = 'South Africa'`, `amenities.currency = 'ZAR'`.
- Code fix (CurrencyID + LocationID) is **deployed**, but the units were **last pushed before the fix** — they still carry the old USD inheritance and stale `DetailedLocationID=83272` (which is why LekkeSlaap rejects them).

### Fix path

Only one operation is required — invoke the `reconcile_ru_country_currency` action that already exists in `push-property-to-ru`, scoped to this property's id. The function will:
1. Re-resolve `currency_id` → **48 (ZAR)** via `mapCurrencyToRUId(amenities, 'South Africa')`.
2. Re-resolve `DetailedLocationID` via coords → fall back to ZA default city (Cape Town `1611`) if coord lookup fails.
3. Re-push every RU unit under Fonteinhutte (multi-unit fan-out: all 9 RUIDs).
4. Persist resolved values into `pms_mappings.metadata` (`ru_currency_id`, `ru_location_id`, `ru_country`, `coords_hash`) so subsequent pushes don't drift.

### Steps

| # | Action |
|---|--------|
| S1 | Invoke `push-property-to-ru` with `{ "action": "reconcile_ru_country_currency", "property_ids": ["00015d06-a9cb-4e82-a62e-a7685e5d7c33"] }` |
| S2 | Capture per-unit push response IDs and any failures |
| S3 | Re-pull `Pull_GetProperty` for **all 9 RUIDs** and assert `Property Currency="ZAR"` and `DetailedLocationID` resolves to a ZA city (≠ 83272 if 83272 is non-ZA, or stays 83272 if it is in fact a Jongensfontein/Stilbaai locality and only currency was wrong) |
| S4 | If S3 still shows `Currency="USD"` for any unit, dump the request XML (`buildPushPropertyXml` output) into the logs and confirm `<CurrencyID>48</CurrencyID>` is being emitted — if missing, hot-fix the adapter; if emitted, escalate to RU support with the ResponseID |
| S5 | Update `RU-Response-QA.md` with verification ResponseIDs (Section E) |
| S6 | Re-trigger LekkeSlaap eligibility check on the property (no code change — RU pushes the update on next channel sync) |

### Out of scope
- No code changes (fix is already deployed).
- Not touching other properties — scoped strictly to Fonteinhutte's 9 units.
- `cron-push-all-properties-to-ru` will eventually catch any sibling drift; no need to wait for it.

### Verification (success criteria)

```xml
<Property Currency="ZAR">
  <ID …>4692658</ID>
  <DetailedLocationID TypeID="4">…ZA city ID…</DetailedLocationID>
</Property>
```

For all 9 RUIDs. If any remains USD after S1–S2 succeed, S4 escalates with concrete request/response evidence.

