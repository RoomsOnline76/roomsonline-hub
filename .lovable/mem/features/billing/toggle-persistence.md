---
name: Billing toggle persistence
description: Billing switches persist in their own boolean columns, never inferred from fees; every save is read back and verified
type: feature
---
Billing add-on switches must have their own boolean column and be written on every save — never inferred from whether a fee/rate is non-zero (a switch on with a blank fee used to silently revert). `property_billing_configs` / `portfolio_billing_configs` carry `pms_enabled` and `commission_enabled` alongside the existing `channel_manager_enabled`, `white_label_allowed`, `branding_addon_enabled`, `pricelabs_allowed`, `payment_facilitator_enabled`. When reading a row, the stored boolean wins; the fee is only a fallback for legacy rows.

`useBillingConfig.upsert` reads the row back after writing and throws when a verified field did not land (numerics compared by value, not text). `BillingConfigTab` keeps the operator's unsaved choices on screen after a refused save and only runs Channel Manager entitlement fan-out once the write is proven.

`fearless_leader` has admin/dev parity on both billing tables.
