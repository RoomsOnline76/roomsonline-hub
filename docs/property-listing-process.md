# Property Listing Process: Complete Developer Guide

> **Version:** 1.0 | **Last Updated:** January 2026  
> **Purpose:** End-to-end reference for onboarding a property from contract to live visibility

---

## Executive Summary

The property listing journey consists of **5 phases** that must be completed in sequence. This document provides a comprehensive checklist and technical reference for each phase.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        PROPERTY LISTING LIFECYCLE                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  PHASE 1              PHASE 2              PHASE 3              PHASE 4        │
│  ┌──────────┐         ┌──────────┐         ┌──────────┐         ┌──────────┐   │
│  │ Contract │ ──────► │ Contract │ ──────► │Onboarding│ ──────► │  Admin   │   │
│  │   Send   │         │  Signing │         │  Wizard  │         │  Review  │   │
│  └──────────┘         └──────────┘         └──────────┘         └──────────┘   │
│       │                    │                    │                    │          │
│       ▼                    ▼                    ▼                    ▼          │
│  Admin triggers       Owner signs          Owner completes      Admin verifies │
│  via UI               + provides           9-step wizard        data quality   │
│                       property details                                         │
│                                                                                 │
│                                                          PHASE 5               │
│                                                    ┌──────────────┐            │
│                                                    │  Activation  │            │
│                                                    │show_on_website│            │
│                                                    └──────────────┘            │
│                                                          │                     │
│                                                          ▼                     │
│                                                    Property LIVE               │
│                                                    on /book page               │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Contract Management

**Trigger:** Admin initiates contract via UI  
**Files:** `src/pages/AdminContracts.tsx`, `supabase/functions/send-owner-contract/index.ts`

### Admin Actions

1. Navigate to `/admin/contracts`
2. Click "Send Contract" button
3. Enter owner email and optional name
4. System validates if properties exist for this email

### System Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      send-owner-contract Edge Function                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. Normalize email (lowercase, trim)                                   │
│                                                                         │
│  2. Check for existing properties                                       │
│     └── If none found → is_new_owner = true                            │
│                                                                         │
│  3. For NEW owners only:                                               │
│     ├── Create Auth user (random temp password)                        │
│     ├── Create Profile record                                          │
│     └── Assign 'user' role in user_roles                               │
│                                                                         │
│  4. Get next version number (existing.version + 1)                     │
│                                                                         │
│  5. Fetch active contract template version                             │
│                                                                         │
│  6. Create owner_contracts record:                                     │
│     ├── status: 'sent'                                                 │
│     ├── version: nextVersion                                           │
│     ├── token_expires_at: NOW + 7 days                                 │
│     ├── template_version_id: active template ID                        │
│     └── is_new_owner: boolean flag                                     │
│                                                                         │
│  7. Generate signing URL: /contract/sign/{signing_token}               │
│                                                                         │
│  8. Send email via Resend:                                             │
│     ├── New owners: "Welcome to RoomsOnline" subject                   │
│     └── Existing owners: "Signature Required" with property list       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Database Changes

| Table | Action | Key Fields |
|-------|--------|------------|
| `owner_contracts` | INSERT | `owner_email`, `status='sent'`, `signing_token`, `token_expires_at` |
| `auth.users` | INSERT (new owners) | `email`, `email_confirm=true` |
| `profiles` | INSERT (new owners) | `id`, `email`, `full_name`, `role='user'` |
| `user_roles` | UPSERT | `user_id`, `role='user'` |

### Email Template Variations

**New Owner Email:**
- Subject: "Welcome to RoomsOnline - Partnership Agreement"
- Contains: Property registration notice (will capture details during signing)

**Existing Owner Email:**
- Subject: "RoomsOnline Partnership Agreement - Signature Required"
- Contains: List of all properties covered by the agreement

---

## Phase 2: Contract Signing

**Trigger:** Owner clicks link in email  
**Files:** `src/pages/ContractSign.tsx`, `supabase/functions/process-signature/index.ts`

### Public Signing Page Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ContractSign.tsx Flow                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. Load contract via get-contract-by-token edge function               │
│     ├── Validates token exists and not expired                         │
│     ├── Returns contract + covered properties + template content        │
│     └── Special handling for ALREADY_SIGNED (view/download only)       │
│                                                                         │
│  2. For NEW OWNERS, display property details form:                     │
│     ├── Property Name (required)                                       │
│     ├── Property Type (select dropdown)                                │
│     ├── Address, City, Country                                         │
│     ├── Registered Business Name                                       │
│     ├── Registration Number, VAT Number                                │
│     ├── Telephone, Mobile Number                                       │
│     ├── Postal Address                                                 │
│     └── Key Representative                                             │
│                                                                         │
│  3. Display rendered contract (template + variable substitution)        │
│                                                                         │
│  4. Capture signature via SignatureCanvas component                    │
│                                                                         │
│  5. Signee details:                                                    │
│     ├── Full Name (required)                                           │
│     ├── Email (required)                                               │
│     └── Designation (optional)                                         │
│                                                                         │
│  6. Submit → process-signature edge function                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### process-signature Edge Function

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    process-signature Edge Function                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. Validate contract + token + not already signed                     │
│                                                                         │
│  2. Store signature image in 'signatures' bucket                       │
│                                                                         │
│  3. FOR NEW OWNERS with pending_property_data:                         │
│     ├── Create property record:                                        │
│     │   ├── name, property_type, address, city, country               │
│     │   ├── owner_email, owner_name                                    │
│     │   ├── is_active: true                                            │
│     │   ├── Default values: max_guests=2, bedrooms=1, bathrooms=1     │
│     │   └── amenities JSONB with business details                     │
│     ├── Ensure profile exists for owner                                │
│     └── Ensure user_roles assignment                                   │
│                                                                         │
│  4. Update owner_contracts:                                            │
│     ├── status: 'signed'                                               │
│     ├── token_expires_at: NULL (permanent access)                      │
│     ├── signed_at, signed_by_name, signed_by_email                    │
│     ├── signature_image_url                                            │
│     ├── signature_data: { dataUrl: base64 }                           │
│     └── signature_ip, signature_user_agent                            │
│                                                                         │
│  5. Send confirmation emails:                                          │
│     ├── To signee: "Contract Signed Successfully"                     │
│     ├── To carike@roomsonline.co.za                                   │
│     └── To sleepinafrica@roomsonline.co.za                            │
│                                                                         │
│  6. FOR NEW OWNERS:                                                    │
│     ├── Generate password reset link                                   │
│     ├── Send "Welcome - Set Up Your Account" email                    │
│     └── Invoke send-onboarding-email function                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Property Creation Schema (New Owners)

```javascript
{
  name: pending_property_data.property_name,
  property_type: pending_property_data.property_type.toLowerCase(),
  address: pending_property_data.address,
  city: pending_property_data.city,
  country: pending_property_data.country,
  owner_email: contract.owner_email,
  owner_name: signee_name,
  is_active: true,
  max_guests: 2,
  bedrooms: 1,
  bathrooms: 1,
  price_per_night: 0,
  amenities: {
    // Root level (for contract variable resolution)
    registered_business_name: "...",
    registration_number: "...",
    vat_number: "...",
    telephone: "...",
    mobile_number: "...",
    postal_address: "...",
    key_representative: "...",
    // Nested structure (for PropertyForm compatibility)
    contact: { email: "...", telephone: "..." },
    banking: { property_registration: "...", vat_number: "...", has_vat: bool }
  }
}
```

---

## Phase 3: Property Onboarding Wizard

**Trigger:** Owner clicks link in onboarding email  
**Files:** 
- `src/pages/PropertyOnboarding.tsx` (token validation)
- `src/components/onboarding/PropertyOnboardingWizard.tsx` (wizard UI)
- `src/hooks/usePropertyOnboarding.tsx` (state management)
- `src/config/onboardingFieldSchema.ts` (wizard configuration)

### Token Validation (PropertyOnboarding.tsx)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PropertyOnboarding Token Flow                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. Extract token from URL: /onboarding/:token                         │
│                                                                         │
│  2. Query property_onboarding_tokens table:                            │
│     ├── Token exists?                                                  │
│     ├── expires_at > NOW?                                              │
│     └── used_at IS NULL?                                               │
│                                                                         │
│  3. If user not logged in → Show branded login interstitial            │
│     └── Display: "Login Required" with expected email                  │
│                                                                         │
│  4. If logged in with wrong email → Show "Wrong Account" error         │
│     └── Offer: "Log Out & Switch Account" button                       │
│                                                                         │
│  5. On valid token + correct user → Render PropertyOnboardingWizard    │
│                                                                         │
│  6. On completion → Mark token as used (used_at = NOW)                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9-Step Wizard Structure

| Step | ID | Title | Key Fields | Weight |
|------|-----|-------|------------|--------|
| 1 | `property_identity` | Property Identity | name, property_type, property_url, star_grading, offerings | 20% |
| 2 | `contact_details` | Contact & Team | telephone, contact_email | 5% |
| 3 | `location` | Location | address, city, country, latitude, longitude | 15% |
| 4 | `policies_pricing` | Policies & Pricing | check_in_time, bank_details, cancellation_policy, key_collection | 15% |
| 5 | `guest_experience` | Guest Experience | description, short_description, unique_selling_points, meal_plan | 10% |
| 6 | `facilities` | Facilities | facilities[] (amenity checkboxes) | 10% |
| 7 | `rooms_overview` | Rooms | room_types[] (name, units, max_guests, base_rate) | 10% |
| 8 | `media_documents` | Media & Documents | images[] (3-5 required, 1 hero), rate_sheet_url | 15% |
| 9 | `review` | Review & Submit | Final score display + submit button | 0% |

### Auto-Save Mechanism (usePropertyOnboarding.tsx)

```javascript
const DEBOUNCE_MS = 2000;

// On field change:
1. Update local state immediately
2. Add to pendingChangesRef
3. Clear existing timeout
4. Set new timeout (2 seconds)
5. On timeout: POST changes to Supabase
6. Update lastSavedAt + recalculate scores
```

### Scoring Algorithm

```javascript
// Each section contributes to a 100-point score
const SCORE_WEIGHTS = {
  property_identity: 20,
  contact_details: 5,
  location: 15,
  policies_pricing: 15,
  guest_experience: 10,
  facilities: 10,
  rooms_overview: 10,
  media_documents: 15
};

// Score bands
{ min: 95, max: 100, label: "ROL Platinum", badge: "Market Ready" }
{ min: 85, max: 94,  label: "ROL Gold",     badge: "Highly Competitive" }
{ min: 70, max: 84,  label: "ROL Silver",   badge: "Good Foundation" }
{ min: 0,  max: 69,  label: "In Progress",  badge: "Needs Completion" }
```

---

## Phase 4: Admin Review

**Trigger:** Admin navigates to property form  
**Files:** `src/pages/PropertyForm.tsx`, `src/pages/PropertyOverview.tsx`

### PropertyForm Tab Structure

| Tab | Purpose | Key Actions |
|-----|---------|-------------|
| **General** | Core details, owner info, PMS connection | Edit name, type, description, owner |
| **Info & Facilities** | Amenities, policies, surroundings | Edit amenities JSONB |
| **Rooms** | Room types, configurations | Manage room_types array |
| **Rates** | Pricing, seasons, additional charges | Configure rate rules |
| **Bookings** | View property bookings | Read-only list |
| **ROL Spec** | Editorial content, AI-generated text | Pink-highlighted ROL fields |
| **Contracts** | Contract history, status | View/resend contracts |

### Validation Checklist

Admin should verify:

- [ ] **Property Identity**
  - [ ] Name is set and not placeholder
  - [ ] Property type selected
  - [ ] Star grading (if applicable)

- [ ] **Location**
  - [ ] Full address present
  - [ ] City and country set
  - [ ] GPS coordinates (latitude/longitude) populated

- [ ] **Rooms**
  - [ ] At least one room type configured
  - [ ] Room types have names and max_guests
  - [ ] Base rates are reasonable (not 0)

- [ ] **Media**
  - [ ] Minimum 3 images uploaded
  - [ ] Hero image designated
  - [ ] Images are good quality

- [ ] **Banking**
  - [ ] Bank account details present
  - [ ] Bank confirmation letter uploaded (preferred)

- [ ] **Contract**
  - [ ] Owner contract status is `signed` or `overridden`

### PMS-Managed Fields

When a property is connected to an external PMS:

```javascript
// These fields are read-only in the UI
const PMS_SENSITIVE_FIELDS = [
  "properties.property_url",
  "properties.address",
  "properties.city",
  "properties.country",
  "properties.latitude",
  "properties.longitude",
  "properties.description"
];

// Check if field is managed:
const isPMSManaged = (field) => 
  property.pms_managed_fields?.includes(field) ||
  PMS_SENSITIVE_FIELDS.some(f => f.includes(field));
```

---

## Phase 5: Activation

**Trigger:** Admin toggles "Show on Website"  
**Files:** `src/pages/PropertyOverview.tsx`, Database trigger

### Activation Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     show_on_website Activation                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. Admin toggles switch in PropertyOverview                           │
│                                                                         │
│  2. UPDATE properties SET show_on_website = true                       │
│                                                                         │
│  3. Database trigger: enforce_contract_before_activation()             │
│     │                                                                   │
│     ├── Check owner_contracts for owner_email                          │
│     │   └── status IN ('signed', 'overridden')                         │
│     │                                                                   │
│     ├── Fallback: Check legacy property_contracts                      │
│     │   └── property_id + status IN ('signed', 'overridden')           │
│     │                                                                   │
│     └── If no valid contract:                                          │
│         RAISE EXCEPTION 'Property cannot be shown on website           │
│         without a signed contract or admin override'                   │
│                                                                         │
│  4. On success: Property appears on:                                   │
│     ├── /book (main booking page)                                      │
│     ├── /property/:slug (showcase page)                                │
│     └── Home page segments (if tagged appropriately)                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Database Trigger Code

```sql
CREATE OR REPLACE FUNCTION public.enforce_contract_before_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.show_on_website = true AND 
     (OLD.show_on_website = false OR OLD.show_on_website IS NULL) THEN
    
    -- Check owner_contracts (owner-level system)
    IF EXISTS (
      SELECT 1 FROM public.owner_contracts oc 
      WHERE oc.owner_email = NEW.owner_email 
      AND oc.status IN ('signed', 'overridden')
      ORDER BY oc.version DESC 
      LIMIT 1
    ) THEN
      RETURN NEW;
    END IF;
    
    -- Fallback: legacy property_contracts
    IF EXISTS (
      SELECT 1 FROM public.property_contracts pc 
      WHERE pc.property_id = NEW.id 
      AND pc.status IN ('signed', 'overridden')
      ORDER BY pc.version DESC 
      LIMIT 1
    ) THEN
      RETURN NEW;
    END IF;
    
    RAISE EXCEPTION 'Property cannot be shown on website without a signed contract or admin override.';
  END IF;
  
  RETURN NEW;
END;
$function$;
```

---

## Database Schema Reference

### Core Tables

#### `owner_contracts`
```sql
id                  UUID PRIMARY KEY
owner_email         TEXT NOT NULL
owner_name          TEXT
status              TEXT ('pending', 'sent', 'viewed', 'signed', 'overridden')
version             INTEGER
template_version_id UUID (FK to contract_template_versions)
signing_token       UUID UNIQUE
token_expires_at    TIMESTAMPTZ
sent_at             TIMESTAMPTZ
viewed_at           TIMESTAMPTZ
signed_at           TIMESTAMPTZ
signed_by_name      TEXT
signed_by_email     TEXT
signed_by_designation TEXT
signature_image_url TEXT
signature_data      JSONB
signature_ip        TEXT
signature_user_agent TEXT
pdf_url             TEXT
is_new_owner        BOOLEAN
pending_property_data JSONB
override_at         TIMESTAMPTZ
override_by         TEXT
override_reason     TEXT
```

#### `property_onboarding_tokens`
```sql
id          UUID PRIMARY KEY
property_id UUID (FK to properties)
owner_email TEXT NOT NULL
token       UUID UNIQUE DEFAULT gen_random_uuid()
created_at  TIMESTAMPTZ
created_by  UUID
expires_at  TIMESTAMPTZ (DEFAULT NOW + 30 days)
used_at     TIMESTAMPTZ
```

#### `properties` (key columns)
```sql
id                  UUID PRIMARY KEY
name                TEXT NOT NULL
property_type       TEXT
slug                TEXT UNIQUE
owner_email         TEXT
owner_name          TEXT
address             TEXT
city                TEXT
country             TEXT
latitude            NUMERIC
longitude           NUMERIC
description         TEXT
short_description   TEXT
images              JSONB
amenities           JSONB
pms_managed_fields  TEXT[]
is_active           BOOLEAN DEFAULT true
show_on_website     BOOLEAN DEFAULT false
external_system     TEXT
external_id         TEXT
```

---

## Edge Function Reference

| Function | Purpose | Auth Required |
|----------|---------|---------------|
| `send-owner-contract` | Create + send contract email | Yes (Admin) |
| `get-contract-by-token` | Retrieve contract for signing | No (Public) |
| `process-signature` | Handle signature + property creation | No (Public) |
| `send-onboarding-email` | Send wizard email with token | Yes (Service) |
| `email-contract-copy` | Send signed contract copy | Yes |

### Edge Function URLs

```
POST /functions/v1/send-owner-contract
  Body: { owner_email, owner_name? }

POST /functions/v1/get-contract-by-token
  Body: { token }

POST /functions/v1/process-signature
  Body: { contract_id, signing_token, signee_name, signee_email, 
          signee_designation?, signature_data_url, contract_type,
          pending_property_data? }

POST /functions/v1/send-onboarding-email
  Body: { propertyId, ownerEmail, ownerName?, propertyName? }
```

---

## Troubleshooting Guide

### Phase 1 Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Contract email not received | Resend API issue or spam filter | Check Resend logs; verify RESEND_API_KEY |
| "User already exists" error | Email already in auth.users | This is normal - function handles gracefully |
| Template not loading | No active template version | Ensure contract_template_versions has status='active' |

### Phase 2 Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| "Invalid signing link" | Token not found or tampered | Request new contract from admin |
| "Link expired" | >7 days since sent | Resend contract from AdminContracts |
| "Contract already signed" | Duplicate submission | Token still works for viewing/downloading |
| Signature upload fails | Storage permission issue | Check signatures bucket policies |
| Property not created | pending_property_data missing | Ensure new owner form was filled |

### Phase 3 Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| "Login Required" keeps appearing | Session issue | Clear cookies; re-login with correct email |
| "Wrong Account" error | User logged in as different email | Log out and use the invited email |
| Token expired | >30 days since sent | Admin can resend onboarding email |
| Auto-save not working | Network/permission issue | Check browser console for errors |
| Images not uploading | Storage bucket issue | Verify property-images bucket exists |

### Phase 4 Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Fields are read-only | PMS-managed | Override in PMS or disconnect |
| Country won't save | PMS lock or validation | Check pms_managed_fields array |
| Changes not persisting | FormData serialization | Check browser console for save errors |

### Phase 5 Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| "Cannot show without contract" | No signed/overridden contract | Send and sign contract first; or use admin override |
| Toggle fails silently | RLS policy blocking | Check user has admin role |
| Property not appearing on /book | Cache or filter issue | Clear cache; check is_active=true |

---

## Checklist Summary

### Admin Checklist (Pre-Listing)

```
□ PHASE 1: Contract Sent
  □ Owner email entered correctly
  □ Contract record created in owner_contracts
  □ Email delivered (check Resend logs if needed)

□ PHASE 2: Contract Signed
  □ Status changed to 'signed' in owner_contracts
  □ Signature stored in signatures bucket
  □ For new owners: Property record created
  □ For new owners: Welcome email sent
  □ For new owners: Onboarding email sent

□ PHASE 3: Onboarding Complete
  □ Owner accessed wizard successfully
  □ All 9 steps reviewed
  □ Score >= 70% (Silver or better)
  □ Token marked as used

□ PHASE 4: Admin Review
  □ Property name is correct (not placeholder)
  □ Property type selected
  □ Full address + GPS coordinates
  □ At least 1 room type configured
  □ Minimum 3 images with hero designated
  □ Bank details present
  □ Description filled in
  □ Check-in/out times set

□ PHASE 5: Activation
  □ Contract status verified (signed/overridden)
  □ show_on_website toggle enabled
  □ Property visible on /book page
  □ Property accessible at /property/:slug
```

### Owner Checklist (Self-Service)

```
□ Received contract email
□ Signed contract electronically
□ Set up account password (new owners)
□ Completed onboarding wizard
□ Uploaded property images
□ Added room types and rates
□ Verified all information is accurate
```

---

## Related Help Articles

For end-user guidance, ensure these help articles exist:

| Article Slug | Section | Target Role |
|--------------|---------|-------------|
| `signing-your-contract` | Onboarding | owner |
| `completing-property-profile` | Onboarding | owner |
| `uploading-property-images` | Content | owner |
| `configuring-room-types` | Content | owner |
| `sending-owner-contracts` | Admin | admin |
| `reviewing-property-submissions` | Admin | admin |
| `activating-properties` | Admin | admin |
| `contract-override-policy` | Admin | admin |

---

## Code File Quick Reference

| File | Lines | Purpose |
|------|-------|---------|
| `src/pages/AdminContracts.tsx` | ~712 | Contract management UI |
| `src/pages/ContractSign.tsx` | ~1118 | Public signing page |
| `src/pages/PropertyOnboarding.tsx` | ~281 | Token validation + auth gating |
| `src/components/onboarding/PropertyOnboardingWizard.tsx` | ~159 | 9-step wizard shell |
| `src/hooks/usePropertyOnboarding.tsx` | ~253 | Wizard state + auto-save |
| `src/config/onboardingFieldSchema.ts` | ~240 | Wizard configuration |
| `src/pages/PropertyForm.tsx` | ~2000+ | Admin property editing |
| `src/pages/PropertyOverview.tsx` | ~1050 | Property list + activation |
| `supabase/functions/send-owner-contract/index.ts` | ~261 | Contract sender |
| `supabase/functions/process-signature/index.ts` | ~427 | Signature processor |
| `supabase/functions/send-onboarding-email/index.ts` | ~176 | Onboarding email sender |
| `supabase/functions/get-contract-by-token/index.ts` | ~200+ | Token validator |

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Jan 2026 | System | Initial documentation |
