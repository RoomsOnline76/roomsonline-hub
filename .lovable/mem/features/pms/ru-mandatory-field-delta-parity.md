---
name: RU Mandatory Field Delta Parity
description: Every mandatory RU wizard/readiness check must map to a tracked save-time delta path and a content fingerprint column
type: feature
---

Parity rule: a requirement that can block the RU wizard must also be a delta-tracked field.

- `src/lib/channelPushFields.ts` owns `FIELD_SPECS` (paths + operator labels for toasts) and
  `MANDATORY_CHECK_PATHS` — the audit table mapping every mandatory `_shared/ruReadiness` check key
  to the payload path(s) that satisfy it. A vitest coverage test fails if a mandatory check has no
  tracked path.
- `supabase/functions/_shared/ruStaticDelta.ts` fingerprints must include the columns behind those
  fields (`PROPERTY_STATIC_COLUMNS`, `UNIT_STATIC_COLUMNS`), otherwise an edit hashes identical and
  the push is skipped as "unchanged". Unit fingerprint includes `total_units` (Rooms-to-Sell),
  `currency`, `house_rules`, `raw_data` (per-unit floor/toilets), address city/country.
- When a new mandatory readiness check is added, add its path(s) to both places in the same change.
