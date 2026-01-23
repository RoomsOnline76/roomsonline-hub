
# Fix Property Data Loading from Contract Signing

## Summary of Issues Found

The property data captured during contract signing **IS saved correctly** to the database, but the **PropertyForm is not loading it properly** due to path mismatches between where the data is stored and where the form expects to find it.

### Data Mapping Comparison

| Field | Stored In (process-signature) | Loaded From (PropertyForm) | Status |
|-------|-------------------------------|---------------------------|--------|
| Property Type | `properties.property_type` = "Hotel" | `data.property_type` | Mismatch: Form expects lowercase ("hotel") |
| Contact Email | `properties.owner_email` | `amenities?.contact?.email` | Not loading - wrong path |
| Telephone | `amenities.telephone` | `amenities?.contact?.telephone` | Not loading - wrong path |
| Registration Number | `amenities.registration_number` | `amenities?.banking?.property_registration` | Not loading - wrong path |
| VAT Number | `amenities.vat_number` | `amenities?.banking?.vat_number` | Not loading - wrong path |
| Registered Business Name | `amenities.registered_business_name` | `amenities?.registered_business_name` | Working |
| Key Representative | `amenities.key_representative` | `amenities?.key_representative` | Working |

### Database Verification
The property record (3c4c2a4e-7506-4ed7-af0f-d9d198500c18) contains:
- `property_type`: "Hotel" (stored correctly)
- `owner_email`: "dawie.julius@polka.co.za" (stored correctly)
- `amenities.telephone`: "795242837" (stored at root level)
- `amenities.registration_number`: "1234566890" (stored at root level)
- `amenities.vat_number`: "17263838" (stored at root level)

---

## Root Cause

The `process-signature` edge function stores business registration fields at the **root level** of the `amenities` object, but the `PropertyForm` loader expects them in **nested paths**:

- `process-signature` saves: `amenities.telephone`
- `PropertyForm` loads from: `amenities.contact.telephone`

---

## Solution

### Part 1: Fix PropertyForm Field Loading

**File**: `src/pages/PropertyForm.tsx`

Update the `setFormData` block (around line 2659) to load from both the expected nested paths AND the root-level paths where contract data is stored:

```typescript
setFormData({
  // ... existing fields ...
  
  // Contact Email - prioritize owner_email (where contract data is stored)
  contact_email: data.owner_email || amenities?.contact?.email || "",
  
  // Telephone - check root level first (contract data), then nested
  telephone: amenities?.telephone || amenities?.contact?.telephone || "",
  
  // Registration - check root level first (contract data), then banking
  property_registration: amenities?.registration_number || amenities?.banking?.property_registration || "",
  
  // VAT - check root level first (contract data), then banking
  vat_number: amenities?.vat_number || amenities?.banking?.vat_number || "",
  has_vat: amenities?.banking?.has_vat ?? !!(amenities?.vat_number || amenities?.banking?.vat_number),
  
  // Property type - normalize to lowercase for Select component
  property_type: (data.property_type || "").toLowerCase(),
});
```

### Part 2: Fix Property Type Case Sensitivity

**Option A**: Normalize on load (recommended)
In the `setFormData` block, convert property_type to lowercase:
```typescript
property_type: (data.property_type || "").toLowerCase(),
```

**Option B**: Normalize on save (in process-signature)
Update the edge function to store lowercase:
```typescript
property_type: propData.property_type?.toLowerCase(),
```

I recommend Option A + Option B for consistency.

### Part 3: Update process-signature to match expected structure

**File**: `supabase/functions/process-signature/index.ts`

Update the amenities object to also include nested paths that the form expects:

```typescript
amenities: {
  // Root level (for contract variable resolution)
  registered_business_name: propData.registered_business_name || propData.property_name,
  registration_number: propData.registration_number,
  vat_number: propData.vat_number,
  telephone: propData.telephone,
  mobile_number: propData.mobile_number,
  postal_address: propData.postal_address,
  key_representative: propData.key_representative || signee_name,
  // Nested structure (for PropertyForm compatibility)
  contact: {
    email: contract.owner_email,
    telephone: propData.telephone,
  },
  banking: {
    property_registration: propData.registration_number,
    vat_number: propData.vat_number,
    has_vat: !!propData.vat_number,
  },
},
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/PropertyForm.tsx` | Update field loading to check both root and nested paths; normalize property_type to lowercase |
| `supabase/functions/process-signature/index.ts` | Store property_type as lowercase; add nested paths for form compatibility |

---

## Expected Outcome

After implementation:
1. Property Type dropdown will show "Hotel" instead of "Select"
2. Contact Email will display the owner's email address
3. Telephone will show the captured phone number
4. Registration Number will appear in the Banking Details section
5. VAT Number will display (with has_vat auto-detected)
6. All fields captured during contract signing will be visible in the property edit form
