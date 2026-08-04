---
name: RU MCQ Ordering
description: Rentals United Minimum Content Quality check — required LNM subscription, sub-user-only auth, and RU status 17 escalation
type: feature
---

# RU Minimum Content Quality check (`CM_LNM_OrderMinimumContentQualityCheck_RQ`)

Verified against RU on 2026-08-04 for Tidal Pools units (RU 5655615-5655618, sub-user OwnerID 741765).

## Prerequisite: LNM subscription

RU answers `Status 280 "Subscribe to LNM first"` until the ordering account holds an LNM
subscription (`Push_PutLiveNotificationMechanismSubscriptions_RQ`) that includes the
`PropertyMCQEligibilityCheck` change type. `order_mcq` self-heals this once: on 280 it
registers the subscription for the scoped account (observed owner = the sub-user OwnerID,
handler `<SUPABASE_URL>/functions/v1/ru-lnm-handler`), waits 2s and retries.

`LNM_PutHandlerUrl_RQ` (reservations / RLNM) is a **different** mechanism and does not
satisfy this prerequisite.

## Auth: sub-user only

MCQ must be ordered with the child (sub-user) AccessKey/SecretKey. Master
channel-manager keys return `Status 56 "Property does not exist."` because a white-label
sub-user's inventory is not in the master portfolio. Never add a master fallback;
`body.auth_scope: 'master'` exists only for manual diagnosis.

## Result delivery

The check result arrives asynchronously as a `PropertyMCQEligibilityCheck` LNM
notification. `ru-lnm-handler` closes out the newest matching `ru_mcq_orders` row
(`status` → `passed`/`failed`, notification detail merged into `response_preview`,
which is a **text** column holding JSON; `ru_property_id` is also text).

## Open RU-side fault

With the subscription confirmed by read-back, RU still answers
`Status 17 "Unexpected error, contact IT or try again"` for these units (retried after a
5s settle). This is surfaced as `RU_MCQ_INTERNAL_ERROR` with the RU `ResponseID`, which is
what RU support needs to trace it. Sample ResponseIDs: `db8b4854d9954803a2a632c870185ed3`,
`7822e4d4ba674f3cb5a6365abdbd80a3`. Do not treat 17 as a ROLOS payload bug.
