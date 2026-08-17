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
- **Master observes only its own OwnerID.** The channel-manager (master) account holds no inventory; every
  sub-user registers its own subscription under its own keys. Asking master to observe sub-user OwnerIDs is
  what RU answers with a bare "Unexpected error, contact IT". With no `RU_MASTER_OWNER_ID` set, master's LNM
  Put/read-back steps are SKIPPED as not applicable (never logged as failures) — only `PutHandlerUrl` runs.
- Only accounts with captured API keys (`ru_api_credentials` row, or legacy `ru_owner_accounts.ru_api_access_key`)
  are monitored. Unprovisioned OwnerIDs are excluded and reported as a setup gap, never a pipeline failure.
- Drift is judged against the owners RU **accepted** this run (`diffLnmSubscriptions` returns `extra_owners`);
  stale channel-side owners are informational only. Error codes: `RU_LNM_DRIFT`, `RU_LNM_OWNER_REJECTED`,
  `RU_LNM_OWNER_UNPROVISIONED`, `RU_LNM_PUT_FAILED`, `RU_LNM_READBACK_FAILED`.
- A multi-owner Put that fails is retried owner-by-owner so one refused OwnerID cannot unsubscribe the good ones.
