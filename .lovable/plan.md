# Correct queued channel reads in onboarding readiness

## Confirmed cause

The failure is not missing availability, pricing, or MinStay data.

For Fonteinhutte, the live channel response for Kaapse Noontjie (`5806507`) returned a full 366-day calendar with `Units="1"`, `IsBlocked=false`, and `MinStay=1`. At the same time, another readiness request was rate-gated and returned a queued HTTP 202 payload with `success: true` but no `raw_xml`.

`ru-cert-portal` currently treats `success: true` as `availability_responded: true`, even when the response is only queued. It then parses the absent XML as zero days and accepts that zero-day result as complete channel evidence. That false result is stored in `ru_readiness_snapshots` and drives the persistent pink “Availability coverage” blocker after refresh.

## Implementation

1. **Reject queued/empty payloads as channel evidence**
   - Count availability or pricing as answered only when the invocation succeeded, is not queued, and contains the expected XML payload.
   - A queued 202, deferred response, timeout, or empty body becomes incomplete evidence—not a zero-day channel calendar.

2. **Preserve the last valid verdict**
   - Route incomplete reads through the existing snapshot/local fallback path.
   - Do not write zero-day windows from queued responses into the ARI snapshot or phase payload.
   - Keep genuine channel responses with a real calendar and zero open units blocking, so actual closed inventory remains visible.

3. **Add regression coverage for the exact failure**
   - Test a queued `success: true` response with no XML and verify it cannot produce complete zero-day evidence.
   - Test a real XML response with zero units and verify it still blocks.
   - Test a real open calendar with MinStay and pricing and verify it passes.

4. **Verify against both affected properties**
   - Re-score Fonteinhutte and confirm Kaapse Noontjie no longer reports 0 open days / missing MinStay.
   - Re-score RU Test Clone A and confirm queued reads do not replace valid local/snapshot evidence; unpublished units remain a separate publishing blocker.

## Technical scope

- `supabase/functions/ru-cert-portal/index.ts` — correct readiness response classification and snapshot persistence eligibility.
- `supabase/functions/_shared/ruReadiness.ts` — add a small, testable response-evidence classifier if needed.
- `supabase/functions/_shared/ruReadiness.test.ts` — exact queued-versus-real-response regressions.

No rate-plan, calendar, unit, or property data will be changed. No new feature or fallback source will be added.