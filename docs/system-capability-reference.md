# RoomsOnline (ROL) — System Capability Reference

> **Version:** 2026-03-25  
> **Purpose:** Comprehensive technical reference for developers to scope the system and plan new integrations/developments.  
> **Audience:** New developers, integration engineers, technical architects.

---

## Table of Contents

1. [System Identity & Purpose](#1-system-identity--purpose)
2. [Architecture Overview](#2-architecture-overview)
3. [Architectural Invariants (Hard Rules)](#3-architectural-invariants-hard-rules)
4. [Frontend Stack & Structure](#4-frontend-stack--structure)
5. [Backend Infrastructure](#5-backend-infrastructure)
6. [Database Schema Reference](#6-database-schema-reference)
7. [Edge Functions Registry](#7-edge-functions-registry)
8. [PMS Integration System](#8-pms-integration-system)
9. [Booking Flow](#9-booking-flow)
10. [Payment System](#10-payment-system)
11. [Billing & Commission System](#11-billing--commission-system)
12. [Authentication & Authorization](#12-authentication--authorization)
13. [AI & Content Generation](#13-ai--content-generation)
14. [System Health & Monitoring](#14-system-health--monitoring)
15. [API Versioning & Rate Limiting](#15-api-versioning--rate-limiting)
16. [Configuration Management](#16-configuration-management)
17. [Email & Notifications](#17-email--notifications)
18. [Storage & File Management](#18-storage--file-management)
19. [Audit & Compliance](#19-audit--compliance)
20. [Testing Infrastructure](#20-testing-infrastructure)
21. [Navigation Architecture](#21-navigation-architecture)
22. [Naming Conventions](#22-naming-conventions)
23. [Adding a New PMS Integration](#23-adding-a-new-pms-integration)
24. [Key File Locations](#24-key-file-locations)

---

## 1. System Identity & Purpose

**RoomsOnline (ROL)** is a **PMS-agnostic booking orchestration platform** that unifies multiple Property Management Systems under one interface.

### What ROL IS
- Multi-PMS booking engine orchestrating reservations across diverse PMS backends
- A caching and display layer for PMS data (availability, rates, room types)
- An editorial content management system for property listings
- A guest-facing booking portal and property showcase
- An admin console for property management and system configuration
- A global payment gateway orchestrator (17 providers, SA + international)
- A billing and commission management platform for property owners and sales reps

### What ROL IS NOT
- ❌ A Property Management System (PMS) — PMS is always authoritative
- ❌ A channel manager
- ❌ A payment processor (delegated to gateway providers)
- ❌ A review platform
- ❌ The source of truth for availability or rates (except for ROL-native properties)

> **Rate authoring (ROL-native / ROL'OS properties):** Calendar = seasons only (when).
> Rate Plans (`/pms/rate-plans`) = commercial rates and unit links (what it costs), and is
> the single configurator. Admin → Edit Property → Rates & Pricing is read-only for ROL'OS
> properties. See `docs/architecture/rate-plans-adapter-note.md`.


### Domains
| Zone | Domain Pattern |
|------|---------------|
| Admin Console | `sleepinafrica.roomsonline.co.za` |
| Public Booking | `book.sleepinafrica.roomsonline.co.za` |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│  React 18 + Vite + TypeScript + Tailwind + shadcn/ui           │
│  State: TanStack Query (server) + React Context (client)       │
│  Forms: React Hook Form + Zod                                   │
│  Routing: React Router DOM v6                                   │
├─────────────────────────────────────────────────────────────────┤
│                     SUPABASE (Lovable Cloud)                    │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │ Auth     │  │ PostgreSQL   │  │ Edge Functions (Deno)     │ │
│  │ (Email)  │  │ + RLS        │  │ PMS Adapters, Booking,    │ │
│  │          │  │ + Triggers   │  │ Payments, Email, AI,      │ │
│  │          │  │              │  │ Billing, Gateways         │ │
│  └──────────┘  └──────────────┘  └───────────────────────────┘ │
│  ┌──────────┐  ┌──────────────┐                                │
│  │ Storage  │  │ Realtime     │                                │
│  │ (Images) │  │ (Postgres    │                                │
│  │          │  │  Changes)    │                                │
│  └──────────┘  └──────────────┘                                │
├─────────────────────────────────────────────────────────────────┤
│                    EXTERNAL SYSTEMS                             │
│  PMS: Benson │ NightsBridge │ Checkfront │ Cloudbeds │         │
│       HotelBeds │ Hostfully │ Little Hotelier │ ProfitRoom │   │
│       Mews │ SiteMinder │ ROL'OS (native)                      │
│  Payments: PayFast │ PayGate │ Stripe │ PayPal │ Flutterwave │ │
│       Yoco │ Ozow │ DPO │ Peach │ iKhokha │ SnapScan │       │
│       Stitch │ Payflex │ Klarna │ Affirm │ Zapper │ AddPay    │
│  Other: Google Maps │ TripAdvisor │ Resend │ reCAPTCHA │ xAI  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow Pattern
1. **Pull Sync** (PMS → ROL): Edge functions fetch availability/rates/room types from PMS and cache locally
2. **Push Sync** (ROL → PMS): `push-booking` creates reservations in external PMS after live verification
3. **Cache Layer**: `pms_*_cache` tables store display-optimized copies; NEVER used for booking decisions

---

## 3. Architectural Invariants (Hard Rules)

These rules are **CRITICAL** and must **NEVER** be violated:

| Rule ID | Severity | Description |
|---------|----------|-------------|
| `NO_BOOKING_FROM_CACHE` | 🔴 CRITICAL | Bookings MUST verify live PMS availability before creation. Cache is display-only. |
| `CACHE_NEVER_AUTHORITATIVE` | 🔴 CRITICAL | Cache tables are read-optimization only. PMS is always source of truth. |
| `ADAPTER_CONTRACT_MANDATORY` | 🔴 CRITICAL | All PMS adapters must return responses conforming to `adapter-contract.ts`. |
| `RLS_MANDATORY` | 🔴 CRITICAL | All database tables must have Row Level Security enabled. |
| `NO_DIRECT_AUTH_TABLE_ACCESS` | 🔴 CRITICAL | Never query `auth.users` directly. Use `profiles` table. |
| `SNAKE_CASE_ONLY` | 🟡 HIGH | All adapter response fields must use `snake_case`. |
| `MULTI_ROOM_ORCHESTRATION` | 🟡 HIGH | Multi-room bookings must be atomic with proper rollback. |
| `SINGLE_NAV_SOURCE` | 🟡 HIGH | Desktop and mobile navigation MUST both consume `navigationConfig` from `navigation.ts`. |

---

## 4. Frontend Stack & Structure

### Technology
- **Framework:** React 18.3.1 + TypeScript
- **Build:** Vite
- **Styling:** Tailwind CSS + CSS custom properties (semantic tokens in `index.css`)
- **Components:** shadcn/ui (Radix primitives)
- **State:** TanStack Query v5 (server), React Context (client)
- **Forms:** React Hook Form + Zod validation
- **Routing:** React Router DOM v6
- **Animation:** Framer Motion
- **Rich Text:** TipTap editor

### Key Contexts
| Context | Purpose |
|---------|---------|
| `CurrencyContext` | Global currency selection and formatting |
| `SearchContext` | Property search state persistence |
| `AISearchContext` | AI-powered property search state |
| `HelpContext` | In-app help system with role-based sections |

### UI Zones & Route Protection

| Zone | Route Pattern | Protection | Roles |
|------|--------------|------------|-------|
| **Public Booking** | `/`, `/property/:id`, `/booking/:id` | None | Public |
| **Owner Portal** | `/dashboard`, `/calendar`, `/bookings` | `ProtectedRoute` | user, admin, dev |
| **Admin Console** | `/admin/*`, `/admin-users` | Admin check | admin, dev |
| **Dev Tools** | `/admin-keys`, `/insights`, `/dev/*` | `requireDev=true` | dev only |

### Full Route Registry (131 routes)

<details>
<summary>Click to expand route list</summary>

**Public Routes:**
- `/` — Home (property showcase, search)
- `/auth` — Login/signup
- `/property/:id` — Property showcase page
- `/property/:propertySlug/room/:roomSlug` — Room detail page
- `/property/:propertySlug/room/:roomSlug/availability` — Room availability view
- `/booking/:id` — Booking page
- `/booking-confirmation/:bookingId` — Booking confirmation
- `/about`, `/contact` — Information pages
- `/privacy-policy`, `/terms-of-service`, `/affiliate-disclosure` — Legal pages
- `/journals`, `/journals/:slug` — Public journal articles
- `/journey/*` — Multi-property booking journey (builder, review, checkout, confirmation)
- `/nb` — NightsBridge widget
- `/connect` — Connect landing page
- `/pms`, `/pms-comparison`, `/compare-property-management-systems` — PMS comparison pages
- `/how-our-booking-engine-works` — Product explainer
- `/book` — Public booking page
- `/embed/property/:slug`, `/embed/portfolio/:portfolioSlug` — Embeddable widgets
- `/onboarding/:token` — Property onboarding
- `/contract/sign/:token` — Contract e-signature
- `/staff-login`, `/staff-login/:propertySlug` — Staff login portal
- `/docs/api` — API documentation (Swagger UI)

**Owner Portal (authenticated):**
- `/dashboard` — Owner dashboard with booking overview
- `/dashboard/reports` — ROL Pulse analytics
- `/dashboard/insights` — Business intelligence
- `/dashboard/property/:id/progress` — Property progress tracker
- `/calendar` — Booking calendar (+ accommodation, conference, event variants)
- `/bookings` — Reservation management
- `/pulse` — Revenue pulse

**Admin Console (admin+):**
- `/admin/property-overview` — Property overview grid
- `/admin/all-properties` — Full property list
- `/admin/properties/new` — Create property (with onboarding wizard)
- `/admin/properties/:id` — Property detail/edit
- `/admin/all-bookings` — All bookings view
- `/admin/journals`, `/admin/journals/:id` — Journal CMS
- `/admin/access-requests` — Access request queue
- `/admin-users` — User management + PMS credentials
- `/admin/contracts` — Contract management
- `/admin/contract-editor/:templateId` — Contract template editor
- `/admin/payments` — Commission & payment tracking
- `/admin/help-articles`, `/admin/help-articles/:id` — Help article CMS
- `/admin/audit` — Audit log viewer
- `/admin/review-queue` — Editorial review queue
- `/admin/onboarding` — Onboarding wizard builder
- `/admin/wizard-editor/:wizardId` — Wizard step editor
- `/admin/billing-defaults` — Global billing defaults
- `/admin/sales-reps` — Sales rep management
- `/admin/commission-reports` — Commission reports
- `/admin/integrations` — Integration management
- `/admin/portfolios` — Portfolio management
- `/admin/promotion` — Promotional tools
- `/admin/supporting-systems` — External systems registry
- `/admin/system` — System settings
- `/admin/system-health` — System health dashboard
- `/admin/system/api-configurator` — API rate limits & config

**Dev Tools (dev only):**
- `/admin-keys` — PMS API key management + integration tracker
- `/admin/api-keys` — API key management
- `/dev/overview` — Developer overview
- `/dev/pms` — PMS control dashboard
- `/dev/testing` — Test runner
- `/dev/tasks` — Dev task tracker
- `/dev/logs` — System logs viewer
- `/dev/features` — Feature flags
- `/dev/danger` — Danger zone utilities
- `/dev/system-health` — Dev system health view
- `/admin/benson-config` — Benson PMS configuration
- `/admin/test-booking-benson` — Benson test booking
- `/admin/pms-config/:systemType` — Per-PMS configuration

**ROL'OS PMS Routes (nested under admin/properties/:id):**
- `room-types`, `rooms`, `rate-plans`, `revenue`
- `calendar`, `guests`, `groups`, `events`
- `housekeeping`, `messaging`, `night-audit`
- `channels`, `reports`, `staff`, `integrations`

</details>

### Navigation Architecture

Both desktop sidebar (`AppSidebar.tsx`) and mobile menu consume `navigationConfig` from `src/config/navigation.ts` as a single source of truth. Adding a route to `navigation.ts` automatically surfaces it in both menus.

---

## 5. Backend Infrastructure

### Database
- **Type:** PostgreSQL 15.x (via Supabase)
- **Tables:** 149 tables in public schema
- **Security:** Row Level Security (RLS) on all tables
- **Encryption:** PGP symmetric encryption for guest PII (`pgcrypto` extension)
- **Views:** `bookings_decrypted`, `public_properties`, `public_nightsbridge_config`, `dw_*` (data warehouse)
- **Triggers:** Audit logging, slug generation, encryption, booking validation, health aggregation, billing calculation
- **Enums:** 45 custom enums

### Edge Functions (Deno Runtime)
- **103 edge functions** deployed automatically via Lovable (+ `_shared/` utilities)
- Auto-deployed on code push — no manual deployment needed
- Shared utilities in `supabase/functions/_shared/`
- All support both `camelCase` and `snake_case` input parameters

### Storage Buckets

| Bucket | Public | Purpose |
|--------|--------|---------|
| `property-images` | ✅ | Property and room photos |
| `addon-images` | ✅ | Add-on/extra images |
| `package-images` | ✅ | Package deal images |
| `template-images` | ✅ | Template assets |
| `hero-videos` | ✅ | Hero section videos |
| `documents` | ✅ | General documents |
| `contracts` | ❌ | Signed contract PDFs |
| `signatures` | ❌ | Signature images |
| `property-documents` | ❌ | Private property docs |

---

## 6. Database Schema Reference

### Core Tables (149 tables)

#### Property Management
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `properties` | Central property record | `id`, `name`, `external_system`, `owner_email`, `is_active`, `show_on_website`, `slug`, `payment_providers` (text[]) |
| `property_availability` | Manual/synced availability blocks | `property_id`, `room_type`, `date`, `available_units`, `is_stop_sell` |
| `property_rates` | Rate definitions | `property_id`, `room_type_id`, `rate_type_id`, `amount` |
| `property_charges` | Additional charges (levies, fees) | `property_id`, `charge_name`, `amount`, `calculation_method` |
| `property_activation_logs` | Activation audit trail | `property_id`, `quality_gate_results` |
| `property_owners` | Property-owner link table | `property_id`, `user_id` |
| `property_staff` | Staff linked to properties | `property_id`, `user_id`, `role` |
| `property_checklist` | Pre-activation checklists | `property_id`, `items` |
| `property_bank_details` | Banking information | `property_id`, `bank_name`, `account_number` |
| `property_commercial_terms` | Commercial terms per property | `property_id`, `terms` |
| `property_contracts` | Property-level contracts | `property_id`, `contract_id` |
| `property_onboarding_roadmap` | Onboarding progress | `property_id`, `milestones` |
| `property_onboarding_tokens` | Onboarding access tokens | `property_id`, `token` |
| `property_portfolios` | Portfolio definitions | `id`, `name`, `slug` |
| `property_portfolio_members` | Portfolio membership | `portfolio_id`, `property_id` |
| `local_experiences` | Nearby experiences/attractions | `property_id`, `title`, `category` |

#### PMS Cache & Sync
| Table | Purpose | Staleness |
|-------|---------|-----------|
| `pms_availability_cache` | Cached PMS availability | 60 min (configurable) |
| `pms_room_types_cache` | Cached room type definitions | 24 hours |
| `pms_rate_types_cache` | Cached rate type definitions | 24 hours |
| `pms_reservations` | Synced PMS reservations | On-demand sync |
| `pms_credentials` | PMS connection credentials | — |
| `pms_tracker_status` | Integration milestone tracking (11 flags) | — |
| `pms_mappings` | External ↔ internal ID mappings | — |
| `pms_dev_notes_log` | Developer notes per PMS | — |
| `sync_logs` | All sync operation audit trail | — |

#### Booking System
| Table | Purpose |
|-------|---------|
| `bookings` | Central booking record with encrypted guest PII |
| `booking_sync_status` | PMS sync state per booking |
| `payment_transactions` | Payment records (all gateways) |
| `payment_gateway_registry` | Registered payment gateways with capabilities |
| `itineraries` | Multi-property trip itineraries |
| `itinerary_bookings` | Links bookings to itinerary stays |
| `nightsbridge_booking_sessions` | NightsBridge conversion tracking |

#### Billing & Commission
| Table | Purpose |
|-------|---------|
| `billing_global_defaults` | System-wide billing defaults (strategy, rates, fees) |
| `billing_mappings` | Billing strategy field mappings |
| `billing_transactions` | Billing transaction records |
| `property_billing_configs` | Per-property billing overrides |
| `property_referrals` | Property referral tracking |
| `sales_reps` | Sales representative profiles |
| `rep_commission_entries` | Individual commission entries per booking |
| `rep_commission_reports` | Monthly commission report aggregations |
| `owner_invoices` | Owner-facing invoices |
| `rol_revenue_ledger` | ROL revenue ledger |
| `rol_bank_export_batches` | Bank export batch tracking |
| `rol_bank_export_lines` | Individual bank export lines |
| `rol_financial_signoffs` | Financial signoff records |

#### User & Auth
| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (auto-created on signup) |
| `user_roles` | Role assignments (`app_role` enum) |
| `access_requests` | Self-service access request queue |
| `owner_pms_credentials` | Owner-level PMS account credentials |

#### Content & Editorial
| Table | Purpose |
|-------|---------|
| `journals` | Blog/journal articles with slugs |
| `help_articles` | In-app help documentation |
| `help_search_logs` | Help search analytics |
| `user_help_views` | Help article view tracking |
| `book_page_images` | Homepage booking page imagery |

#### Contracts & Legal
| Table | Purpose |
|-------|---------|
| `owner_contracts` | Owner-level contracts with e-signature |
| `contract_templates` | Template definitions |
| `contract_template_versions` | Immutable template versions |

#### ROL'OS Native PMS Tables (40+)
| Table | Purpose |
|-------|---------|
| `rolos_rooms` | Physical room inventory |
| `rolos_room_types` | Room type definitions |
| `rolos_reservations` | Native PMS reservations |
| `rolos_reservation_rooms` | Room assignments per reservation |
| `rolos_reservation_status_history` | Status change audit trail |
| `rolos_guest_profiles` | Guest profile database |
| `rolos_guest_comments` | Guest notes/comments |
| `rolos_folios` | Financial folios |
| `rolos_folio_transactions` | Folio line items |
| `rolos_payments` | Payment records |
| `rolos_payment_allocations` | Payment-to-folio allocations |
| `rolos_refunds` | Refund records |
| `rolos_invoices` | Invoice generation |
| `rolos_rate_plans` | Rate plan definitions |
| `rolos_rate_plan_room_types` | Rate plan ↔ room type links |
| `rolos_rate_prices` | Rate pricing entries |
| `rolos_rate_seasons` | Seasonal rate definitions |
| `rolos_pricing_rules` | Dynamic pricing rules |
| `rolos_yield_rules` | Yield management rules |
| `rolos_inventory_calendar` | Daily inventory calendar |
| `rolos_deposit_schedules` | Deposit schedule definitions |
| `rolos_housekeeping_tasks` | Housekeeping task tracking |
| `rolos_housekeeping_schedules` | Housekeeping schedules |
| `rolos_maintenance_requests` | Maintenance request tracking |
| `rolos_event_spaces` | Event venue definitions |
| `rolos_events` | Event records |
| `rolos_event_reservations` | Event-linked reservations |
| `rolos_groups` | Group booking definitions |
| `rolos_group_reservations` | Group ↔ reservation links |
| `rolos_group_room_blocks` | Room block allocations |
| `rolos_waitlist` | Waitlist management |
| `rolos_channel_connections` | Channel manager connections |
| `rolos_channel_room_mapping` | Channel ↔ room type mappings |
| `rolos_channel_rate_mapping` | Channel ↔ rate mappings |
| `rolos_channel_reservations` | Channel-sourced reservations |
| `rolos_channel_sync_log` | Channel sync audit trail |
| `rolos_channel_api_config` | Channel API configurations |
| `rolos_message_templates` | Message templates |
| `rolos_message_queue` | Outbound message queue |
| `rolos_message_log` | Message delivery log |
| `rolos_night_audit_log` | Night audit records |
| `rolos_daily_metrics` | Daily operational metrics |
| `rolos_booking_charges` | Booking-level charges |
| `rolos_booking_rooms` | Booking room assignments |
| `rolos_staff_shifts` | Staff shift management |
| `rolos_staff_activity_log` | Staff activity audit |
| `rolos_brand_config` | Multi-brand configuration |
| `rolos_tax_rules` | Tax rule definitions |
| `rolos_ui_configs` | UI customization per property |
| `rolos_webhook_subscriptions` | Webhook endpoint registrations |
| `rolos_webhook_logs` | Webhook delivery logs |

#### API & Integration
| Table | Purpose |
|-------|---------|
| `api_keys` | System API key storage |
| `api_rate_limits` | Per-property API rate limit configuration |
| `api_request_log` | API request audit trail |
| `integration_configs` | Integration credentials per property |
| `integration_logs` | Integration event logs |
| `checkfront_connections` | Checkfront OAuth connection details |
| `hostfully_room_types` | Hostfully room type cache |
| `hostfully_unit_map` | Hostfully unit ↔ room type mapping |

#### Data Warehouse Views
| View | Purpose |
|------|---------|
| `dw_portfolio_kpis` | Portfolio-level KPI aggregation |
| `dw_booking_pipeline` | Booking pipeline analysis |
| `dw_channel_performance` | Channel performance metrics |
| `dw_daily_revenue` | Daily revenue breakdown |
| `dw_guest_ltv` | Guest lifetime value |
| `dw_monthly_occupancy` | Monthly occupancy rates |

#### System & Operations
| Table | Purpose |
|-------|---------|
| `audit_logs` | Comprehensive change audit trail |
| `system_health_components` | Health check component registry |
| `system_health_checks` | Individual health check results |
| `system_health_aggregates` | Hourly health statistics |
| `system_alerts` | Active system alerts |
| `supporting_systems` | External tool/service registry |
| `financial_metrics` | Cash position and runway tracking |
| `invoices` | Vendor invoice tracking |
| `dev_tasks` | Developer task tracking |
| `survey_responses` | Survey response storage |
| `connect_inquiries` | Connect page inquiry submissions |

#### Configuration
| Table | Purpose |
|-------|---------|
| `field_registry` | Property form field definitions |
| `onboarding_wizards` | Wizard definitions |
| `onboarding_steps` | Wizard step definitions |
| `onboarding_fields` | Wizard field definitions |
| `charge_presets` | Predefined charge templates |
| `navigation_tag_categories` | Property tag taxonomy |
| `brochure_templates` | PDF brochure templates |
| `meal_type_suggestions` | Meal type autocomplete suggestions |
| `experience_vouchers` | Experience voucher codes |
| `ai_search_logs` | AI search query logging |
| `wizard_audit_log` | Wizard configuration changes |

### Key Database Enums (45)
```sql
app_role:              admin | user | dev | fearless_leader
audit_action_type:     create | update | delete | permission_change | sync | export | login | other
audit_request_origin:  admin_ui | edge_function | api | cron | db_trigger
audit_user_role:       admin | dev | owner | system
billing_strategy:      default | widget | rolos_pms | portfolio_aggregator | enterprise_white_label | volume_tiered | payment_facilitator
channel_name:          booking_com | airbnb | expedia | agoda | google_hotels | manual
commission_tier:       base | accelerated | elite
commission_entry_status: pending | approved | paid | clawed_back
commission_report_status: draft | pending_approval | approved | paid
component_type:        pms | internal | external | infrastructure
event_status:          inquiry | tentative | confirmed | in_progress | completed | cancelled
group_booking_status:  inquiry | tentative | confirmed | cancelled
health_status:         healthy | degraded | failed | unknown
invoice_status:        draft | issued | paid | overdue | cancelled
lead_source:           cold_call | referral | event | inbound | partner | social_media | existing_client | other
payment_method:        cash | card | bank_transfer | online | voucher | other
payment_status:        pending | completed | failed | refunded | partially_refunded
pms_integration_status: coming_soon | in_development | parked | in_testing | deployed
pms_staff_role:        property_owner | general_manager | front_desk | housekeeping | maintenance | accountant | auditor
pricing_rule_type:     occupancy_based | lead_time | day_of_week | seasonal | demand | manual_override
referral_status:       pending | qualified | converted | churned
refund_status:         pending | approved | processed | rejected
rolos_reservation_status: pending | confirmed | checked_in | checked_out | cancelled | no_show
shift_type:            morning | afternoon | night | full_day | custom
waitlist_status:       waiting | notified | booked | expired | cancelled
```

### Key Database Functions
| Function | Purpose | Security |
|----------|---------|----------|
| `has_role(user_id, role)` | Check user role (used in RLS) | SECURITY DEFINER |
| `is_property_owner(property_id, user_id)` | Check property ownership | SECURITY DEFINER |
| `is_linked_owner(property_id, user_id)` | Check linked ownership | SECURITY DEFINER |
| `encrypt_sensitive_text(text)` | PGP encrypt guest PII | SECURITY DEFINER |
| `decrypt_sensitive_text(bytea)` | Decrypt (admin/dev only) | SECURITY DEFINER |
| `log_audit_change()` | Trigger: comprehensive audit logging | SECURITY DEFINER |
| `log_booking_modification()` | Trigger: booking change history | SECURITY DEFINER |
| `can_confirm_booking()` | Trigger: validates booking confirmation | SECURITY DEFINER |
| `enforce_contract_before_activation()` | Trigger: requires signed contract | SECURITY DEFINER |
| `generate_property_slug(name, id)` | Auto-generate URL slugs | — |
| `update_health_aggregates()` | Trigger: aggregate health stats | SECURITY DEFINER |

### Key Views
| View | Purpose |
|------|---------|
| `bookings_decrypted` | Bookings with decrypted guest PII (admin/dev only) |
| `public_properties` | Filtered properties for public display |
| `public_nightsbridge_config` | Public NightsBridge agent codes |
| `dw_portfolio_kpis` | Portfolio KPI aggregation |
| `dw_booking_pipeline` | Booking pipeline view |
| `dw_channel_performance` | Channel performance view |
| `dw_daily_revenue` | Daily revenue view |
| `dw_guest_ltv` | Guest lifetime value view |
| `dw_monthly_occupancy` | Monthly occupancy view |

---

## 7. Edge Functions Registry

### PMS Adapters (9)
| Function | PMS | Status | Key Actions |
|----------|-----|--------|-------------|
| `benson-api` | Benson | Deployed | health, availability, rooms, rates, reservations, create_booking |
| `checkfront-api` | Checkfront | Ready | health, availability, rooms, rates |
| `cloudbeds-api` | Cloudbeds | In Dev | health, availability, rooms, rates |
| `hostfully-api` | Hostfully | Deployed | health, availability, rooms, rates, editorial |
| `hotelbeds-api` | HotelBeds | Ready | health, availability, rooms, create_booking, cancel |
| `little-hotelier-api` | Little Hotelier | Hidden | health, availability, rooms, rates |
| `nightsbridge-reservations-sync` | NightsBridge | Deployed | reservation sync only (widget booking) |
| `rentalsunited-api` | Rentals United | Hidden | — |
| `roomsonline-pms-api` | ROL'OS (Internal) | In Dev | full CRUD: availability, rates, rooms, bookings, modify, cancel |

### Booking & Payment (7)
| Function | Purpose |
|----------|---------|
| `push-booking` | **CRITICAL**: Booking creation orchestrator with live PMS verification |
| `multi-push-booking` | Multi-property itinerary booking |
| `modify-booking` | Booking modification with availability re-check |
| `cancel-booking` | Booking cancellation with PMS sync |
| `validate-itinerary-availability` | Pre-booking availability validation |
| `pms-financial` | Unified payment gateway bridge (routes to any registered gateway) |
| `booking-portfolio-api` | Portfolio booking management |

### Payment Gateways (17)
| Function | Type | Region | Status |
|----------|------|--------|--------|
| `payfast-api` | Onsite modal + ITN | 🇿🇦 SA | Active |
| `paygate-api` | Redirect + MD5 | 🇿🇦 SA | Active |
| `stripe-gateway` | Checkout Sessions | 🌍 International | Active |
| `paypal-gateway` | Orders API v2 | 🌍 International | Active |
| `flutterwave-gateway` | Standard API | 🌍 International | Active |
| `yoco-gateway` | Inline JS SDK | 🇿🇦 SA | Active |
| `ozow-gateway` | Instant EFT | 🇿🇦 SA | Active |
| `dpo-gateway` | Redirect | 🌍 Africa | Active |
| `peach-gateway` | Server-to-server | 🇿🇦 SA | Active |
| `ikhokha-gateway` | mPOS / Online | 🇿🇦 SA | Active |
| `snapscan-gateway` | QR Code | 🇿🇦 SA | Active |
| `stitch-gateway` | Open Banking | 🇿🇦 SA | Active |
| `payflex-gateway` | BNPL | 🇿🇦 SA | Active |
| `klarna-gateway` | BNPL | 🌍 International | Active |
| `affirm-gateway` | BNPL | 🌍 International | Active |
| `zapper-gateway` | QR Code | 🇿🇦 SA | Active |
| `addpay-gateway` | Redirect | 🇿🇦 SA | Active |

### Sync & Data (8)
| Function | Purpose |
|----------|---------|
| `sync-rates-availability` | Pull rates/availability from PMS to cache |
| `sync-editorial` | Pull editorial/property data from PMS |
| `sync-rolos-room-types` | Sync ROL'OS room types |
| `hydrate-pms-cache-to-rolos` | Hydrate PMS cache to ROL'OS tables |
| `pms-channel-sync` | Channel manager sync operations |
| `calculate-commission` | Commission calculation engine |
| `calculate-rep-commissions` | Sales rep commission calculation |
| `calculate-billing` | Billing calculation engine |

### AI & Content (10)
| Function | Purpose | AI Backend |
|----------|---------|------------|
| `ai-booking-concierge` | Conversational booking assistant | Lovable AI |
| `ai-property-search` | Natural language property search | Lovable AI |
| `ai-website-sync` | AI website content sync | Lovable AI |
| `editorial-ai-assist` | AI property description generation | Lovable AI |
| `bulk-editorial-generate` | Batch AI content generation | Lovable AI |
| `parse-special-requests` | AI parsing of guest special requests | Lovable AI |
| `smart-room-parser` | AI room type parsing/mapping | Lovable AI |
| `revenue-pulse-insights` | AI revenue & conversion insights | **xAI (Grok)** |
| `dashboard-insights` | AI dashboard Q&A & analysis | **xAI (Grok)** |
| `connect-assistant` | AI sales assistant for prospects | Lovable AI |
| `help-assistant` | AI help assistant (generic + PMS modes) | Lovable AI |

### Email & Notifications (13)
| Function | Purpose |
|----------|---------|
| `send-booking-email` | Booking confirmation to guest |
| `send-contact-email` | Contact form submissions |
| `send-contract` / `send-owner-contract` | Contract delivery |
| `send-onboarding-email` | Owner onboarding emails |
| `send-access-request` | Access request notifications |
| `send-activation-notification` | Property activation alerts |
| `send-pms-status-report` | PMS status email reports |
| `send-itinerary-email` | Itinerary confirmations |
| `send-survey-report` | Survey results |
| `send-invoice` | Invoice delivery |
| `send-task-report` | Dev task reports |
| `email-contract-copy` | Contract copy delivery |

### Auth & User (4)
| Function | Purpose |
|----------|---------|
| `create-user` | Admin user creation with role |
| `forgot-password` | Password reset trigger |
| `reset-user-password` | Admin password reset |
| `add-pms-credential` | Add owner PMS credentials |

### Revenue & Analytics (3)
| Function | Purpose |
|----------|---------|
| `revenue-pulse-api` | Revenue analytics API |
| `booking-portfolio-api` | Portfolio booking analytics |
| `generate-monthly-invoices` | Monthly invoice generation |

### System & Monitoring (8)
| Function | Purpose |
|----------|---------|
| `system-health-check` | Automated health checks (cron) |
| `daily-health-report` | Daily status email report |
| `monitor-anomalies` | Anomaly detection |
| `check-activation-readiness` | Property activation gate |
| `post-launch-validator` | Post-activation validation |
| `log-audit-event` | Programmatic audit entry |
| `fetch-audit-logs` | Audit log retrieval |
| `pms-night-audit` | Night audit processing |

### ROL'OS PMS Functions (5)
| Function | Purpose |
|----------|---------|
| `manage-property-staff` | Staff management for properties |
| `pms-message-dispatcher` | Guest messaging dispatch |
| `rolos-webhook-receiver` | Inbound webhook handler |
| `booking-widget-api` | Embeddable booking widget API |
| `track-embed-interaction` | Widget interaction analytics |

### Utility (11)
| Function | Purpose |
|----------|---------|
| `geocode-property` | Address → coordinates |
| `get-contract-by-token` | Public contract access |
| `process-signature` | E-signature processing |
| `generate-itinerary-pdf` | PDF brochure generation |
| `generate-checklist` | Property checklist generator |
| `generate-integration-assets` | Integration asset generation |
| `get-feature-flags` | Feature flag retrieval |
| `tripadvisor-api` | TripAdvisor review fetch |
| `analyze-reviews` | Review analysis |
| `bank-export-api` | Bank export file generation |
| `wordpress-plugin-api` / `wordpress-plugin-update` | WordPress plugin API + updates |

### Testing (5)
| Function | Purpose |
|----------|---------|
| `execute-test-run` | Run test scenarios |
| `generate-test-scenarios` | AI test scenario generation |
| `review-property` | AI property review analysis |
| `validate-images-against-data` | Image-data consistency check |
| `enrich-property-experiences` | AI local experience enrichment |

---

## 8. PMS Integration System

### Supported Systems (13 visible)

| System | Key | Status | Type | Modify | Cancel | Notes |
|--------|-----|--------|------|--------|--------|-------|
| **Benson** | `benson` | Deployed | Full API | ❌ | ❌ | Primary PMS. API lacks modify/cancel. |
| **NightsBridge** | `nightsbridge` | Deployed | Widget | ❌ | ❌ | Widget-only, no API access |
| **Hostfully** | `hostfully` | Deployed | Full API | ❌ | ❌ | Read-only integration |
| **Checkfront** | `checkfront` | Ready | OAuth API | ❌ | ❌ | Token refresh required |
| **HotelBeds** | `hotelbeds` | Ready | REST API | ❌ | ✅ | Distribution platform, sandbox read-only |
| **Cloudbeds** | `cloudbeds` | In Dev | REST API | ❌ | ❌ | Good API coverage |
| **ProfitRoom** | `profitroom` | In Dev | REST API | — | — | Hotel CRS platform |
| **ROL'OS** | `roomsonline` | In Dev | Internal | ✅ | ✅ | Native PMS for ROL-managed properties |
| **Mews** | `mews` | Planned | — | — | — | — |
| **RoomKey** | `roomkey` | Planned | — | — | — | — |
| **RoomRaccoon** | `roomracoon` | Planned | — | — | — | — |
| **Semper** | `semper` | Planned | — | — | — | — |
| **SiteMinder** | `siteminder` | Planned | — | — | — | — |

**Hidden (deprecated):** Guesty, Little Hotelier, Rentals United

### Integration Milestone Tracking (11 flags per system)

| # | Shorthand | Flag Column | Description |
|---|-----------|-------------|-------------|
| 1 | Ac | `has_account` | Account created |
| 2 | Do | `has_docs` | Documentation reviewed |
| 3 | Ax | `has_access` | API access granted |
| 4 | He | `has_health` | Health check implemented |
| 5 | Gt | `has_get` | GET availability working |
| 6 | Ef | `has_edge` | Edge function deployed |
| 7 | Ps | `has_post` | POST booking working |
| 8 | Mo | `has_modify` | Modify booking working |
| 9 | Ca | `has_cancel` | Cancel booking working |
| 10 | Te | `has_soft_test` | Soft testing complete |
| 11 | Ce | `is_certified` | Certified for production |

### Adapter Contract

All PMS adapters MUST return this response shape:
```typescript
interface AdapterResponse<T> {
  success: boolean;
  data: T | null;
  error: AdapterError | null;
  source: PmsSource;       // e.g. "benson", "hostfully"
  fetched_at: string;      // ISO8601 timestamp
  action: string;          // e.g. "fetch_availability"
}

interface AdapterError {
  code: string;            // From ERROR_CODES enum
  message: string;
  details?: unknown;
}
```

### Standard Error Codes
| Code | HTTP | Description |
|------|------|-------------|
| `INVALID_REQUEST` | 400 | Request validation failed |
| `AUTH_FAILED` | 401 | PMS authentication failed |
| `ACCESS_DENIED` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found in PMS |
| `AVAILABILITY_CHANGED` | 409 | Availability changed during booking |
| `BOOKING_REJECTED` | 422 | PMS rejected booking |
| `MODIFICATION_NOT_SUPPORTED` | 501 | PMS doesn't support modify |
| `CANCELLATION_NOT_SUPPORTED` | 501 | PMS doesn't support cancel |
| `INTERNAL_ADAPTER_ERROR` | 500 | Unexpected adapter error |
| `PMS_UNAVAILABLE` | 503 | PMS API unreachable |

### PMS Data Authority Model
```
PMS Controls (authoritative):     ROL Controls (authoritative):
├── availability                  ├── property_display_data
├── rates                         ├── editorial_content
├── booking_confirmation          ├── user_interface
├── inventory_counts              ├── booking_collection_form
├── room_type_definitions         ├── cache_management
├── rate_type_definitions         ├── user_accounts
└── reservation_status            ├── navigation_tags
                                  └── property_images
```

---

## 9. Booking Flow

### Flow: Guest → Booking → PMS

```
1. Guest selects dates/rooms on PropertyShowcase
2. System checks cached availability (display only)
3. Guest fills booking form → creates itinerary
4. Guest selects payment method (if multiple gateways enabled)
5. Payment initiated via selected gateway
6. Payment success triggers push-booking edge function
7. push-booking performs:
   a. LIVE availability verification with PMS (RULE #1)
   b. If available: creates reservation in PMS
   c. If unavailable: returns AVAILABILITY_CHANGED error
   d. Updates bookings table + booking_sync_status
   e. Blocks dates in property_availability (stop-sell)
   f. Sends confirmation email
   g. Calculates commission if applicable
8. Guest receives booking confirmation
```

### Payment-First Logic
- Payment success is the prerequisite for PMS stop-sell
- Payment → PMS verification → PMS booking → local confirmation

### Multi-Room Bookings
- Rooms grouped by date range
- Processed as atomic operations
- Partial failure tracked per-room in `booking_sync_status`

### Modification & Cancellation
- `modify-booking` edge function: validates PMS capability, re-verifies availability for date changes
- `cancel-booking` edge function: syncs cancellation to PMS
- `log_booking_modification` trigger maintains immutable history in `modification_notes` JSONB
- Benson: modify hidden, cancel is local-only with warning

### Manual PMS Mode (ROL-native)
- Properties with `external_system: 'none'` use ROL'OS
- Booking confirmation auto-blocks dates via `property_availability` upsert
- Uses 4-column unique index: `(property_id, room_type, date, external_system)`

---

## 10. Payment System

### Multi-Gateway Architecture

Properties can enable **multiple payment gateways** simultaneously via `properties.payment_providers` (text array). At checkout, if more than one gateway is active, guests see a `PaymentMethodSelector` to choose their preferred payment method.

### Gateway Resolution Chain
```
1. property.payment_providers[] (multi-gateway array)
2. property.payment_provider (legacy single column, fallback)
3. Global system default ("payfast")
```

### Payment Providers (17)

#### South African 🇿🇦
| Provider | Status | Type | Edge Function |
|----------|--------|------|---------------|
| PayFast | Active | Onsite modal + ITN | `payfast-api` |
| PayGate | Active | Redirect + MD5 checksum | `paygate-api` |
| Yoco | Active | Inline JS SDK | `yoco-gateway` |
| Ozow | Active | Instant EFT | `ozow-gateway` |
| Peach | Active | Server-to-server | `peach-gateway` |
| DPO | Active | Redirect | `dpo-gateway` |
| iKhokha | Active | mPOS / Online | `ikhokha-gateway` |
| SnapScan | Active | QR Code | `snapscan-gateway` |
| Stitch | Active | Open Banking | `stitch-gateway` |
| Payflex | Active | BNPL | `payflex-gateway` |
| Zapper | Active | QR Code | `zapper-gateway` |
| AddPay | Active | Redirect | `addpay-gateway` |

#### International 🌍
| Provider | Status | Type | Edge Function |
|----------|--------|------|---------------|
| Stripe | Active | Checkout Sessions | `stripe-gateway` |
| PayPal | Active | Orders API v2 | `paypal-gateway` |
| Flutterwave | Active | Standard API | `flutterwave-gateway` |
| Klarna | Active | BNPL | `klarna-gateway` |
| Affirm | Active | BNPL | `affirm-gateway` |

### Payment Gateway Contract
All gateways follow a shared contract (`_shared/payment-gateway-contract.ts`):
- `initiate_payment` — Create payment session, return redirect URL or client token
- `verify_payment` — Verify payment status after completion
- `webhook` — Handle gateway callbacks/notifications
- Standardized response: `{ success, transaction_id, redirect_url, status }`

### Payment Tables
- `payment_transactions`: All payment records with gateway response
- `payment_gateway_registry`: Registered gateways with capabilities
- `bookings.payment_status`: pending | paid | failed | refunded
- `bookings.payment_reference`: External payment reference

### Gateway Routing
- `pms-financial` edge function (`initiate_gateway_payment` action) routes to any registered gateway
- `PaymentGatewayRouter` component dynamically renders the correct gateway UI
- `useActivePaymentGateways()` hook resolves enabled gateways per property

---

## 11. Billing & Commission System

### Billing Strategies (7)
| Strategy | Description |
|----------|-------------|
| `default` | Standard commission-based billing |
| `widget` | Widget/embed-only properties |
| `rolos_pms` | ROL'OS native PMS properties |
| `portfolio_aggregator` | Portfolio-level aggregated billing |
| `enterprise_white_label` | White-label monthly fee |
| `volume_tiered` | Volume-based tiered pricing |
| `payment_facilitator` | Payment facilitation fee model |

### 3-Tier Billing Resolution
```
1. property_billing_configs (per-property override)
2. billing_global_defaults (system-wide defaults)
3. Hardcoded fallback (10% commission)
```

### Sales Rep Commission Structure
| Tier | Threshold | Rate |
|------|-----------|------|
| Base | Default | Configurable in `billing_global_defaults` |
| Accelerated | Target exceeded | Higher rate |
| Elite | Top performers | Maximum rate |

### Commission Cycle
- Monthly calculation via `calculate-rep-commissions`
- Reports stored in `rep_commission_reports`
- Individual entries in `rep_commission_entries`
- Statuses: `draft` → `pending_approval` → `approved` → `paid`
- Clawback support for churned referrals

### Admin Pages
- `/admin/billing-defaults` — Global billing configuration
- `/admin/sales-reps` — Sales rep management
- `/admin/commission-reports` — Monthly commission reports

---

## 12. Authentication & Authorization

### Auth System
- **Provider:** Supabase Auth (email/password)
- **Auto-confirm:** Enabled
- **Profile creation:** Automatic via `handle_new_user()` trigger

### Role System
- Roles stored in separate `user_roles` table (not on profiles)
- Checked via `has_role(user_id, role)` SECURITY DEFINER function
- Dev roles protected: only devs can remove dev assignments

### Role Hierarchy
```
fearless_leader (special role)
  └── dev (full system access)
       └── admin (property + user management)
            └── user (owner portal access)
```

### Route Protection
- `ProtectedRoute` component checks authentication
- `requireDev=true` prop for dev-only routes
- Owner routes filter by `is_property_owner()` or `is_linked_owner()`

---

## 13. AI & Content Generation

### AI Models

**Lovable AI Gateway (no API key needed):**
- Google Gemini 2.5 Pro/Flash/Flash-Lite
- Google Gemini 3.x Preview models
- OpenAI GPT-5/5-mini/5-nano/5.2

**xAI (via XAI_API_KEY secret):**
- Grok 3 Mini Fast — used for revenue/conversion insights

### AI Features
| Feature | Edge Function | AI Backend |
|---------|--------------|------------|
| Booking Concierge | `ai-booking-concierge` | Lovable AI |
| Property Search | `ai-property-search` | Lovable AI |
| Editorial Generation | `editorial-ai-assist` | Lovable AI |
| Bulk Editorial | `bulk-editorial-generate` | Lovable AI |
| Special Request Parsing | `parse-special-requests` | Lovable AI |
| Room Parsing | `smart-room-parser` | Lovable AI |
| Revenue Insights | `revenue-pulse-insights` | **xAI (Grok)** |
| Dashboard Insights | `dashboard-insights` | **xAI (Grok)** |
| Help Assistant | `help-assistant` | Lovable AI |
| Connect Assistant | `connect-assistant` | Lovable AI |
| Test Generation | `generate-test-scenarios` | Lovable AI |
| Experience Enrichment | `enrich-property-experiences` | Lovable AI |
| Review Analysis | `analyze-reviews` | Lovable AI |

### Feature Flags
- `AI_CONCIERGE_ENABLED`
- `VOICE_INPUT_ENABLED`
- `ENHANCED_PDF_ENABLED`
- `PROACTIVE_SUGGESTIONS_ENABLED`

---

## 14. System Health & Monitoring

### Components
- `system_health_components`: Registry of monitored components (PMS, internal, external)
- `system_health_checks`: Individual check results with latency
- `system_health_aggregates`: Hourly rollups (auto-populated by trigger)
- `system_alerts`: Active alerts with severity

### Health Check Flow
1. Cron triggers `trigger_system_health_check()` database function
2. Calls `system-health-check` edge function
3. Each PMS adapter's `health_check` action is invoked
4. Results stored in `system_health_checks`
5. `update_health_aggregates()` trigger rolls up stats

### Sync Status Categories
- **Synced:** last_sync_at < 24 hours ago
- **Stale:** last_sync_at 24-72 hours ago
- **Outdated:** last_sync_at > 72 hours ago
- **NightsBridge:** "Online" based on `nightsbridge_booking_sessions` activity

### Daily Health Report
- Automated email via `daily-health-report` edge function
- Sent via `trigger_daily_health_report()` database function

---

## 15. API Versioning & Rate Limiting

### Versioning
- Semantic versioning in endpoint path (v1 current)
- Version header support (`X-API-Version`)
- Version-aware action routing in `roomsonline-pms-api` and `wordpress-plugin-api`

### Rate Limiting
- Per-property rate limits stored in `api_rate_limits` table
- Configurable: `requests_per_minute` (default 60), `requests_per_hour` (default 1000), `daily_limit` (default 10000), `burst_limit` (default 20)
- Sliding window checks in edge functions
- Rate limit headers on all API responses: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Request Logging
- All API requests logged to `api_request_log`
- Captures: property, API key, action, version, status code, response time, IP, user agent

### Admin UI
- `/admin/system/api-configurator` — Rate limit configuration + usage dashboard
- Per-property usage stats (24h, 7d, 30d)
- Owner-facing API usage card in integrations tab

### API Documentation
- OpenAPI 3.0 spec at `public/docs/rolos-api-v1.json`
- Swagger UI viewer at `/docs/api`

---

## 16. Configuration Management

### Version-Controlled Contract System
- Immutable template versions in `contract_template_versions`
- Rich text editor (TipTap) with dynamic variables: `{{property_name}}`, `{{owner_name}}`, etc.
- Variable schema validation
- E-signature flow with token-based access

### Schema-Driven Onboarding Wizard
- `onboarding_wizards` → `onboarding_steps` → `onboarding_fields`
- Drag-and-drop step/field ordering
- Field keys mapped to `field_registry` for data integrity
- Full audit trail in `wizard_audit_log`

### PMS Field Control
- `pms-implementation-master.json` defines per-PMS field authority
- `pms_managed_fields` on properties tracks which fields are PMS-controlled
- UI locks fields when PMS is authoritative

### Centralized PMS Config
- `src/lib/pmsSystemsConfig.ts`: Single source of truth for PMS system metadata
- Controls visibility, deployment status, UI card rendering
- Used by AdminKeys, PropertyForm, DevPMS pages

---

## 17. Email & Notifications

### Provider: Resend
- API key: `RESEND_API_KEY` (secret)
- 13 email edge functions for different notification types

### Email Types
| Type | Function | Trigger |
|------|----------|---------|
| Booking Confirmation | `send-booking-email` | Successful booking |
| Contract Delivery | `send-contract` | Admin action |
| Owner Onboarding | `send-onboarding-email` | Property created |
| Access Request | `send-access-request` | Self-service signup |
| Activation Alert | `send-activation-notification` | Property activated |
| PMS Status Report | `send-pms-status-report` | Manual/scheduled |
| Itinerary | `send-itinerary-email` | Itinerary confirmed |
| Contact Form | `send-contact-email` | Public form submission |
| Survey Report | `send-survey-report` | Survey completion |
| Invoice | `send-invoice` | Invoice generation |
| Task Report | `send-task-report` | Dev task updates |

---

## 18. Storage & File Management

### Image Management
- Property images stored in `property-images` bucket (public)
- Image URLs stored in `properties.images` JSONB array
- Room images in `hostfully_room_types.images` JSONB

### Document Management
- Signed contracts in `contracts` bucket (private)
- E-signatures in `signatures` bucket (private)
- Property documents in `property-documents` bucket (private)

### PDF Generation
- Itinerary brochures via `generate-itinerary-pdf`
- Contract PDFs with signature overlay via `process-signature`

---

## 19. Audit & Compliance

### Comprehensive Audit System
- `audit_logs` table with tamper-detection hash (`immutable_hash`)
- `log_audit_change()` trigger on key tables
- Captures: old/new values, changed fields, user, role, IP, session
- Sensitive fields auto-redacted: `password`, `api_key`, `key_value`, `access_token`, `refresh_token`
- Request origins tracked: `admin_ui`, `edge_function`, `api`, `cron`, `db_trigger`

### Booking Audit
- `modification_notes` JSONB array appended by trigger
- `cancellation_reason` text field
- `booking_sync_status` tracks all PMS sync attempts

### Wizard Audit
- `wizard_audit_log` tracks all configuration changes
- Entity types: wizard, step, field, template, template_version

### Contract Compliance
- `enforce_contract_before_activation()` trigger prevents website listing without signed contract
- Owner contracts support admin override with reason tracking

---

## 20. Testing Infrastructure

### Test Runner
- `test_runs` table: test run definitions and results
- `test_logs` table: individual scenario results with assertions
- `execute-test-run` edge function: runs test scenarios
- `generate-test-scenarios` edge function: AI-generated test cases

### Testing UI
- `/dev/testing` page for running and monitoring tests
- Test categories: PMS health, booking flow, sync, API

---

## 21. Navigation Architecture

### Single Source of Truth
- `src/config/navigation.ts` defines ALL navigation items with sections, icons, roles
- Both `AppSidebar.tsx` (desktop) and mobile menu consume `navigationConfig`
- Adding a route to `navigation.ts` automatically surfaces it in both menus

### Section Structure
| Section | Target Roles | Items |
|---------|-------------|-------|
| Core | all | Dashboard, ROL Pulse |
| Workspace | owner+ | Bookings, Calendar, Room Availability, Properties |
| Insights | admin+ | Business Insights |
| Administration | admin+ | Users, Payments, Contracts, Help Articles, Access Requests, Sales Reps, Commission Reports, Billing Defaults |
| PMS & Integrations | admin+ | API Keys, Benson Config, Supporting Systems |
| System Control | dev+ | System Health, Audit, Dev Overview, PMS Dashboard, Testing, Task Tracker, Feature Flags, Danger Zone, API Docs |

---

## 22. Naming Conventions

| Context | Convention | Example |
|---------|------------|---------|
| Database columns | `snake_case` | `check_in_date` |
| TypeScript variables | `camelCase` | `checkInDate` |
| React components | `PascalCase` | `BookingWidget` |
| Edge functions (folders) | `kebab-case` | `benson-api` |
| API endpoints/actions | `snake_case` | `fetch_availability` |
| CSS classes | `kebab-case` | `booking-card` |
| Design tokens | `--kebab-case` | `--primary-foreground` |

### Interoperability Rule
All edge functions support BOTH `camelCase` and `snake_case` input parameters to prevent cross-system failures.

---

## 23. Adding a New PMS Integration

### Step-by-Step Checklist

1. **Create Edge Function**
   - Create `supabase/functions/{pms-name}-api/index.ts`
   - Import from `../_shared/adapter-contract.ts`

2. **Implement Required Actions**
   - `health_check` (mandatory)
   - `fetch_availability` (mandatory)
   - `get_room_types` (mandatory)
   - `get_rate_types` (recommended)
   - `create_reservation` (for booking support)

3. **Add to System Config**
   - Add entry to `src/lib/pmsSystemsConfig.ts`
   - Set `deploymentStatus`, `hasCustomCard`, etc.

4. **Add Field Authority Rules**
   - Add PMS entry to `src/config/pms-implementation-master.json`
   - Define which fields are authoritative/seed_only/not_available

5. **Add Credential Support**
   - Add required secrets via `secrets--add_secret`
   - Define credential schema in `pms_credentials` table

6. **Add to Booking Flow**
   - Add handler branch in `push-booking/index.ts`
   - Implement pre-booking verification (RULE #1)

7. **Add Tracker Entry**
   - Insert row in `pms_tracker_status`
   - Set initial milestone flags

8. **Add Admin UI Card** (optional)
   - Create card component in AdminKeys page
   - Set `hasCustomCard: true` in config

9. **Test Progressive**
   - Health check → Room types → Availability → Booking
   - Add to `system_health_components` for monitoring

---

## 24. Key File Locations

### Configuration Files
| File | Purpose |
|------|---------|
| `src/lib/pmsSystemsConfig.ts` | Centralized PMS system definitions |
| `src/config/pms-implementation-master.json` | Per-PMS field authority rules |
| `src/config/navigation.ts` | Single source of truth for all navigation |
| `public/llm-context.json` | AI/LLM system context |
| `public/llm-actions.md` | AI/LLM action guide |
| `public/docs/rolos-api-v1.json` | OpenAPI 3.0 specification |

### System Export Documents
| File | Purpose |
|------|---------|
| `docs/system-export/rol-system-manifest.json` | Complete system manifest |
| `docs/system-export/pms-adapter-registry.json` | PMS adapter contracts and capabilities |
| `docs/system-export/booking-flow-state-machine.json` | Booking flow logic |
| `docs/system-export/data-authority-model.json` | Data ownership model |

### Developer Guides
| File | Purpose |
|------|---------|
| `docs/booking-flow.md` | Definitive booking flow reference |
| `docs/ai-concierge-developer-guide.md` | AI concierge implementation |
| `docs/reservations-page-developer-guide.md` | Reservations UI guide |
| `docs/modify-cancel-booking-implementation-brief.md` | Modify/cancel system spec (v2.0) |
| `docs/property-listing-process.md` | Property activation workflow |
| `docs/rolos-pms-module-spec.md` | ROL'OS PMS module specification |
| `public/docs/ROLOS-Developer-REST-API-v3.1.docx` | Developer REST API reference |

### Shared Edge Function Utilities
| File | Purpose |
|------|---------|
| `supabase/functions/_shared/adapter-contract.ts` | PMS adapter response types |
| `supabase/functions/_shared/payment-gateway-contract.ts` | Payment gateway response types |
| `supabase/functions/_shared/cors.ts` | CORS headers |

### Auto-Generated (DO NOT EDIT)
| File | Purpose |
|------|---------|
| `src/integrations/supabase/types.ts` | Database type definitions |
| `src/integrations/supabase/client.ts` | Supabase client instance |
| `supabase/config.toml` | Supabase project config |
| `.env` | Environment variables |

---

## Appendix: Secrets Registry

| Secret | Purpose | Used By |
|--------|---------|---------|
| `XAI_API_KEY` | xAI/Grok AI models | `revenue-pulse-insights`, `dashboard-insights` |
| `HOTELBEDS_API_KEY` / `_SECRET` | HotelBeds API auth | `hotelbeds-api` |
| `HOSTFULLY_API_KEY` / `CLIENT_ID` / `CLIENT_SECRET` | Hostfully auth | `hostfully-api` |
| `NIGHTSBRIDGE_API_KEY` | NightsBridge auth | `nightsbridge-reservations-sync` |
| `PAYFAST_MERCHANT_ID` / `_KEY` / `_PASSPHRASE` | PayFast payments | `payfast-api` |
| `STRIPE_SECRET_KEY` / `_WEBHOOK_SECRET` | Stripe payments | `stripe-gateway` |
| `PAYPAL_CLIENT_ID` / `_CLIENT_SECRET` | PayPal payments | `paypal-gateway` |
| `FLUTTERWAVE_SECRET_KEY` | Flutterwave payments | `flutterwave-gateway` |
| `YOCO_SECRET_KEY` | Yoco payments | `yoco-gateway` |
| `OZOW_*` | Ozow payments | `ozow-gateway` |
| `DPO_*` | DPO payments | `dpo-gateway` |
| `PEACH_*` | Peach payments | `peach-gateway` |
| `ADDPAY_*` (6 secrets) | AddPay payments | `addpay-gateway` |
| `PAYGATE_ID` / `_ENCRYPTION_KEY` | PayGate payments | `paygate-api` |
| `RESEND_API_KEY` | Email delivery | All `send-*` functions |
| `GOOGLE_MAPS_API_KEY` | Geocoding + maps | `geocode-property`, frontend |
| `GOOGLE_RECAPTCHA_SECRET_KEY` | Bot protection | Form validation |
| `TRIPADVISOR_API_KEY` | Review fetching | `tripadvisor-api` |
| `FIRECRAWL_API_KEY` | Web scraping | `ai-website-sync` |
| `LOVABLE_API_KEY` | Lovable AI models | AI edge functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin DB operations | Edge functions |

---

*Generated: 2026-03-25 | RoomsOnline System v2026.03.25*
