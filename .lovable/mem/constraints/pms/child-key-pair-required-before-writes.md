---
name: Child key pair required before any child write
description: Step A cannot pass company profile or listing adoption on a login/password alone — the pasted AccessKey/SecretKey pair is the only credential that clears A.2 and unlocks A.3+
type: constraint
---

Dual auth: sub-account login/password proves the account exists; the AccessKey/SecretKey
pair issued in the channel portal is what signs writes.

- A verified login/password NEVER clears "Capture & verify account credentials". It reports
  `RU_MANUAL_KEYS_REQUIRED` and pauses for the manual paste.
- `ru_api_credentials.verified_at` means "the key pair is proven". The password probe must
  not stamp it.
- Company profile and listing adoption are hard-gated on a stored key pair and refuse
  locally (no channel call) when there is none.
- Step A order: ask email → Connect → adopt-or-create account → paste keys + verify →
  company profile → pull listings. One channel call per leg, no retry loops.
