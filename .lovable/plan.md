# RU certification scorecard (Pass/Fail) as a markdown deliverable

Produce `docs/reference/ru-wl-certification-scorecard.md` — the certification campaign checklist, scored item by item, with the evidence behind each verdict (code path, trigger/cadence, and real runtime rows). Below is the scoring already derived from the audit; the deliverable writes it up in full, and the four remediation items are listed separately so nothing is silently marked green.

## Scores

### User management
| Item | Verdict | Evidence |
|---|---|---|
| Push_CreateUser_RQ used when onboarding a new user | Pass | 5 exchanges, all successful, latest 2026-08-19 07:01, ResponseIDs stored |
| Push_FillCompanyDetails_RQ used correctly | Pass (with caveat) | 20 successes / 3 failures; latest success 2026-08-18 19:02. Failure path needs a retry fix |

### Static content
| Item | Verdict | Evidence |
|---|---|---|
| Push_PutProperty_RQ on update and weekly | Pass | Event path fingerprints static content and pushes on change; weekly job Mon 02:00. 1,105 exchanges, latest 2026-08-19 08:39 |
| Property pushed successfully | Pass | Inventory push 208 successes; property read-back verified |
| Name / capacity / location / amenities / images / taxes changes | Pass structurally, unproven per field | One fingerprint-driven delta covers every static field, but the sync log is not field-scoped, so no per-field evidence exists |
| Other static info synced | Pass | Same delta path |

### Availability
| Item | Verdict | Evidence |
|---|---|---|
| Push_PutAvbUnits_RQ on update and daily | Pass | Refresh runs every 6 hours (better than daily); 1,191 exchanges, latest 2026-08-19 12:04 |
| Open / close periods | Pass structurally, unproven | No per-change evidence isolated in the run log |
| Minimum stay changes | Pass structurally, unproven | Same |
| Changeover days | Pass structurally, unproven | Same |
| Delta updates | Pass structurally, unproven | Delta vs full push is not recorded in run details |

### Pricing
| Item | Verdict | Evidence |
|---|---|---|
| Push_PutPrices_RQ on update and daily | Pass | 1,134 exchanges, latest 2026-08-19 12:04, same 6-hourly + event path |
| Period changes in RU | Pass structurally, unproven | Not isolated in run log |
| Delta updates | Pass structurally, unproven | Not isolated in run log |

### Reservation processing
| Item | Verdict | Evidence |
|---|---|---|
| Pull_ListReservations_RQ every 30 min, correct period | Pass | 30-minute poll, 90-day back window plus 365-day forward lead window; 956 successful runs, latest 2026-08-19 12:00 |
| RLNM subscription in place | Pass | Handler URL subscribed daily (77 successes, latest 2026-08-19 01:02); LNM subscriptions listed and verified same day |
| Bookings retrieved and displayed | Pass, thin sample | Ingest shared by poll and webhook; only 7 channel bookings exist, none in the last 6 days |
| Modifications synced | Pass, stale | 3 successful modify-stay runs, latest 2026-08-13 |
| Cancellations synced | **Fail** | One cancel and one reject run on 2026-08-04 only, and the raw cancel/reject exchanges never appear in the API log at all |

### White label embed
| Item | Verdict | Evidence |
|---|---|---|
| WL embed in place and working | Pass | Embed host page loads RU's script from a real URL, tokens injected per property, ready/error handshake with 25s timeout and retry. No server-side load telemetry |

### Logging
| Item | Verdict | Evidence |
|---|---|---|
| API logs kept 30+ days | Pass | 90-day retention with a daily prune job |
| Full request + response + ResponseID stored | **Fail** | 33,210 rows: request XML 99.9%, response XML 75.8%, ResponseID 75.6%. ~24% of rows have no response captured |

Headline: 2 fails, 2 caveated passes, everything else passing; 9 items pass structurally but carry no per-change runtime evidence.

## Remediation items the document records (no code changes in this task)

1. Cancel and reject must log their RU exchange to the API log like every other endpoint, then be exercised on a live test reservation.
2. The ~24% of log rows with no response must be labelled with an explicit transport-failure reason instead of silent nulls.
3. Field-scoped detail for static, availability and price pushes (which fields changed, delta vs full) recorded in the run details so per-item certification evidence is queryable.
4. Weekly content refresh and static delta failure rates investigated before sign-off.

## Technical notes

Single new file, `docs/reference/ru-wl-certification-scorecard.md`: campaign header with the audit date and account scope, the seven scored sections above as tables, a verdict legend (Pass / Pass–unproven / Fail), the remediation list, and a short "how this was verified" note naming the evidence tables and the cron schedule caveat (schedules were read from the expected-jobs declaration and corroborated by run timestamps, not from a direct read of the scheduler table). No source or backend changes.
