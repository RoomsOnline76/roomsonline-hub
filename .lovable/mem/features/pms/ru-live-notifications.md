---
name: RU Live Notification Mechanism (LNM)
description: RU LNM vs RLNM subscription methods, per-account fan-out, handler contract and certification milestones
type: feature
---
Rentals United has TWO webhook systems, both registered PER ACCOUNT (master + each sub-user under its own AccessKey/SecretKey):

- **RLNM** — `LNM_PutHandlerUrl_RQ` → reservations. Handler: `ru-reservation-handler` (locked adapter region).
- **LNM** — `Push_PutLiveNotificationMechanismSubscriptions_RQ` → content/ARI changes. Handler: `ru-lnm-handler`.
  Read-back: `Pull_ListLiveNotificationMechanismSubscriptions_RQ`. Dictionary: `Pull_ListLiveNotificationMechanismChangeTypes_RQ`.

Rules:
- Put XSD element order is fixed: `ChangeTypes` → `ObservedOwners` → `UrlBase`.
- ChangeTypes we subscribe to (all of them): PropertyStaticDetails, PropertyChangeover, PropertyMinStay, PropertyAvailability, PropertyPrice, PropertyMCQEligibilityCheck.
- Notifications are HTTP GET with identifiers only (no values). Must answer HTTP 200 within 3 s; delivery is at-least-once; treat each as a signal to re-pull. Never rely on LNM alone — scheduled syncs stay.
- Subscriptions must be refreshed at least every 24 h → `cron-ru-rlnm-refresh` (daily, `ru-rlnm-daily`) fans out master + sub-users with per-METHOD sliding-minute pacing (61 s) and logs to `ru_sync_runs` under actions `PutHandlerUrl`, `PutLnmSubscriptions`, `ListLnmSubscriptions`, and `LNM_Notification` for inbound hits.
- Silent drift (RU keeps an old UrlBase/change types) is the real failure mode — always read back and diff (`_shared/ruLnm.ts` `diffLnmSubscriptions`).
- `put_lnm_subscriptions` is in `CERT_MASTER_FORBIDDEN_ACTIONS`: a sub-user step answering on master credentials is a failure.
- Admin UI: Rentals United → **Live notifications** tab (`RuLnmPanel.tsx`).
