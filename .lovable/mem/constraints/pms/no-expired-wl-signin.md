---
name: Never boot the Channel Manager frame on an expired sign-in
description: ru-whitelabel-token must not serve an expired cached WL token pair; a provider refusal returns wl_signin_refused with its code
type: constraint
---

`ru-whitelabel-token` may only report `available: true` while the cached pair is inside its
validity window. The old unconditional stale fallback (`source: 'stale'`) handed an expired pair
to the embed, the vendor client booted on a dead sign-in and showed its own generic error dialog —
which reads as a ROL'OS fault and hides the real cause.

When the sub-user client exchange is refused (`sub_user_http_*`), return
`reason: 'wl_signin_refused'` with `diagnostic`, `owner_id`, `login_email`, `scope`. Owner copy says
the property is connected and sign-in for the distribution account has not been granted yet;
staff (admin/dev/fearless_leader) additionally see the diagnostic code and account login.

**Why:** Leopard Cottage (OwnerID 742640, `ru-two@polka.co.za`) is refused 403 by the provider while
the RentalsTest portfolio account signs in cleanly. Vendor naming stays out of owner copy.

Scope context: the frame is account-scoped. `ChannelScopeHeader` states which properties/listings the
open frame covers; completing the vendor wizard connects the account, and a property only counts as
connected once `ru_channel_id:<propertyId>` exists for it.
