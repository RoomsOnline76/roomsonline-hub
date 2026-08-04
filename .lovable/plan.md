# Step 1 — Static content completeness (verified scope)

## What the code actually shows (verified this turn)

The uploaded CSV's static-content rows are largely stale, and the summary claim "no hard edge-level gate" is incorrect:

- `push-property-to-ru/index.ts` **does** hard-gate both paths: single-unit (line ~3312) and multi-unit (line ~2752) return HTTP 422 `NOT_READY` with `gaps` before any `Push_PutProperty_RQ` / building write. Multi-unit gaps are image-verified before scoring.
- `_shared/ruReadiness.ts` + `buildValidation()` already evaluate every CSV rule: name, ObjectTypeID, CanSleepMax ≥ 1, Floor, Space, Street, DetailedLocationID, ZipCode, coordinates, ≥ 10 amenities (with padded detection), composition rooms + bed coverage ≥ 50% of CanSleepMax, description, ≥ 10 photos at 1024×683 with exactly one main, ≥ 1 payment method, ≥ 1 cancellation policy.

So three real gaps remain — these are what Step 1 closes:

1. **The gate is bypassable and silent about it.** `force: true` skips the readiness gate entirely on both paths (the phase-gate bypass is audited to `ru_sync_runs`, the readiness bypass is not).
2. **Gaps are prose, not keys.** `mandatoryGaps()` returns human sentences only, so the UI cannot deep-link to the failing field — `channelRegistry` deep-links have nothing stable to match on.
3. **No static-content playground / duplicate-push test.** `ru-cert-portal` has `read_only | mandatory | discounts | full` suites but no per-rule static-content panel and no duplicate-push assertion (push twice → same PropertyID, no second listing).

## Phases

### Phase 1a — Machine-readable gate output
- Extend the gate responses in `push-property-to-ru` to return `failing_checks: [{ key, label, group, unit, detail, fix_hint }]` alongside the existing `gaps` strings (keep `gaps` for backwards compatibility). Add a `mandatoryFailures()` helper in `_shared/ruReadiness.ts` next to `mandatoryGaps()` — the rule table stays the single source, no second copy.
- Audit each CSV row against the rule table one line at a time and record the mapping (rule → check key → validation flag) as a comment block in `ruReadiness.ts`, so the CSV is verifiably covered.

### Phase 1b — Close the force loophole
- When `force: true` skips the readiness gate, write an audited `ru_sync_runs` row (`action: 'force_push_override'`, `error_code: 'READINESS_GATE_BYPASSED'`) with the failing keys, mirroring the existing phase-gate bypass.
- Restrict `force` to admin/dev/fearless_leader callers; owner-initiated pushes can never bypass mandatory content.

### Phase 1c — Form-side parity and deep links
- Map each RU check key to its property-editor `tab` + `focus` in `src/config/channelRegistry.ts`, and drive `RuChannelContentChecklist` / `RuReadinessScorecard` from the returned `failing_checks` so labels, tiers and fix targets come from the edge response rather than local heuristics.
- Existing `data-field` markers are reused; no new highlighting system.

### Phase 1d — Cert console static-content playground
- New `ru-cert-portal` action `static_content_playground`: run the dry run per unit and return per-rule pass/fail (mandatory vs advisory) with unit attribution and evidence persisted to `ru_sync_runs`.
- New action `duplicate_push_test`: push the property twice and assert the same RU PropertyID is returned and no second listing/building is created; report PASS/FAIL with both ResponseIDs as evidence.
- Surface both as a "Static content" panel in `RuCertificationConsole.tsx`, feeding the milestone tracker and the existing JSON/PDF evidence export.

## Technical notes
- No changes to locked adapter regions in `.lovable/ADAPTER_LOCKS.md`.
- Wire payloads stay snake_case; `_shared/ruReadiness.ts` remains the only scorer used by the form, the push gate and the cert console.
- Sub-user AccessKey/SecretKey auth for every RU call in the new playground actions; master keys are never a fallback.
