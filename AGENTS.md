# Architecture Decisions

- Contract listing eligibility is database-owned: the latest applicable owner contract is authoritative, with legacy property contracts used only when no owner-level contract exists, so every public and activation path shares one rule.