# Rentals United White Label — Certification Scorecard

**Audit date:** 2026-08-19 (UTC)
**Scope:** ROL'OS Channel Manager adapter, all live channel accounts (retired test OwnerIDs excluded)
**Verdict legend:** **Pass** = implemented, triggered and evidenced by real runtime rows · **Pass (unproven)** = implemented and firing, but no per-change evidence is queryable · **Fail** = gap that would not survive an auditor sampling raw rows

Headline: **2 Fail, 2 caveated Pass, all other items Pass.** 9 items pass structurally but carry no per-change runtime evidence.

---

## 1. User management

| Item | Verdict | Evidence |
|---|---|---|
| `Push_CreateUser_RQ` correctly used when onboarding a new user | Pass | Sub-user provisioning path in the onboarding flow. 5 exchanges, all successful, latest 2026-08-19 07:01, ResponseIDs stored |
| `Push_FillCompanyDetails_RQ` correctly used | Pass (caveat) | 20 successes / 3 failures. Latest success 2026-08-18 19:02; latest failure 2026-08-19 07:01. The failure path needs a retry before sign-off |

## 2. Static content

| Item | Verdict | Evidence |
|---|---|---|
| `Push_PutProperty_RQ` used in the advised manner (on updates and weekly) | Pass | Event path fingerprints static content (SHA-256) and pushes only on change; weekly full refresh Mondays 02:00. 1,105 exchanges, latest 2026-08-19 08:39 |
| Property successfully pushed to RU | Pass | 208 successful inventory pushes; property read-back verification passes |
| Property name gets updated | Pass (unproven) | Covered by the fingerprint delta; the run log is not field-scoped so the name change cannot be isolated |
| Property capacity / standard guests modified | Pass (unproven) | Same delta path, same evidence limitation |
| Property location modified | Pass (unproven) | Same |
| Amenities added / removed | Pass (unproven) | Same |
| Images added / removed | Pass (unproven) | Same |
| Taxes / fees modified | Pass (unproven) | Same |
| Other implemented static information synced | Pass | Single fingerprint covers the whole static payload; 92 correctly debounced no-op runs prove change detection works |

## 3. Availability

| Item | Verdict | Evidence |
|---|---|---|
| `Push_PutAvbUnits_RQ` used in the advised manner (on updates and daily) | Pass | Scheduled refresh every 6 hours — better than the daily requirement — plus event-driven pushes. 1,191 exchanges, latest 2026-08-19 12:04 |
| Availability changes — close / open requested periods | Pass (unproven) | Implemented (confirmed reservation dates excluded from open inventory); no per-change row isolated in the run log |
| Minimum stay changes | Pass (unproven) | Same |
| Changeover day changes | Pass (unproven) | Same |
| Changes delivered as delta updates | Pass (unproven) | Delta vs full push is not recorded in the run details, so it cannot be demonstrated from data alone |

## 4. Pricing

| Item | Verdict | Evidence |
|---|---|---|
| `Push_PutPrices_RQ` used in the advised manner (on updates and daily) | Pass | Same 6-hourly plus event-driven path. 1,134 exchanges, latest 2026-08-19 12:04 |
| Changes to different periods in RU | Pass (unproven) | Not isolated in the run log |
| Changes delivered as delta updates | Pass (unproven) | Not isolated in the run log |

## 5. Reservation processing

| Item | Verdict | Evidence |
|---|---|---|
| `Pull_ListReservations_RQ` every 30 minutes for a correct period | Pass | 30-minute poll; 90-day back window plus a 365-day forward window for leads (RU minimum is 7 days back). 956 successful runs, latest 2026-08-19 12:00 |
| RLNM subscription in place | Pass | Handler URL re-subscribed daily (77 successes, latest 2026-08-19 01:02); subscriptions listed back and verified the same day |
| Bookings retrieved in the PMS and data correctly displayed | Pass (thin sample) | Poll and inbound webhook share one ingest path; bookings render on the dashboard and calendars. Only 7 channel bookings exist in total, none in the last 6 days — low test volume, not a defect signal |
| Reservation modifications synced | Pass (stale) | 3 successful `Push_ModifyStay_RQ` runs, latest 2026-08-13. Both `<Current>` and `<Modify>` states sent |
| Reservation cancellations synced | **Fail** | `Push_CancelReservation_RQ` and `Push_RejectRequest_RQ` each ran successfully exactly once, on 2026-08-04, and the raw exchanges never appear in the API log at all — unlike every other endpoint. Not evidenceable in its current state |

## 6. White label interface embed

| Item | Verdict | Evidence |
|---|---|---|
| WL embed in place and working | Pass | Embed host page loads RU's one-line script from a real URL (not `srcdoc`, which breaks `history.replaceState`); per-property token, refresh token and OwnerID injected into the iframe; ready/error handshake with a 25s boot timeout and manual retry. No server-side telemetry of embed load outcomes — failures are visible client-side only |

## 7. Logging solution in place

| Item | Verdict | Evidence |
|---|---|---|
| API logs retained at least 30 days | Pass | Durable exchange log with 90-day retention held on the row (`expires_at`), pruned by a daily job at 03:17 |
| Full request XML, full response and ResponseID stored | **Fail** | 33,210 rows: request XML present on 99.9%, response XML on 75.8%, ResponseID on 75.6%. Roughly 24% of rows carry no response at all. Credentials are always redacted, which is correct, but silent nulls will not survive raw-row sampling |

---

## Remediation before sign-off

1. **Cancel / reject logging and exercise.** Route `Push_CancelReservation_RQ` and `Push_RejectRequest_RQ` through the same exchange logger as every other endpoint, then cancel and reject a live test reservation so the lifecycle rows carry recent, real evidence.
2. **Explain the 24% of rows with no response.** Label transport failures (timeout, network, non-XML body) with an explicit reason and status instead of leaving response XML and ResponseID null.
3. **Field-scoped push detail.** Record which fields changed and whether the push was a delta or a full payload in the run details for static, availability and price pushes, so the nine "unproven" items above become directly queryable.
4. **Investigate failure rates.** Weekly content refresh (7 successes / 8 failures) and static delta (39 / 17) need their error messages triaged — transient RU-side errors and systemic bugs are currently indistinguishable.

## How this was verified

- Runtime evidence: direct reads of the exchange log, sync-run log, certification-run log and the bookings table, current to 2026-08-19 12:04 UTC.
- Code evidence: the adapter edge functions, shared static-delta / booking-sync / readiness helpers, the certification portal endpoint registry (every entry marked implemented and wired, with only the content-quality-check rows informational because the channel cannot answer them for this account), and the embed host page and component.
- Cadence caveat: schedules are taken from the declared expected-job list and corroborated by the observed timestamp cadence of real runs; the scheduler table itself was not read directly during this audit.
