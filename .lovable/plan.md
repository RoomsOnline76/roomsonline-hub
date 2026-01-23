
# Contract Signing & Owner Onboarding Process Flow

## Summary

The contract signing flow follows a **contract-first** approach for new property owners. Here's the complete sequence:

---

## Stage 1: Admin Creates & Sends Contract

**Location:** Admin panel → Contracts section

**Actions:**
1. Admin enters owner's **email address** (required)
2. Admin optionally enters **owner name**
3. System calls `send-owner-contract` edge function

**What happens behind the scenes:**
- Checks if any properties exist for this email address
- If **NO properties exist** → marks as `is_new_owner: true`
- For new owners: Creates an Auth user with temporary password + Profile + User Role
- Creates contract record in `owner_contracts` table
- Generates unique signing token (valid 7 days)
- Sends email with "Review & Sign Contract" button

---

## Stage 2: Owner Signs the Contract

**Location:** Public signing page at `/contract/sign/{token}`

**For NEW owners (no existing properties):**
1. Property Details form appears:
   - Property Name (required)
   - Property Type (required) - Hotel, Guest House, Self-Catering, B&B, Lodge
   - Street Address (required)
   - City (required)
   - Country (required, defaults to South Africa)

2. Business Information (optional):
   - Registered Business Name
   - Registration Number
   - VAT Number
   - Telephone
   - Mobile Number
   - Postal Address
   - Key Representative

3. Signatory Details:
   - Full Name (required)
   - Email (required)
   - Designation (optional)

4. Signature & Agreement:
   - Draw or upload signature
   - Check legal agreement checkbox
   - Click "Sign Contract"

**For EXISTING owners:**
- Only signatory details + signature required
- No property form shown

---

## Stage 3: Backend Processing (process-signature)

When the owner submits:

1. **Validate** contract token and inputs
2. **Upload signature** to storage bucket
3. **For new owners with property data:**
   - Create property record with provided details
   - Verify/create profile if missing
   - Verify/create user_role if missing
   - Link property to owner via `owner_email` field
4. **Update contract** as `status: "signed"`
5. **Store** all submitted data in contract record

---

## Stage 4: Confirmation Emails

After successful signing:

| Email | Recipient | Purpose |
|-------|-----------|---------|
| Contract Signed Confirmation | Owner | Confirms signature received |
| Contract Signed Notification | carike@roomsonline.co.za | Admin notification |
| Contract Signed Notification | info@roomsonline.co.za | Admin notification |
| Welcome Email (new owners only) | Owner | Password setup link |
| Onboarding Wizard Email (new owners only) | Owner | Complete property profile |

---

## Stage 5: Owner Account Setup & Property Completion

**For new owners:**

1. **Password Setup:**
   - Owner receives "Welcome to RoomsOnline - Set Up Your Account" email
   - Clicks "Set Up Your Password" button
   - Creates password on Auth page
   - Can now log in as owner

2. **Property Onboarding Wizard:**
   - Owner receives "Complete Your Property Profile" email
   - Clicks "Complete Your Profile" button
   - Wizard guides through:
     - Property details and description
     - Room types and rates
     - High-quality photos
     - Banking details
     - Check-in/check-out policies
   - Property becomes fully active and bookable

---

## Data Flow Summary

```text
Email + Name (optional)
       ↓
   [Contract Email]
       ↓
Owner completes: Property details + Business info + Signature
       ↓
   [Property Created]
   [User Profile Created]
   [User Role Assigned]
   [Contract Marked Signed]
       ↓
   [Welcome Email → Password Setup]
   [Onboarding Email → Complete Wizard]
       ↓
Owner logs in → Completes wizard → Property goes live
```

---

## Current Implementation Status

| Step | Status | Notes |
|------|--------|-------|
| Send contract with email | ✅ Working | |
| New owner detection | ✅ Working | Based on property count |
| Property details form | ✅ Working | Shows for new owners |
| Property creation on sign | ✅ Fixed | Added missing required fields |
| Profile creation | ✅ Fixed | Added verification logic |
| User role creation | ✅ Fixed | Added verification logic |
| Confirmation emails | ✅ Working | 3 recipients |
| Password setup email | ✅ Working | Generates reset link |
| Onboarding wizard email | ✅ Fixed | Now triggered after signing |

All components of the flow are now implemented and should be working correctly.
