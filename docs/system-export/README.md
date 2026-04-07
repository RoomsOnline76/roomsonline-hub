# ROL System Architecture & UI Intelligence Export

## Purpose

This export provides a comprehensive, machine-readable representation of the RoomsOnline (ROL) application. It is designed for consumption by AI systems that need to understand, extend, or maintain the platform.

## Schema Version

```
version: 1.0.0
export_date: 2025-01-07
```

## File Manifest

| File | Purpose | Size |
|------|---------|------|
| `rol-system-manifest.json` | Main system export with architecture, rules, and UI structure | Core |
| `booking-flow-state-machine.json` | Detailed booking flow logic with state transitions | Critical |
| `pms-adapter-registry.json` | All PMS adapter specifications and capabilities | Integration |
| `data-authority-model.json` | Table authority boundaries and access rules | Security |

## Consumption Guidelines

### For AI Engineers

1. **Start with `rol-system-manifest.json`** - Contains system identity and hard rules
2. **Review `data-authority-model.json`** - Understand data access patterns before modifications
3. **Check `pms-adapter-registry.json`** - Before adding new PMS integrations
4. **Reference `booking-flow-state-machine.json`** - When modifying booking logic

### Cross-References

Files reference each other using explicit paths:
```json
{
  "reference": "pms-adapter-registry.json#/adapters/benson"
}
```

### Validation

All JSON files conform to strict schemas. To validate:
```bash
# Each file includes a $schema field for validation
```

## Critical Invariants

These rules must NEVER be violated:

1. **NO_BOOKING_FROM_CACHE** - Bookings require live PMS verification
2. **ADAPTER_CONTRACT_MANDATORY** - All adapters must conform to adapter-contract.ts
3. **SNAKE_CASE_ONLY** - All adapter response fields use snake_case
4. **PMS_IS_AUTHORITY** - External PMS is always source of truth

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2026-04-07 | Phase 1-6 refactor: booking-orchestrator-api, data-access-api, PMS Zod schemas, PropertyForm decomposition, route optimization, performance tuning, security hardening (itineraries RLS, storage policies) |
| 1.0.0 | 2025-01-07 | Initial comprehensive export |

## Ownership

- **System**: RoomsOnline (ROL)
- **Domain**: Multi-PMS booking orchestration
- **Repository**: rooms-online

---

*This export is auto-generated. Do not modify manually.*
