---
name: No undeclared ARI read-backs; LNM ARI notifications are ack-only
description: get_availability/get_prices need readback_purpose; live availability/price/min-stay/changeover notifications are acknowledged, never read back
type: constraint
---
`rentalsunited-api` refuses `get_availability` / `get_prices` unless the caller passes a
`readback_purpose` from the allowed set (`onboarding_verification`, `cert_probe`, `coverage_audit`,
`availability_repair`, `reservation_write_precheck`, `operator_request`).

**Why:** ROL'OS owns availability and pricing, so a routine channel read can only echo what we
published — undeclared reads quietly re-established a polling cadence and burned rate-limited slots.

**How to apply:**
- Live notifications of type `PropertyAvailability`, `PropertyPrice`, `PropertyMinStay`,
  `PropertyChangeover` are acknowledged only. `ru-lnm-handler` does not queue them and
  `cron-ru-lnm-repull` closes legacy ARI rows as `lnm_ari_acknowledged` (a success no-op).
- `PropertyStaticDetails` still queues a differential `Push_PutProperty_RQ` re-push (with
  15-minute self-echo suppression).
- Channel-side bookings arrive via the reservation notification handler and the 30-minute
  reservation poll — never via an availability read-back.
- Never "fix" a `READBACK_BLOCKED` failure by inventing a purpose for a cadence job; remove the read.
