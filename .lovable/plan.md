

# Property Listing Process Documentation

## Objective
Create a comprehensive developer documentation file that explains the complete property listing journey from contract signing through to live website visibility. This will serve as both a reference guide and a checklist for ensuring no steps are skipped.

---

## Document Location
`docs/property-listing-process.md`

---

## Document Structure

### 1. Executive Summary
A high-level overview of the complete flow with ASCII diagram showing the major milestones.

### 2. Phase 1: Contract Management
- **Admin initiates contract**: `AdminContracts.tsx` → `send-owner-contract` edge function
- Contract record created in `owner_contracts` table
- Email sent via Resend with signing link (7-day expiry)
- For new owners: Auth user + Profile + Role creation happens automatically

### 3. Phase 2: Contract Signing
- Owner accesses `/contract/sign/:token` (`ContractSign.tsx`)
- New owners provide property details during signing (name, type, address, business info)
- Signature captured via `SignatureCanvas.tsx`
- `process-signature` edge function:
  - Creates property record (if new owner)
  - Stores signature in `signatures` bucket
  - Updates contract status to `signed`
  - Sends confirmation emails to owner + admin team
  - Triggers welcome email with password reset link (for new owners)
  - Triggers onboarding email via `send-onboarding-email`

### 4. Phase 3: Property Onboarding Wizard
- Owner accesses `/onboarding/:token` (`PropertyOnboarding.tsx`)
- Token validated against `property_onboarding_tokens` table (30-day expiry)
- 9-step wizard (`PropertyOnboardingWizard.tsx`):
  1. Property Identity (name, type, star grading, offerings)
  2. Contact & Team (telephone, email)
  3. Location (address, city, country, coordinates)
  4. Policies & Pricing (check-in/out, banking, cancellation)
  5. Guest Experience (description, USPs, meal plans)
  6. Facilities (amenities checklist)
  7. Rooms (room types, units, rates)
  8. Media & Documents (3-5 images, hero image, rate sheet)
  9. Review & Submit (completion score, readiness band)
- Progress saved via debounced auto-save to `properties.amenities` JSONB
- Completion tracked in `amenities.onboarding_meta`

### 5. Phase 4: Admin Review
- Admin navigates to `PropertyForm.tsx` via `/admin/properties/:id`
- Review tabs: General, Info & Facilities, Rooms, Rates, Bookings, ROL Spec, Contracts
- Key validation checks:
  - Property name and type set
  - Address and location coordinates
  - At least one room type configured
  - Images uploaded (ideally 3-5 with hero)
  - Bank details for payments
  - Contract status (signed/overridden)
- Admin can edit any field, sync from PMS, trigger AI website sync

### 6. Phase 5: Activation (show_on_website)
- Toggle in `PropertyOverview.tsx` (admin/dev only)
- Database trigger `enforce_contract_before_activation()`:
  - Checks `owner_contracts` for `signed` or `overridden` status
  - Falls back to legacy `property_contracts` table
  - Raises exception if no valid contract exists
- Property appears on public pages: `/book`, `/property/:slug`

### 7. Database Schema Reference
- Tables: `properties`, `owner_contracts`, `property_onboarding_tokens`, `profiles`, `user_roles`
- Key columns: `show_on_website`, `is_active`, `amenities`, `pms_managed_fields`

### 8. Edge Function Reference
- `send-owner-contract`: Sends contract email, creates auth user for new owners
- `process-signature`: Handles signing, property creation, email notifications
- `send-onboarding-email`: Sends wizard link with token
- `get-contract-by-token`: Validates signing token (public access)

### 9. Troubleshooting Guide
- Common issues and resolutions for each phase

### 10. Checklist Summary
A single-page checklist for quick reference

---

## File Creation Details

**File path:** `docs/property-listing-process.md`

**Contents include:**
- ASCII flow diagrams
- Code file references with line numbers
- Database table structures
- API endpoint documentation
- Step-by-step checklist
- Troubleshooting section
- Related help articles cross-reference

---

## Related Files Referenced
| File | Purpose |
|------|---------|
| `src/pages/AdminContracts.tsx` | Contract management UI |
| `src/pages/ContractSign.tsx` | Public signing page |
| `supabase/functions/send-owner-contract/index.ts` | Contract email sender |
| `supabase/functions/process-signature/index.ts` | Signing handler |
| `supabase/functions/send-onboarding-email/index.ts` | Onboarding email |
| `src/pages/PropertyOnboarding.tsx` | Token validation + wizard container |
| `src/components/onboarding/PropertyOnboardingWizard.tsx` | 9-step wizard |
| `src/components/onboarding/steps/*.tsx` | Individual wizard steps |
| `src/pages/PropertyForm.tsx` | Admin property editing |
| `src/pages/PropertyOverview.tsx` | Property list + activation toggle |
| `src/config/onboardingFieldSchema.ts` | Wizard configuration |
| `src/hooks/usePropertyOnboarding.tsx` | Wizard state management |

