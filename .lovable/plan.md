

# Fix Contract Signing Data Capture and Onboarding Email

## Issues Identified

After investigating the Julius Erasmus contract signing, I found **three distinct issues**:

### Issue 1: Missing Fields in Property Creation
**Status**: Property was created but missing several fields that were captured in the contract wizard.

| Field | In `pending_property_data` | In `properties` table |
|-------|---------------------------|----------------------|
| `property_name` | ✅ "Julius Erasmus" | ✅ Saved as `name` |
| `property_type` | ✅ "Hotel" | ✅ Saved |
| `address` | ✅ "38 Geelhout Street" | ✅ Saved |
| `city` | ✅ "Still bay" | ✅ Saved |
| `country` | ✅ "South Africa" | ✅ Saved |
| `owner_email` | ✅ "dawie.julius@polka.co.za" | ✅ Saved |
| `owner_name` | ✅ (from signee) | ✅ "Julius Erasmus" |
| `telephone` | ✅ "795242837" | ⚠️ In amenities only |
| `mobile_number` | ❌ Not provided | N/A |
| `postal_address` | ❌ Not provided | N/A |

**Finding**: Core fields ARE being saved. The `owner_email` and `owner_name` ARE assigned. Business details (`telephone`, `vat_number`, etc.) are saved in `amenities` as designed.

### Issue 2: Contract Not Showing in Property Edit Tab
**Root Cause**: The `ContractManagementPanel` uses `useOwnerContract(ownerEmail)` to fetch contracts. This IS working correctly.

**Verification Query**: The contract exists with:
- `owner_email`: "dawie.julius@polka.co.za"
- `status`: "signed"
- `signed_at`: "2026-01-23 05:12:04"

**Likely Issue**: The property form might need to be refreshed, or there's a caching issue. The contract SHOULD display when viewing the property form.

### Issue 3: Onboarding Wizard Email Not Sent
**Root Cause**: The `process-signature` function sends a **password reset email** for new owners (lines 284-325), but it does **NOT** call the `send-onboarding-email` function.

The memory states:
> "For new owners, a separate welcome email is triggered after signature that includes a password set/reset link and a call-to-action to complete the property setup via the onboarding wizard."

Currently, the password reset email is sent, but it doesn't include the onboarding wizard link. The `send-onboarding-email` function exists but is **never called** during the contract signing flow.

---

## Solution

### Part 1: Update `process-signature` to Send Onboarding Email

**File**: `supabase/functions/process-signature/index.ts`

After creating the property and sending the password reset email, add a call to the `send-onboarding-email` function:

```typescript
// After the password reset email (around line 325)
if (isNewOwner && createdPropertyId) {
  try {
    // Invoke send-onboarding-email function
    const { error: onboardingError } = await supabase.functions.invoke(
      "send-onboarding-email",
      {
        body: {
          propertyId: createdPropertyId,
          ownerEmail: contract.owner_email,
          ownerName: signee_name,
          propertyName: createdPropertyName,
        },
      }
    );

    if (onboardingError) {
      console.error("Error sending onboarding email:", onboardingError);
    } else {
      console.log("Onboarding email sent successfully");
    }
  } catch (onboardingErr) {
    console.error("Failed to send onboarding email:", onboardingErr);
    // Don't fail the whole process
  }
}
```

**Alternative**: Combine the welcome and onboarding emails into one by adding the onboarding wizard CTA directly into the existing welcome email template.

### Part 2: Verify Contract Display (Investigation Only)

The contract should already display in the property edit form. Steps to verify:
1. Navigate to `/property/{propertyId}` for property `3c4c2a4e-7506-4ed7-af0f-d9d198500c18`
2. The `ContractManagementPanel` should fetch and display the contract
3. If not showing, the issue may be browser caching - try a hard refresh

### Part 3: Optional Improvements

Consider adding the following additional fields from `pending_property_data` to the property record:
- Store `telephone` in a top-level column if needed for quick access
- Add `postal_address` to the property record if provided

---

## Technical Details

### Current Data Flow
```text
Owner Signs Contract
       │
       ▼
process-signature edge function
       │
       ├─► Create property record ✅ (now working with price_per_night fix)
       │
       ├─► Update contract as signed ✅
       │
       ├─► Send confirmation emails (3x) ✅
       │
       ├─► Send password reset email ✅
       │
       └─► Send onboarding email ❌ (MISSING - needs to be added)
```

### After Fix
```text
Owner Signs Contract
       │
       ▼
process-signature edge function
       │
       ├─► Create property record ✅
       │
       ├─► Update contract as signed ✅
       │
       ├─► Send confirmation emails (3x) ✅
       │
       ├─► Send password reset email ✅
       │
       └─► Send onboarding wizard email ✅ (ADDED)
```

### Files to Modify
| File | Change |
|------|--------|
| `supabase/functions/process-signature/index.ts` | Add call to `send-onboarding-email` after property creation |

### Deployment
The edge function will need to be redeployed after the change.

