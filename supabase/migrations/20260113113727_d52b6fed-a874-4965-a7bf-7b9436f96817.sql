INSERT INTO public.help_articles (
  title, 
  slug, 
  section, 
  content_markdown, 
  role_target, 
  sort_order, 
  impact_level, 
  is_published
) VALUES (
  'Complete Guide: Onboarding Clients & Properties',
  'admin-complete-onboarding-guide',
  'getting_started',
  '# Complete Guide: Onboarding Clients & Properties

This guide covers the full end-to-end workflow for bringing new clients and their properties onto the Rooms Online platform.

---

## Workflow Overview

```
1. Direct Owner to Sign Up
       ↓
2. Owner Submits Access Request
       ↓
3. Admin Approves Account
       ↓
4. Admin Creates Property (if needed)
       ↓
5. Send Onboarding Wizard Link
       ↓
6. Owner Completes Wizard
       ↓
6.1 Complete ROL Spec (Editorial)
       ↓
7. Send Contract to Owner
       ↓
8. Contract Signed → Activate Property
       ↓
9. Property is Live
```

---

## Step 1: Direct Owner to Sign Up

Send the property owner/manager to:

**`sleepinafrica.roomsonline.co.za`**

On this page, they will see the **Request Access** form where they provide:
- Full Name
- Email Address
- Message (optional - can include property details)

:::info
The signup URL is the same as the public website. New users will see a "Request Access" option.
:::

---

## Step 2: Owner Submits Access Request

When the owner submits their request:

1. Their information is saved to the **Access Requests** queue
2. An email notification is sent to administrators
3. The request appears in **Admin → Access Requests** with status "Pending"

:::info
**Optional**: If the owner has been given elevated permissions, they may be able to create their own properties after account approval. Most owners will wait for admin to create properties.
:::

---

## Step 3: Admin Reviews & Approves Account

Navigate to **Admin → Access Requests** in the sidebar.

### Review Process:
1. Find the pending request in the table
2. Review the owner''s details:
   - Name
   - Email address
   - Message/notes they provided
3. Click the **Approve** button (green checkmark)

### Approval Dialog:
When you click Approve, you''ll be asked to:
- Confirm the owner''s name
- Select their **PMS System** (if applicable):
  - Hostfully
  - NightsBridge
  - Benson
  - None (manual entry)
- Optionally add notes

### What Happens After Approval:
1. An **owner** account is created in the system
2. A **welcome email** is sent with a password setup link
3. The request status changes to "Approved"
4. The owner can now log in and access their dashboard

:::warning
The password setup link in the welcome email expires after 24 hours. If the owner misses it, you can reset their password from **Admin → Users**.
:::

---

## Step 4: Admin Creates Property

If the property doesn''t already exist, you need to create it.

### Navigate to Property Overview:
1. Go to **Properties → Overview** in the sidebar
2. Click the **Add Property** button (top right)

### Required Fields:
| Field | Description |
|-------|-------------|
| **Property Name** | The display name (e.g., "Sunset Beach Villa") |
| **Property Type** | Hotel, Lodge, Guest House, Villa, etc. |
| **Owner Email** | Must match the owner''s approved email |
| **Street Address** | Physical location of the property |
| **City** | City/town name |
| **Country** | Country (defaults to South Africa) |
| **Max Guests** | Maximum occupancy |
| **Price Per Night** | Starting rate for display |

### Save the Property:
Click **Save** to create the property. It will appear in the Property Overview table with:
- **Score**: 0% (no onboarding data yet)
- **Contract**: None (not sent yet)
- **Active**: No (cannot activate until contract signed)

:::info
The **Owner Email** field is critical - it links the property to the owner''s account and determines which contract covers the property.
:::

---

## Step 5: Send Onboarding Wizard Link

From the **Property Overview** table:

1. Find the property row
2. Click the **envelope icon** (Send Onboarding) in the Actions column
3. Enter the owner''s email address in the dialog
4. Click **Send**

### What the Owner Receives:
- An email with a secure, personalized link
- The link is valid for **30 days**
- The link takes them directly to their property''s onboarding wizard

:::warning
**Link Expiration**: If the link expires, simply send a new one from the same button. Old links will no longer work.
:::

---

## Step 6: Owner Completes Onboarding Wizard

The owner works through a **9-step wizard** to provide property details:

### Wizard Steps:

| Step | Section | Key Information |
|------|---------|-----------------|
| 1 | **Property Identity** | Business registration, star rating, offerings (accommodation, events, dining) |
| 2 | **Contact Details** | Reception phone, email, team contacts, emergency numbers |
| 3 | **Location** | GPS coordinates, directions, nearest landmarks |
| 4 | **Policies & Pricing** | Check-in/out times, cancellation policy, payment methods, banking details |
| 5 | **Guest Experience** | Languages spoken, accessibility features, special services |
| 6 | **Facilities** | Amenities, parking, pool, WiFi, dining options |
| 7 | **Rooms Overview** | Room types, bed configurations, capacity |
| 8 | **Media & Documents** | Photos, insurance documents, licenses |
| 9 | **Review & Submit** | Final review of all entered information |

### Auto-Save Feature:
- Changes are automatically saved every 2 seconds
- No "Submit" button needed - progress is continuous
- The owner can close and return at any time

### Monitoring Progress:
In **Property Overview**, the **Score** column shows completion percentage:
- **0-25%**: Just started (red)
- **26-50%**: In progress (orange)
- **51-75%**: Mostly complete (yellow)
- **76-100%**: Ready for review (green)

:::info
**Scoring**: Different sections have different weights. Core information (identity, contact, location) is weighted higher than optional sections.
:::

---

## Step 6.1: Complete ROL Spec (Editorial Content)

The **ROL Spec** tab contains editorial content that makes properties stand out on the website.

### Access ROL Spec:
1. Open the property in **Edit** mode
2. Click the **ROL Spec** tab

### Editorial Fields:

| Field | Purpose | Example |
|-------|---------|---------|
| **Why We Chose This Place** | First impression hook | "Unmatched ocean views from every room" |
| **What It''s Really Like** | Honest description | "A peaceful retreat with a boutique feel" |
| **Why This Place Matters** | Unique value proposition | "One of only three eco-certified lodges in the region" |
| **Who This Suits** | Target guest profile | "Couples seeking a romantic getaway" |
| **Who It''s Not For** | Honest exclusions | "Not suitable for young families or party groups" |
| **Navigation Tags** | Searchable categories | Select from 40+ tags (Beach, Safari, Spa, etc.) |

### AI Assist:
Click the **AI Assist** button to auto-generate descriptions based on the property''s amenities and features. You can then edit the suggestions.

:::info
**Navigation Tags** are critical for search and filtering. Select all relevant tags to maximize the property''s visibility.
:::

---

## Step 7: Send Contract to Owner

Contracts must be signed before a property can go live.

### Access Contract Panel:
1. Open the property in **Edit** mode
2. Scroll to the **Contract Status** card in the General tab

### Contract Status Indicators:
| Status | Icon | Meaning |
|--------|------|---------|
| **None** | Gray circle | No contract sent |
| **Sent** | Blue paper plane | Contract emailed, awaiting signature |
| **Viewed** | Blue eye | Owner has opened the contract link |
| **Signed** | Green checkmark | Contract signed and complete |
| **Overridden** | Orange shield | Admin bypass (requires justification) |

### Send Contract:
1. Click **Send Contract** button
2. Enter the owner''s email address
3. Click **Send**

The owner receives:
- An email with a secure signing link
- Link valid for **14 days**
- Link to the full contract terms plus signature pad

:::warning
**Contract Expiration**: If the signing link expires, you''ll need to send a new contract. The old link becomes invalid.
:::

---

## Step 8: Contract Signed → Activate Property

Once the contract shows **Signed** (green checkmark):

### Activate the Property:
1. In Property Form → General tab
2. Find the **Show on Website** toggle
3. Switch it **ON**

### What Happens:
- Property immediately appears on the public website
- Property is searchable and bookable
- Property appears in relevant category listings

### Download Signed Contract:
- Click the **Download** button in the Contract Status card
- PDF includes the full agreement with embedded signature image

:::critical
**Cannot Activate Without Contract**: The system enforces contract signing. You cannot enable "Show on Website" if the contract is not signed or overridden.
:::

### Contract Override (Admin Only):
In exceptional circumstances, admins can override the contract requirement:
1. Click **Override** in the Contract Status card
2. Enter a **justification** (minimum 20 characters required)
3. This allows activation without a signed contract
4. Override is logged for audit purposes

:::warning
**Use Override Sparingly**: Overrides should only be used for legitimate business reasons (e.g., existing legal agreement, special partnership). All overrides are permanently logged.
:::

---

## Step 9: Property is Live

Verify the property is live:

1. Visit **sleepinafrica.roomsonline.co.za**
2. Search for the property by name or location
3. Verify:
   - Property appears in listings
   - Images display correctly
   - Booking flow works
   - Pricing is accurate

### Live Property Features:
- Appears in search results
- Visible on map view
- Bookable by guests
- Featured in relevant categories (based on navigation tags)

---

## Repeat for Additional Properties

For owners with **multiple properties** (portfolio owners):

### Streamlined Process:
1. **Create additional properties** in Property Overview
2. Ensure the **same Owner Email** is used
3. Send onboarding wizard links for each property
4. **No new contract needed** - owner-level contracts cover all properties under the same email

:::info
**Owner-Level Contracts**: A single signed contract covers all properties linked to that owner''s email. When adding new properties for an existing owner, check if they already have a signed contract.
:::

### Check Existing Contract Status:
In Property Overview, the **Contract** column shows:
- The status applies to the **owner**, not individual properties
- If one property shows "Signed", all properties under that owner are covered

---

## Troubleshooting Common Issues

### Owner Can''t Find Email
- Check spam/junk folders
- Verify the email address is correct
- Resend the link from Property Overview

### Onboarding Link Expired
- Links expire after 30 days
- Simply click the send button again to issue a new link
- Old links become invalid

### Contract Link Expired
- Signing links expire after 14 days
- Send a new contract from the Contract Status panel
- Previous unsigned contracts are superseded

### Property Won''t Activate
Check these in order:
1. **Contract Status**: Must be "Signed" or "Overridden"
2. **Owner Email**: Must be set and match a valid owner
3. **Required Fields**: Property must have name, address, type

### Score Not Updating
- Refresh the Property Overview page
- Changes auto-save with a 2-second delay
- Score recalculates on page load

### Owner Created Wrong Property
- Owners can create properties if they have the "owner" role
- Admin can edit or delete incorrect entries
- Link the property to the correct owner email

---

## Quick Reference Checklist

Use this checklist for each new property onboarding:

- [ ] Owner submitted access request
- [ ] Admin approved account
- [ ] Property created in Property Overview
- [ ] Onboarding wizard link sent
- [ ] Owner completed wizard (check Score ≥75%)
- [ ] ROL Spec completed (editorial content)
- [ ] Contract sent to owner
- [ ] Contract signed
- [ ] "Show on Website" enabled
- [ ] Property verified live on website

---

## Related Articles

- [Sending & Managing Onboarding Links](/help/admin-onboarding-links)
- [Property Contract Management](/help/admin-contract-management)
- [Contract Overrides & Compliance](/help/admin-contract-overrides)
- [Understanding Onboarding Scores](/help/admin-onboarding-scores)',
  ARRAY['admin', 'dev'],
  15,
  'info',
  true
);