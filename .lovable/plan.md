

# Add Property Mandatory + Resend with Property Linking

## Changes to `src/pages/AdminContracts.tsx`

### 1. Make Property Name mandatory on Send

- Add validation: disable "Send Contract" button when no `selectedProperty` is set (change `disabled={sending || !sendEmail}` → `disabled={sending || !sendEmail || !selectedProperty}`)
- The search already works — it lists existing DB properties (excluding deleted), and allows typing a new name that creates on send
- If `selectedProperty.id` is empty (new property), create the property in `handleSendContract` before invoking `send-owner-contract`:
  ```sql
  INSERT INTO properties (name, owner_email, owner_name, is_active) 
  VALUES (selectedProperty.name, sendEmail, sendName, true)
  ```
  Then pass the new property's ID to the edge function

### 2. Resend Contract — Property selection modal

Replace the direct `handleResendContract` call with a modal flow:

**New state:**
- `resendModalOpen`, `resendContract` (the contract being resent)
- `resendPropertySelections` — `Map<string, boolean>` of property IDs to checked state
- `resendAvailableProperties` — loaded from DB for the owner's email

**Flow:**
1. Click "Resend" on a contract → open resend modal
2. Modal loads all properties where `owner_email = contract.owner_email` (excluding deleted)
3. Shows checkboxes for each property, all pre-checked
4. Admin can uncheck/check properties
5. On confirm:
   - Call `send-owner-contract` with `owner_email` and `resend: true`
   - For each **checked** property, update `owner_name` and `owner_email` on the `properties` table to match the contract's values (ensuring property records stay in sync)
   - Toast success

**Modal UI:**
- Title: "Resend Contract"
- Description: "Select properties to link to this contract for {owner_email}"
- Scrollable list of properties with checkboxes
- Each row shows property name
- Footer: Cancel + "Resend & Link Properties" button

### 3. Property search — also show unfiltered list on focus

Currently dropdown only appears after 2+ chars. Change: when the input is focused and empty, show the first 15 properties (ordered by name, excluding deleted) so admins can browse without typing. Trigger search on focus with empty query showing recent/all.

## Files changed

| File | Change |
|---|---|
| `src/pages/AdminContracts.tsx` | Make property mandatory, add property creation on send, add resend modal with property linking |

## What does NOT change
- Edge functions unchanged
- Database schema unchanged
- Contract signing flow unchanged

