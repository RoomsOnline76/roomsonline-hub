---
name: Channel distribution is on by default
description: ru_push_enabled defaults true; a paused listing must be an explicit, reasoned hold — never a silent default or side effect
type: constraint
---

A property is either distributed (has live channel listings and a passing connection) or it is not.
There is no silent "listed but paused" state.

- `properties.ru_push_enabled` defaults to `true`. Never create properties, clones or restores with
  it set to `false`.
- `false` means an **explicit hold** and must carry `ru_hold_reason` (+ `ru_hold_set_at`,
  `ru_hold_set_by`). The gate denies with code `RU_ON_HOLD` and a message naming the reason and date.
- Never write a hold as a side effect (unbind, reset, cleanup). Unbinding clears listing ids, so
  `RU_NOT_LISTED` already covers it. Archiving a listing is the one legitimate automatic hold and
  writes its reason.
- Deltas refused by a hold are **parked** (`static_delta_pending` / `ari_delta_pending`) and
  auto-delivered when the hold is lifted; lifting a hold triggers `property_readiness`, which resumes them.
- The old `auto_enable_ru_push` trigger was dropped — the default is the single rule.

**Why:** the flag was off by default and force-set off for clones, so property saves silently never
reached the channel and were logged as "not listed".
