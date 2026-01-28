
# Property Listing Workflow: Comprehensive Documentation & Checklist

## Overview

This document outlines the complete end-to-end process for elegantly listing a property on the RoomsOnline Property Showcase page. The workflow spans multiple systems and requires coordination between Admin, Owner, and System components.

---

## Executive Summary

The property listing journey involves **5 major phases** with approximately **25 individual steps**. A database trigger enforces that properties cannot be activated for public display without a signed owner contract.

---

## Phase 1: Contract & Owner Setup

### 1.1 Admin Initiates Contract
**Location:** `/admin/contracts` (AdminContracts.tsx)
**Actor:** Admin/Dev

| Step | Action | System Behavior | Verification |
|------|--------|-----------------|--------------|
| 1.1.1 | Click "Send Contract" button | Opens send contract modal | Modal displays |
| 1.1.2 | Enter owner email address | System validates email format | Email validation passes |
| 1.1.3 | Enter owner name (optional) | Populates greeting in email | Name shows in preview |
| 1.1.4 | Click "Send" | Invokes `send-owner-contract` edge function | Toast: "Contract sent successfully" |

**Backend Flow (`send-owner-contract`):**
- Checks if properties exist for owner email → determines `is_new_owner` flag
- For new owners: Creates Auth user with temporary password, creates profile, assigns "user" role
- Creates `owner_contracts` record with status: "sent"
- Generates unique `signing_token` with 7-day expiry
- Sends branded email via Resend with signing link

### 1.2 Owner Signs Contract
**Location:** `/contract/sign/{token}` (ContractSign.tsx)
**Actor:** Property Owner

| Step | Action | System Behavior | Verification |
|------|--------|-----------------|--------------|
| 1.2.1 | Owner clicks email link | Loads contract page with dynamic template | Contract displays correctly |
| 1.2.2 | (New Owner) Fill property details | Form shows: Name, Type, Address, City, Country | All required fields populated |
| 1.2.3 | (New Owner) Fill business details | VAT, Registration, Mobile, Postal Address, Key Rep | Optional fields available |
| 1.2.4 | Enter signee name | Required for signature | Field validated |
| 1.2.5 | Enter signee email | Must match or be valid email | Field validated |
| 1.2.6 | Enter designation (optional) | Title/role of signee | Displayed on signed contract |
| 1.2.7 | Draw signature on canvas | Uses SignatureCanvas component | Signature visible |
| 1.2.8 | Check "I agree" checkbox | Enables submit button | Button becomes active |
| 1.2.9 | Click "Sign Contract" | Invokes `process-signature` edge function | Toast: "Contract signed" |

**Backend Flow (`process-signature`):**
- Validates contract and token
- Uploads signature image to `signatures` storage bucket
- For new owners:
  - Creates property with default values (price: 0, bedrooms/bathrooms: 1)
  - Saves business details to `amenities` JSONB (dual-mapped to root + nested paths)
  - Ensures profile and user_role exist
- Updates contract: status → "signed", clears `token_expires_at`
- Sends confirmation emails to: signee, carike@roomsonline.co.za, sleepinafrica@roomsonline.co.za
- For new owners: Sends welcome email with password reset link
- For new owners: Triggers `send-onboarding-email` edge function

---

## Phase 2: Property Onboarding Wizard

### 2.1 Owner Receives Onboarding Email
**Location:** Email inbox
**Actor:** Property Owner

| Step | Action | System Behavior | Verification |
|------|--------|-----------------|--------------|
| 2.1.1 | Owner receives onboarding email | Email contains unique onboarding token | Email delivered |
| 2.1.2 | Owner clicks "Complete Property Setup" | Navigates to `/onboarding/{token}` | Page loads |

### 2.2 Wizard Completion (9 Steps)
**Location:** `/onboarding/{token}` (PropertyOnboarding.tsx → PropertyOnboardingWizard.tsx)
**Actor:** Property Owner

| Wizard Step | Section | Key Fields | Score Weight |
|-------------|---------|------------|--------------|
| **Step 1** | Property Identity | Name, Type, Website URL, Offerings (Accommodation/Venue/Event/Conference) | 20% |
| **Step 2** | Contact & Team | Telephone, Email, Staff contacts | 5% |
| **Step 3** | Location | Address, City, Country, GPS coordinates (auto-geocoded) | 15% |
| **Step 4** | Policies & Pricing | Check-in/out times, Bank details, Bank confirmation letter, Cancellation policy, Payment terms, Key collection | 15% |
| **Step 5** | Guest Experience | Long description, Short description (marketing), Unique selling points, Meal plans | 10% |
| **Step 6** | Facilities | Amenities selection (multi-category checkboxes) | 10% |
| **Step 7** | Rooms | Room types: Name, Units count, Max guests, Base rate, Rate unit, Description, Room images | 10% |
| **Step 8** | Media & Documents | Property images (min 3, max 5), Hero image designation, Hero video URL, Rate sheet upload | 15% |
| **Step 9** | Review & Submit | Score display, Section completion status, Submit button | 0% |

**Scoring System:**
- **Ready to List:** 90%+
- **Nearly Ready:** 70-89%
- **Needs Attention:** Below 70%

**Auto-Save:** All changes are debounced (2 seconds) and saved automatically to the `properties` table.

---

## Phase 3: Admin Review & Enrichment

### 3.1 Property Form Review
**Location:** `/admin/properties/{slug}` (PropertyForm.tsx)
**Actor:** Admin/Dev

| Step | Action | Purpose | Verification |
|------|--------|---------|--------------|
| 3.1.1 | Navigate to property list | View all properties | Property appears in list |
| 3.1.2 | Click Edit (pencil icon) | Open PropertyForm | Form loads with owner data |
| 3.1.3 | Review General tab | Verify core details | All fields populated |
| 3.1.4 | Review Location tab | Verify address, geocoding | Map shows correct pin |
| 3.1.5 | Review Info & Facilities | Check amenities, policies | Amenities match property |
| 3.1.6 | Review Images tab | Verify image quality | At least 3 images present |
| 3.1.7 | Review Rooms tab | Check room configurations | Room types properly defined |
| 3.1.8 | Review Rates tab | Verify pricing structure | Rates loaded (if PMS connected) |

### 3.2 ROL Spec Enrichment
**Location:** ROL Spec tab in PropertyForm
**Actor:** Admin/Dev

| Step | Action | Purpose | Verification |
|------|--------|---------|--------------|
| 3.2.1 | Open ROL Spec tab | Access editorial fields | Pink-highlighted fields visible |
| 3.2.2 | Set Editorial Rating | 1-5 star ROL rating | Rating badge displays |
| 3.2.3 | Generate "Why We Chose" | AI-assisted or manual | Text populated |
| 3.2.4 | Generate "Who This Suits" | AI-assisted or manual | Text populated |
| 3.2.5 | Generate "What It's Really Like" | AI-assisted or manual | Text populated |
| 3.2.6 | Configure Navigation Tags | Select discovery categories | Tags assigned |
| 3.2.7 | Set Hero video URL (optional) | YouTube/Vimeo embed | Video displays in showcase |

### 3.3 PMS Integration (If Applicable)
**Location:** PropertyForm.tsx
**Actor:** Admin/Dev

| Step | Action | Purpose | Verification |
|------|--------|---------|--------------|
| 3.3.1 | Connect PMS (Benson/NightsBridge/Hostfully/etc) | Link to external system | PMS badge appears |
| 3.3.2 | Sync room types | Import from PMS | Rooms populated |
| 3.3.3 | Sync rates | Import rate configuration | Rates displayed |
| 3.3.4 | Verify PMS-managed fields | Check read-only indicators | Fields show lock icons |

### 3.4 Website Sync (Optional)
**Location:** General tab in PropertyForm
**Actor:** Admin/Dev

| Step | Action | Purpose | Verification |
|------|--------|---------|--------------|
| 3.4.1 | Enter property website URL | Source for AI extraction | URL validated |
| 3.4.2 | Click "Sync from Website" | Triggers `ai-website-sync` | Loading indicator shows |
| 3.4.3 | Review suggestions in modal | Accept/reject extracted data | Suggestions display |
| 3.4.4 | Apply selected suggestions | Updates form fields | Fields populated |

---

## Phase 4: Contract Verification & Activation

### 4.1 Verify Contract Status
**Location:** `/admin/properties` (PropertyOverview.tsx)
**Actor:** Admin/Dev

| Step | Action | Purpose | Verification |
|------|--------|---------|--------------|
| 4.1.1 | Check CONTRACT column | View signing status | Status icon shows |
| 4.1.2 | Verify signed/overridden status | Confirm activation eligibility | Green checkmark present |

**Contract Status Icons:**
- ✓ Green (FileCheck): Signed
- Yellow (FileWarning): Sent/Pending
- Red (FileX): No contract
- Blue (Shield): Overridden

### 4.2 Activate Property for Website
**Location:** `/admin/properties` (PropertyOverview.tsx)
**Actor:** Admin/Dev/Fearless Leader ONLY

| Step | Action | Purpose | Verification |
|------|--------|---------|--------------|
| 4.2.1 | Locate SHOW toggle | In property row | Toggle visible |
| 4.2.2 | Click toggle to ON | Activates `show_on_website` | Database trigger runs |
| 4.2.3 | Confirm success | Toast: "Property now visible" | Toggle stays ON |

**Database Trigger:** `enforce_contract_before_activation()`
- Checks if `owner_contracts` has status: "signed" or "overridden" for the property's `owner_email`
- Falls back to legacy `property_contracts` table
- Raises exception if no valid contract found: *"Property cannot be shown on website without a signed contract or admin override"*

---

## Phase 5: Showcase Verification

### 5.1 Public Showcase Check
**Location:** `book.sleepinafrica.roomsonline.co.za/property/{slug}`
**Actor:** Admin/Dev/Anyone

| Step | Action | Purpose | Verification |
|------|--------|---------|--------------|
| 5.1.1 | Navigate to property showcase | View public listing | Page loads |
| 5.1.2 | Verify RunwayHero | Check hero image/video | Media displays |
| 5.1.3 | Verify QuietFacts | Check property facts | Content renders |
| 5.1.4 | Verify RoomCollection | Check room cards | Rooms display |
| 5.1.5 | Verify InvitationMap | Check map and attractions | Map loads |
| 5.1.6 | Verify StickyBookingCTA | Check booking button | CTA functional |
| 5.1.7 | Test room navigation | Click room card | Room showcase opens |
| 5.1.8 | Test availability check | Select dates/guests | Calendar works |

### 5.2 Home Page Verification
**Location:** `book.sleepinafrica.roomsonline.co.za`
**Actor:** Admin/Dev

| Step | Action | Purpose | Verification |
|------|--------|---------|--------------|
| 5.2.1 | Navigate to home page | View property segments | Page loads |
| 5.2.2 | Check property appears in segments | Based on navigation tags | Property card visible |
| 5.2.3 | Check map clustering | Property pin on map | Pin displays correctly |
| 5.2.4 | Click property card | Navigate to showcase | Showcase opens |

---

## Quick Reference Checklist

### Pre-Listing Checklist (Admin)

**Contract Phase**
- [ ] Contract sent to owner email
- [ ] Owner has signed contract OR admin override applied
- [ ] Contract status shows as "signed" or "overridden"

**Onboarding Phase**
- [ ] Owner completed onboarding wizard
- [ ] Listing Readiness Score ≥ 70% (minimum)
- [ ] Listing Readiness Score ≥ 90% (recommended)

**Property Data Phase**
- [ ] Property name finalized
- [ ] Property type set correctly
- [ ] Address and location verified
- [ ] GPS coordinates correct (map pin in right place)
- [ ] At least 3 high-quality images uploaded
- [ ] Hero image designated
- [ ] Description written (marketing-ready)
- [ ] Contact details complete
- [ ] Check-in/out times set
- [ ] At least one room type configured
- [ ] Facilities/amenities selected

**Editorial Phase**
- [ ] Editorial rating assigned (1-5)
- [ ] "Why We Chose" content written
- [ ] "Who This Suits" content written
- [ ] Navigation tags assigned for discovery

**PMS Integration (if applicable)**
- [ ] PMS connected and synced
- [ ] Room types imported
- [ ] Rates imported
- [ ] Availability syncing

**Activation Phase**
- [ ] "Show on Website" toggle enabled
- [ ] Property appears on home page
- [ ] Property showcase page loads correctly
- [ ] Booking flow functional

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Toggle throws error | No signed contract | Send contract or apply admin override |
| Property not on home page | `show_on_website` is false | Enable toggle in PropertyOverview |
| Property not on map | Missing coordinates | Verify address, trigger geocoding |
| Rooms not showing | No room types defined | Add room types in onboarding or PropertyForm |
| Booking fails | PMS not connected or synced | Check PMS integration status |
| Images not loading | Upload failed or bucket issue | Re-upload images |

### Admin Override Process
If contract cannot be signed (legal exception, historical property):
1. Go to `/admin/contracts`
2. Find owner row, click menu (...)
3. Select "Override Contract"
4. Enter justification reason
5. Confirm override

---

## File References

| Purpose | File Path |
|---------|-----------|
| Contract Management | `src/pages/AdminContracts.tsx` |
| Contract Signing Page | `src/pages/ContractSign.tsx` |
| Send Owner Contract | `supabase/functions/send-owner-contract/index.ts` |
| Process Signature | `supabase/functions/process-signature/index.ts` |
| Onboarding Entry | `src/pages/PropertyOnboarding.tsx` |
| Onboarding Wizard | `src/components/onboarding/PropertyOnboardingWizard.tsx` |
| Wizard Steps | `src/components/onboarding/steps/` |
| Property Form | `src/pages/PropertyForm.tsx` |
| Property Overview | `src/pages/PropertyOverview.tsx` |
| Property Showcase | `src/pages/PropertyShowcase.tsx` |
| Enforcement Trigger | `public.enforce_contract_before_activation()` |
| Field Schema | `src/config/onboardingFieldSchema.ts` |

---

## Help Article Sections Required

Based on this documentation, the following help articles should be created:

1. **How to Send a Contract to a New Owner** (Admin)
2. **How to Sign Your RoomsOnline Contract** (Owner)
3. **Completing the Property Onboarding Wizard** (Owner)
4. **Reviewing and Enriching Property Data** (Admin)
5. **Understanding the Listing Readiness Score** (Owner/Admin)
6. **Activating a Property for Public Display** (Admin)
7. **Troubleshooting Activation Errors** (Admin)
8. **Using Admin Override for Contracts** (Admin)
9. **Connecting Your PMS** (Owner/Admin)
10. **Verifying Your Property Showcase** (Owner/Admin)
