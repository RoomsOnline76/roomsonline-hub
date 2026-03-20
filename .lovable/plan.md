

# Add Contract Knowledge to TOBI's System Prompts

## Problem
TOBI gave incorrect information about contracts because neither the generic nor PMS system prompts contain any contract documentation. TOBI is instructed "never make up features" — so without contract knowledge, it guesses wrong.

## Fix
Add a **CONTRACT MANAGEMENT** section to the `GENERIC_SYSTEM_PROMPT` in `supabase/functions/help-assistant/index.ts` documenting the actual system capabilities:

### Content to add (after the existing guidelines, before the closing quote):

**CONTRACT MANAGEMENT (Admin Feature):**
- Owner contracts are managed from the Admin panel under property settings
- When sending a contract, the system **automatically includes ALL properties** linked to that owner's email address
- Multi-property contracts are fully supported — one contract covers all of an owner's properties
- Two contract types available: **Standard Listing Agreement** and **ROL'OS PMS Partnership Agreement**
- Contract statuses: draft → sent → viewed → signed (or declined/overridden)
- Admins can override the contract requirement with a reason
- Admins can resend contracts if needed
- Signed contracts are permanently accessible via the signing token
- Contract notifications go to the owner and the admin team

### Also add to `PMS_SYSTEM_PROMPT`:
A shorter reference noting that contracts are managed from the Admin panel and cover all properties for a given owner.

### Also update `connect-assistant` prompt:
The Connect assistant should not need contract knowledge (it's sales-facing), so no changes needed there.

## Result
TOBI will accurately describe that contracts automatically include all owner properties, eliminating the disconnect between what the system does and what TOBI says.

