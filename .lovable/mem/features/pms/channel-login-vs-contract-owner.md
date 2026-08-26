---
name: Channel login vs contracting owner
description: Distribution sub-account login lives on ru_owner_accounts.ru_login_email; properties.owner_email stays the contracting owner and is never rewritten by a channel rebind
type: feature
---

- `properties.owner_email` identifies the owner we **contract** with. Onboard eligibility matches signed/overridden contracts against it *and* any `property_owners.owner_email` linked to the property.
- The channel distribution login lives only on the account binding (`ru_owner_accounts.ru_login_email`, portfolio-scoped when the property is a portfolio member). `rebind_owner` writes there and must never update `properties.owner_email` — doing so revoked the property's contract standing and silently dropped it from the Onboard picker.
- Step A login cascade: operator-confirmed login → binding `ru_login_email` → property owner email → portfolio → siblings → profile → account on file.
- The Onboard picker must always say why an active property is excluded (no add-on, no contract for <email>, archived) instead of showing a blank list.
