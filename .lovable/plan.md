

## Plan: Dynamic Commission Rate — Configurable, Contract-Integrated, Calculation-Linked

### Problem
1. Commission rate is **hardcoded as "ten percent (10%)"** in `ContractSign.tsx` — not pulled from the property's actual commercial terms
2. There is **no UI** in the Property Form to configure the commission rate per property
3. The `property_commercial_terms` table exists but has no frontend management interface
4. The contract template variable `{{commission_percentage}}` resolves to a static string

### What Changes

**1. Add Commission Configuration UI to Property Form (Rates tab)**
- Add a new "Commission" sub-tab alongside Rate Types, Seasons, Charges, etc. in the Rates tab
- Show the current active commission rate for the property (from `property_commercial_terms`)
- Allow admins to set/update the `revenue_share_percent` (default 10%) with effective date
- Display history of past commercial terms
- Only visible to admin/dev/fearless_leader roles

**2. Dynamic Commission in Contract Signing**
- In `ContractSign.tsx`, fetch the active `property_commercial_terms` for the contract's covered properties
- Replace hardcoded `'ten percent (10%)'` with the actual rate from the database
- Format as "X percent (X%)" for contract readability
- Fall back to "ten percent (10%)" if no commercial term exists

**3. Contract Preview also uses dynamic data**
- Update `ContractPreviewPane.tsx` sample data to note that commission_rate is "sourced from property"
- When issuing contracts from Admin, resolve `{{commission_percentage}}` dynamically

**4. Ensure calculate-commission edge function alignment**
- Already reads from `property_commercial_terms` — no changes needed there
- The UI will now let admins manage what that function reads

### Technical Details

**Files to modify:**
- `src/pages/PropertyForm.tsx` — Add "Commission" sub-tab in Rates tab with CRUD for `property_commercial_terms`
- `src/pages/ContractSign.tsx` — Fetch active commercial term and resolve `commission_percentage` dynamically
- `src/components/contract-editor/ContractPreviewPane.tsx` — Update sample data comment

**No database changes needed** — `property_commercial_terms` table already has the correct schema with `revenue_share_percent`, `effective_from`, `effective_to`, `contract_status`, and property FK.

**Commission sub-tab UI:**
- Current rate display (large number with badge showing source)
- Form: revenue_share_percent (number input, 0-100), effective_from (date), notes
- Table of historical terms with status badges
- Default 10% shown when no terms exist

