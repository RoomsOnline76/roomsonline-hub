---
name: Step A linear sequence
description: Channel Step A order A.0–A.5, one roster read per run, submitted login is authoritative, no LNM work mid-onboarding
type: feature
---

Step A runs strictly linearly, one pass, no side loops:

- **A.0 resolve** — read the master roster ONCE per run (`Pull_ListMyUsers_RQ`, cached).
  Adopt an existing sub-account when the roster or our local `ru_owner_accounts` rows
  already know the login. Never spend a second roster read to answer "email already
  exists" — that read-storm is what got the account throttled. The only extra fresh read
  allowed is the paced OwnerID read-back immediately after a successful create.
- **A.1 create** — `Push_CreateUser_RQ` with the shared operator password. An
  operator-submitted login (`confirmed_owner_email`) is authoritative: if it is refused as
  taken and cannot be adopted, Step A stops and reports the conflict. Slug logins
  (`<slug>@roomsonline.co.za`) are generated ONLY when no email was submitted.
- **A.2 keys** — pause and ask the operator for the portal AccessKey/SecretKey.
- **A.3 verify** — prove the pair belongs to that sub-account's OwnerID.
- **A.4 company profile**, **A.5 pull listings** — then Step A ends and waits for Step B.

Live notification (LNM/RLNM) subscribe and read-back must never run inside Step A; the
nightly `ru-rlnm-daily` cron owns them.
