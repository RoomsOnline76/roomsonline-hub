# Architecture Decisions

- Contract listing eligibility is database-owned: the latest applicable owner contract is authoritative, with legacy property contracts used only when no owner-level contract exists, so every public and activation path shares one rule.
- Public portfolio branding is entitlement-owned: an enabled portfolio white-label billing flag activates its stored palette without requiring a URL flag.- Sales rep (non-admin) is a scoped admin over its active referrals; scope comes from rep_property_ids so assignment changes take effect without extra rows.
