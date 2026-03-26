

# TOBI AI Assistant — Full Knowledge Review & Update

## Audit Summary

Compared the Technical Scope Document (853 lines, 24 features) against TOBI's three system prompts. Found significant knowledge gaps across all three instances.

## Three TOBI Instances

| Instance | Edge Function | Audience |
|----------|--------------|----------|
| Generic Help | `help-assistant` (`GENERIC_SYSTEM_PROMPT`) | All authenticated users (owners, admins, devs) |
| PMS Assistant | `help-assistant` (`PMS_SYSTEM_PROMPT`) | Property staff inside PMS shell |
| Connect Portal | `connect-assistant` | Public visitors, developers, agencies |

---

## Gap Analysis: What TOBI Doesn't Know

### GENERIC_SYSTEM_PROMPT — Missing Knowledge

1. **Voucher/Promo Codes** — New `promo_codes` table, validate-voucher edge function, voucher management in property form Specials tab, discount types (percentage/fixed), non-refundable conditions
2. **Room-Level Charges** — `property_charges` now supports per-room assignment via `room_type_ids` and `room_charge_overrides` JSONB; charges can be scoped to specific room types
3. **Copy Branding** — CopyBrandingModal lets owners sync logo, colours, brand override to other properties
4. **Promotion Page** — `/admin/promotion` exists in navigation (placeholder)
5. **Integrations Tab** — 9 widget types: Direct Link, Widget, Booking Bar, Full Embed, Smart Button, WordPress, Elementor, API, Portfolio
6. **Itinerary/Journey Builder** — Multi-property trip planning with map, timeline, PDF generation
7. **Payment Gateways** — PayFast (on-site modal) and PayGate (redirect), dual environment support
8. **Quality Gate / Activation** — Pre-flight checklist, `check-activation-readiness` edge function, blocker/warning system
9. **Property Staff Login** — `/staff-login/:propertySlug` branded login page
10. **Onboarding Tokens** — Secure email-based owner onboarding via `property_onboarding_tokens`
11. **Admin navigation structure** — Current grouped order (Property Lifecycle → People → Finance)
12. **Owner workspace features** — Calendar views (accommodation, event, conference), Property Pulse reports
13. **API Configurator** — WP plugin and embed UI configuration at `/admin/system/api-configurator`
14. **API Docs** — OpenAPI spec viewer at `/docs/api`

### PMS_SYSTEM_PROMPT — Missing Knowledge

1. **Voucher management** — PromoCodesTab under Specials for creating/editing promo codes per property
2. **Room-level charges** — Charges can now be assigned to specific room types with per-room amount overrides
3. **Copy charges/branding** — Copy to other properties with smart room-name matching
4. **Staff roles update** — Now 6 roles: general_manager, front_desk, housekeeping, maintenance, **accountant**, **auditor** (prompt only lists 4)
5. **Deposit schedules** — Mentioned in navigation but not explained
6. **Yield rules** — Revenue management engine details missing
7. **Message queue scheduling** — Offset-hour scheduling for pre-arrival/post-checkout messages
8. **Inventory calendar** — Day-level availability grid management
9. **PMS Branding** — White-label identity with stationery customization
10. **Font readability** — WCAG contrast checking with fallback colour suggestions

### CONNECT_ASSISTANT — Missing Knowledge

1. **Staff roles** — Now 6 roles (missing accountant, auditor)
2. **Voucher/promo system** — Bookable properties can have promo codes
3. **Room-level charges** — Per-room pricing flexibility
4. **Widget types** — Only mentions generic widgets; should list all 9 integration methods
5. **Itinerary builder** — Multi-property trip planning as a selling point
6. **Bank export system** — Financial reconciliation with dual sign-off
7. **Channel manager details** — Missing specifics about supported OTAs

---

## Changes

### 1. `supabase/functions/help-assistant/index.ts` — Update both prompts

**GENERIC_SYSTEM_PROMPT additions:**
- Voucher/Promo Codes section (how they work, where to manage, discount types)
- Room-Level Charges section (per-room assignment, overrides, copy behaviour)
- Copy Branding section
- Property Activation / Quality Gate section
- Integrations Toolkit overview (9 widget types)
- Itinerary Builder mention
- Payment Gateways section (PayFast, PayGate)
- Staff Login section
- Updated navigation reference (grouped admin menu)
- Owner workspace features (calendar views, promotion placeholder)

**PMS_SYSTEM_PROMPT additions:**
- Update ROLE-BASED ACCESS to include accountant and auditor (6 roles)
- Add VOUCHER MANAGEMENT section with navigation hint to Specials tab
- Add ROOM-LEVEL CHARGES explanation
- Add COPY TOOLS section (copy charges, copy branding with smart room matching)
- Add DEPOSIT SCHEDULES explanation
- Add YIELD RULES / REVENUE MANAGEMENT section
- Expand FINANCIAL CONCEPTS with folios, charge scoping, promo discounts
- Add font/branding readability preview info

### 2. `supabase/functions/connect-assistant/index.ts` — Update sales prompt

- Update staff roles to 6
- Add Voucher/Promo system as a feature bullet
- Add per-room charge flexibility
- Expand widget ecosystem (list all 9 types)
- Add Itinerary Builder as selling point
- Add Channel Manager with OTA list
- Add Bank Export / Financial Reconciliation mention

### 3. `src/components/help/TobiAssistant.tsx` — Update suggested prompts

Current prompts are generic. Update to cover more of the platform:
```
"How do bookings work?"        → keep
"How do I connect my PMS?"     → keep  
"What is ROL Spec?"            → "How do voucher codes work?"
"How do I add a property?"     → "What are room-level charges?"
```

### 4. `src/components/pms/PMSTobiAssistant.tsx` — Update PMS suggested prompts

Add prompts for new features if the component has suggested prompts.

---

## Files

| Action | File |
|--------|------|
| Modify | `supabase/functions/help-assistant/index.ts` |
| Modify | `supabase/functions/connect-assistant/index.ts` |
| Modify | `src/components/help/TobiAssistant.tsx` |
| Modify | `src/components/pms/PMSTobiAssistant.tsx` |

No database changes needed.

