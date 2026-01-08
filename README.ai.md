# RoomsOnline (ROL) - AI & Developer Guide

> **Entry point for AI systems and developers working with RoomsOnline.**

## What This Is

RoomsOnline is a **PMS-agnostic booking orchestration platform** that:

- ✅ Unifies multiple Property Management Systems (PMS) under one booking interface
- ✅ Provides property owners with a single admin console regardless of their PMS
- ✅ Ensures guests can book any property through a consistent experience
- ✅ Synchronizes availability and rates from external PMS in real-time

## What This Is NOT

- ❌ **A PMS** - We integrate with PMS, we don't replace them
- ❌ **A channel manager** - We display PMS data, we don't distribute it
- ❌ **A payment processor** - We orchestrate bookings, payments go through PMS/gateways
- ❌ **The source of truth** - External PMS always controls availability and rates

---

## Core Architectural Principles

### 1. NO_BOOKING_FROM_CACHE
All booking decisions MUST verify with live PMS. Cache exists for display performance only.

### 2. PMS_AUTHORITY
External PMS is always authoritative for:
- Availability
- Rates
- Booking confirmations
- Inventory counts

### 3. ADAPTER_PATTERN
Each PMS has an isolated edge function adapter. Adding a new PMS requires:
- New adapter edge function
- Zero core UI changes

### 4. SNAKE_CASE
All database fields, API responses, and code variables use `snake_case` for consistency.

---

## System Domains

| Domain | Purpose | Access |
|--------|---------|--------|
| `book.sleepinafrica.roomsonline.co.za` | Public booking interface | Everyone |
| `sleepinafrica.roomsonline.co.za` | Admin console & owner portal | Authenticated users |

---

## Where Truth Lives

### Primary Sources (Trust)
- **Database Schemas**: Supabase table definitions
- **Adapter Contracts**: `/supabase/functions/*-api/` edge functions
- **Type Definitions**: `src/integrations/supabase/types.ts`
- **RLS Policies**: Database row-level security rules

### Reference Documentation
- `docs/system-export/rol-system-manifest.json` - Complete system architecture
- `docs/system-export/booking-flow-state-machine.json` - Booking transaction logic
- `docs/system-export/data-authority-model.json` - Data ownership rules
- `docs/system-export/pms-adapter-registry.json` - PMS integration status

### AI Context Files
- `public/llm-context.json` - System fundamentals for LLMs
- `public/llm-actions.md` - Safe modification guidelines

---

## Common Pitfalls to Avoid

| ❌ Don't | ✅ Do Instead |
|----------|---------------|
| Assume cache data is accurate for bookings | Always verify with live PMS before booking |
| Modify adapter contracts directly | Add new optional fields, maintain backward compatibility |
| Change `snake_case` to `camelCase` | Keep naming consistent across boundaries |
| Bypass RLS policies | Work within security constraints |
| Store API keys in code | Use Supabase secrets/environment variables |
| Skip sync logging | Always log to `sync_logs` table |

---

## Getting Started

### For AI/LLM Systems

1. Read `public/llm-context.json` for system fundamentals
2. Review `public/llm-actions.md` for safe/forbidden actions
3. Check existing adapters in `/supabase/functions/` for patterns
4. Validate all changes with Zod schemas

### For Developers

1. Review `docs/system-export/rol-system-manifest.json`
2. Understand the data authority model
3. Test changes with `test_mode=true` in adapter calls
4. Ensure RLS policies are included in migrations

---

## When Things Go Wrong

### Booking Failures
```
1. Check sync_logs table for recent errors
2. Verify PMS adapter health: /supabase/functions/{pms}-api?action=health
3. Review booking_sync_status for the specific booking
4. Check edge function logs
```

### Cache Staleness
```
1. Check fetched_at in pms_availability_cache
2. Trigger manual sync via adapter
3. Verify adapter connectivity
```

### Permission Errors
```
1. Check user_roles table
2. Review RLS policies on affected table
3. Verify auth context is present
```

### UI Data Mismatch
```
1. Confirm data authority (ROL vs PMS)
2. Check if viewing cached vs live data
3. Review browser network tab for API responses
```

---

## File Map

```
/public/
├── llm-context.json          # AI system context
├── llm-actions.md            # AI modification guide
├── robots.txt                # Crawler directives
├── sitemap.xml               # Search engine map
├── schema-org-site.jsonld    # Site structured data
├── schema-org-property-template.jsonld  # Property schema template
└── head-meta-template.html   # Meta tags template

/docs/system-export/
├── rol-system-manifest.json  # Complete system spec
├── booking-flow-state-machine.json
├── data-authority-model.json
└── pms-adapter-registry.json

/supabase/functions/
├── benson-api/               # Benson PMS adapter
├── nightsbridge-*            # NightsBridge adapters
├── checkfront-api/           # Checkfront adapter
└── ...                       # Other adapters
```

---

## PMS Integration Status

| PMS | Status | Capabilities |
|-----|--------|--------------|
| Benson | ✅ Full | Availability, Rates, Bookings, Room Types |
| NightsBridge | ✅ Full | Availability, Rates, Bookings, Reservations Sync |
| Checkfront | 🔄 Partial | Availability, Bookings |
| Cloudbeds | 📋 Planned | - |
| Little Hotelier | 📋 Planned | - |

---

## Key Contacts

For system issues, check:
1. `sync_logs` table for sync failures
2. `system_health_checks` table for component status
3. Edge function logs for detailed errors

---

**Remember:** This system's primary job is to safely orchestrate bookings while respecting PMS authority. When in doubt, verify with live PMS.

---

*Last updated: 2026-01-08*
*Version: 2026.01*
