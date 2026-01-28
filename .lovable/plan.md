

# Additional Charges Feature - Implementation Plan

## Overview

This plan implements a property-level additional charges system for RoomsOnline, enabling transparent fee management with support for taxes, fees, deposits, and surcharges. The system will integrate with existing booking flows and PMS adapters (particularly Hostfully).

---

## Phase 1: Database Schema (Foundation)

### 1.1 Create `property_charges` Table

```sql
CREATE TABLE property_charges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(100) NOT NULL,
  internal_code VARCHAR(50),
  category VARCHAR(20) CHECK (category IN ('tax', 'fee', 'deposit', 'surcharge', 'custom')) NOT NULL,
  
  -- Calculation
  calculation_method VARCHAR(30) CHECK (calculation_method IN (
    'flat_per_stay',
    'per_night',
    'per_room_per_night',
    'per_person',
    'per_person_per_night',
    'percentage_of_accommodation'
  )) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'ZAR',
  percentage_apply_to VARCHAR(50) DEFAULT 'subtotal',
  min_cap DECIMAL(10,2),
  max_cap DECIMAL(10,2),
  
  -- Applicability
  applies_to_all_rooms BOOLEAN DEFAULT true,
  room_type_ids UUID[] DEFAULT '{}',
  rate_type_ids UUID[] DEFAULT '{}',
  
  -- Conditions
  min_nights INTEGER DEFAULT 0,
  max_nights INTEGER DEFAULT 0,
  applies_to_adults BOOLEAN DEFAULT true,
  applies_to_children BOOLEAN DEFAULT false,
  applies_to_infants BOOLEAN DEFAULT false,
  
  -- Refund Behavior
  is_refundable BOOLEAN DEFAULT false,
  refund_timing VARCHAR(20) CHECK (refund_timing IN ('on_checkout', 'after_inspection', 'manual')),
  refund_type VARCHAR(20) CHECK (refund_type IN ('full', 'partial')),
  partial_refund_percentage DECIMAL(5,2),
  
  -- Metadata
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  pms_external_id VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for property lookups
CREATE INDEX idx_property_charges_property ON property_charges(property_id);

-- RLS policies
ALTER TABLE property_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view charges for active properties"
  ON property_charges FOR SELECT
  USING (is_property_active(property_id));

CREATE POLICY "Admins and devs can manage all charges"
  ON property_charges FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

CREATE POLICY "Owners can manage own property charges"
  ON property_charges FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      JOIN profiles pr ON p.owner_email = pr.email
      WHERE p.id = property_charges.property_id
      AND pr.id = auth.uid()
    )
  );
```

### 1.2 Create `charge_presets` Table

```sql
CREATE TABLE charge_presets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(20) NOT NULL,
  default_calculation_method VARCHAR(30),
  default_description TEXT,
  is_common BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pre-populate with industry standards
INSERT INTO charge_presets (name, category, default_calculation_method, default_description, display_order) VALUES
  ('VAT / Sales Tax', 'tax', 'percentage_of_accommodation', 'Value Added Tax', 1),
  ('Tourism Levy', 'tax', 'percentage_of_accommodation', 'Local tourism promotion fee', 2),
  ('Cleaning Fee', 'fee', 'flat_per_stay', 'One-time cleaning service', 3),
  ('Security Deposit', 'deposit', 'flat_per_stay', 'Refundable damage deposit', 4),
  ('Resort Fee', 'fee', 'per_night', 'Access to resort amenities', 5),
  ('Extra Guest Fee', 'surcharge', 'per_person_per_night', 'Additional guest charge', 6),
  ('Pet Fee', 'surcharge', 'flat_per_stay', 'Pet accommodation fee', 7),
  ('Late Check-out Fee', 'fee', 'flat_per_stay', 'Extended checkout time', 8),
  ('Airport Transfer', 'fee', 'flat_per_stay', 'Return airport transfer', 9);
```

### 1.3 Add `charges_breakdown` to Bookings

```sql
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS charges_breakdown JSONB DEFAULT '{}';

COMMENT ON COLUMN bookings.charges_breakdown IS 
  'Frozen snapshot of charges at booking time for immutability';
```

---

## Phase 2: Core Admin UI Components

### 2.1 New Files Structure

```text
src/components/charges/
  AdditionalChargesManager.tsx    -- Main management interface
  ChargeEditor.tsx                -- Sheet/drawer for editing single charge
  ChargePreview.tsx               -- Guest-facing preview panel
  CopyChargesModal.tsx            -- Bulk copy to other properties
  ChargeCalculator.ts             -- Utility functions for calculations
  index.ts                        -- Barrel exports
```

### 2.2 `AdditionalChargesManager` Component

**Location**: Accessible from PropertyForm.tsx Rates tab or as a new "Charges" sub-tab

**Features**:
- Table displaying all property charges with:
  - Name, Category (badge), Calculation method, Amount
  - Active toggle
  - Drag handle for reordering (using `@dnd-kit/sortable`)
- "Add Charge" button opens ChargeEditor sheet
- Bulk operations toolbar (enable/disable selected, delete)
- "Copy to Other Properties" action
- "Sync from PMS" button (Hostfully-connected properties only)
- Preview panel toggle showing guest view

**Key State**:
```typescript
interface PropertyCharge {
  id: string;
  property_id: string;
  name: string;
  internal_code: string;
  category: 'tax' | 'fee' | 'deposit' | 'surcharge' | 'custom';
  calculation_method: ChargeCalculationMethod;
  amount: number;
  currency: string;
  percentage_apply_to?: string;
  min_cap?: number;
  max_cap?: number;
  applies_to_all_rooms: boolean;
  room_type_ids: string[];
  rate_type_ids: string[];
  min_nights: number;
  max_nights: number;
  applies_to_adults: boolean;
  applies_to_children: boolean;
  applies_to_infants: boolean;
  is_refundable: boolean;
  refund_timing?: 'on_checkout' | 'after_inspection' | 'manual';
  refund_type?: 'full' | 'partial';
  partial_refund_percentage?: number;
  description?: string;
  display_order: number;
  is_active: boolean;
  pms_external_id?: string;
}

type ChargeCalculationMethod = 
  | 'flat_per_stay'
  | 'per_night'
  | 'per_room_per_night'
  | 'per_person'
  | 'per_person_per_night'
  | 'percentage_of_accommodation';
```

### 2.3 `ChargeEditor` Component (Sheet)

**Structure**: Tabbed interface within a Sheet component

**Tabs**:

1. **Basic Info**
   - Preset dropdown (from charge_presets table) OR custom name
   - Category select (tax/fee/deposit/surcharge/custom)
   - Description textarea

2. **Calculation**
   - Method dropdown with clear descriptions
   - Amount input with currency selector
   - For percentage: min/max cap inputs, "apply to" selector

3. **Applicability**
   - "Applies to all rooms" toggle
   - Room type multi-select (if not all)
   - Rate type multi-select
   - Guest type checkboxes (adults/children/infants)
   - Night range inputs (min/max, 0 = no limit)

4. **Refund Behavior** (collapsed by default, expands on toggle)
   - "Is refundable" toggle
   - Refund timing select
   - Refund type select
   - Partial percentage input (if partial)

### 2.4 `ChargePreview` Component

**Purpose**: Shows exactly how guest will see charges at checkout

**Layout** (matching Hostfully's clean breakdown):
```text
RENT
  2 nights × Deluxe Room           ZAR 1,800

TAXES
  VAT (15%)                          ZAR 270

FEES
  Cleaning Fee                       ZAR 350
  Resort Fee (2 nights)              ZAR 200

DEPOSITS (Refundable)
  Security Deposit                   ZAR 1,000
  (Refunded after inspection)

─────────────────────────────────────
TOTAL                              ZAR 3,620
  (Includes ZAR 1,000 refundable)
```

### 2.5 `CopyChargesModal` Component

**Trigger**: Checkbox at bottom of AdditionalChargesManager

**Flow**:
1. Fetch properties with same `owner_email`
2. Display checklist with property names and current charge counts
3. Options:
   - Replace all existing charges
   - Merge (skip duplicates by internal_code)
4. Preview changes before confirming
5. Execute bulk upsert

---

## Phase 3: Charge Calculation Engine

### 3.1 `ChargeCalculator.ts` Utility

```typescript
interface ChargeCalculationContext {
  subtotal: number;          // Accommodation cost
  nights: number;
  rooms: number;
  adults: number;
  children: number;
  infants: number;
  roomTypeId?: string;
  rateTypeId?: string;
}

interface CalculatedCharge {
  charge: PropertyCharge;
  calculatedAmount: number;
  breakdown: string;  // Human-readable explanation
}

function calculateCharges(
  charges: PropertyCharge[],
  context: ChargeCalculationContext
): CalculatedCharge[] {
  // Filter applicable charges based on:
  // - is_active
  // - room_type_ids (if not applies_to_all_rooms)
  // - rate_type_ids
  // - min/max nights
  // - guest type applicability
  
  // Calculate each charge based on method:
  // - flat_per_stay: amount
  // - per_night: amount × nights
  // - per_room_per_night: amount × rooms × nights
  // - per_person: amount × (adults + children if applicable)
  // - per_person_per_night: amount × persons × nights
  // - percentage_of_accommodation: subtotal × (amount/100), with caps
  
  // Return sorted by category, then display_order
}

function groupChargesByCategory(charges: CalculatedCharge[]): {
  taxes: CalculatedCharge[];
  fees: CalculatedCharge[];
  deposits: CalculatedCharge[];
  surcharges: CalculatedCharge[];
  custom: CalculatedCharge[];
} {
  // Group for display
}

function getTotals(charges: CalculatedCharge[]): {
  total: number;
  refundableTotal: number;
  nonRefundableTotal: number;
} {
  // Sum with refundable distinction
}
```

---

## Phase 4: Checkout Integration

### 4.1 Update `Booking.tsx` Cost Calculation

**Modify** the existing `calculateCost` function to:

1. After calculating accommodation subtotal, fetch property charges:
```typescript
const { data: propertyCharges } = await supabase
  .from('property_charges')
  .select('*')
  .eq('property_id', property.id)
  .eq('is_active', true)
  .order('display_order');
```

2. Calculate applicable charges using ChargeCalculator
3. Add to cost breakdown display
4. Update total

### 4.2 Update Checkout Summary UI

**Add new sections** after accommodation line items:

```tsx
{/* Taxes Section */}
{calculatedCharges.taxes.length > 0 && (
  <div className="border-t pt-3 mt-3">
    <div className="text-xs font-medium text-muted-foreground mb-2">TAXES</div>
    {calculatedCharges.taxes.map(charge => (
      <div key={charge.charge.id} className="flex justify-between text-sm">
        <span>{charge.charge.name}</span>
        <FormattedPrice amount={charge.calculatedAmount} />
      </div>
    ))}
  </div>
)}

{/* Fees Section */}
{calculatedCharges.fees.length > 0 && (
  <div className="border-t pt-3 mt-3">
    <div className="text-xs font-medium text-muted-foreground mb-2">FEES</div>
    {/* Similar mapping */}
  </div>
)}

{/* Deposits Section (with refundable badge) */}
{calculatedCharges.deposits.length > 0 && (
  <div className="border-t pt-3 mt-3 bg-green-50/50 -mx-4 px-4 py-3">
    <div className="text-xs font-medium text-green-700 mb-2 flex items-center gap-1">
      <CheckCircle className="h-3 w-3" />
      REFUNDABLE DEPOSITS
    </div>
    {calculatedCharges.deposits.map(charge => (
      <div key={charge.charge.id} className="flex justify-between text-sm">
        <div>
          <span>{charge.charge.name}</span>
          <span className="text-xs text-muted-foreground ml-2">
            (Refunded {charge.charge.refund_timing === 'on_checkout' ? 'at checkout' : 'after inspection'})
          </span>
        </div>
        <FormattedPrice amount={charge.calculatedAmount} />
      </div>
    ))}
  </div>
)}
```

### 4.3 Freeze Charges on Booking Confirmation

**In `createBookingMutation`**, add charges snapshot:

```typescript
const chargesSnapshot = {
  snapshot_at: new Date().toISOString(),
  charges: calculatedCharges.map(c => ({
    ...c.charge,
    calculatedAmount: c.calculatedAmount,
    breakdown: c.breakdown,
  })),
  totals: {
    charges_total: chargesTotal,
    refundable_total: refundableTotal,
    grand_total: accommodationTotal + chargesTotal,
  },
};

// Include in booking insert
charges_breakdown: chargesSnapshot,
```

---

## Phase 5: PropertyForm Integration

### 5.1 Add "Charges" Sub-tab in Rates Tab

**Location**: PropertyForm.tsx, within the "rates" TabsContent

**Insert after existing rates content**:

```tsx
<Separator className="my-6" />

<div className="space-y-4">
  <div className="flex items-center justify-between">
    <div>
      <h3 className="text-lg font-medium">Additional Charges</h3>
      <p className="text-sm text-muted-foreground">
        Taxes, fees, and deposits applied to bookings
      </p>
    </div>
    <Badge variant="outline">
      {propertyCharges?.length || 0} active
    </Badge>
  </div>
  
  <AdditionalChargesManager
    propertyId={propertyId}
    pmsSystem={selectedPMS}
    ownerEmail={formData.owner_email}
  />
</div>
```

---

## Phase 6: PMS Integration (Hostfully)

### 6.1 Add Sync Action to hostfully-api Edge Function

**New action**: `sync_charges`

```typescript
case 'sync_charges':
  // Fetch fees from Hostfully API
  const feesResponse = await fetch(
    `${baseUrl}/v2/fees?propertyUid=${creds.property_uid}`,
    { headers: { 'X-HOSTFULLY-APIKEY': apiKey } }
  );
  
  // Map Hostfully fee structure to property_charges:
  // - Hostfully "tax" → category: 'tax'
  // - Hostfully "fee" → category: 'fee'
  // - Hostfully "securityDeposit" → category: 'deposit', is_refundable: true
  
  // Upsert to property_charges with pms_external_id
  break;
```

### 6.2 Push Charges to PMS on Save

**Optional future enhancement**: When saving charges for Hostfully properties, sync back to PMS

---

## Phase 7: React Query Hooks

### 7.1 `usePropertyCharges` Hook

```typescript
// src/hooks/usePropertyCharges.tsx

export function usePropertyCharges(propertyId: string | null) {
  const queryClient = useQueryClient();
  
  const chargesQuery = useQuery({
    queryKey: ['property-charges', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_charges')
        .select('*')
        .eq('property_id', propertyId)
        .order('display_order');
      if (error) throw error;
      return data;
    },
    enabled: !!propertyId,
  });
  
  const presetsQuery = useQuery({
    queryKey: ['charge-presets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('charge_presets')
        .select('*')
        .eq('is_common', true)
        .order('display_order');
      if (error) throw error;
      return data;
    },
  });
  
  const createCharge = useMutation({/* ... */});
  const updateCharge = useMutation({/* ... */});
  const deleteCharge = useMutation({/* ... */});
  const reorderCharges = useMutation({/* ... */});
  const copyCharges = useMutation({/* ... */});
  
  return {
    charges: chargesQuery.data || [],
    presets: presetsQuery.data || [],
    isLoading: chargesQuery.isLoading,
    createCharge,
    updateCharge,
    deleteCharge,
    reorderCharges,
    copyCharges,
  };
}
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/XXXX_property_charges.sql` | Create | Database schema for charges |
| `src/components/charges/AdditionalChargesManager.tsx` | Create | Main management UI |
| `src/components/charges/ChargeEditor.tsx` | Create | Sheet editor for single charge |
| `src/components/charges/ChargePreview.tsx` | Create | Guest-facing preview |
| `src/components/charges/CopyChargesModal.tsx` | Create | Bulk copy functionality |
| `src/components/charges/ChargeCalculator.ts` | Create | Calculation utilities |
| `src/components/charges/index.ts` | Create | Barrel exports |
| `src/hooks/usePropertyCharges.tsx` | Create | React Query hook |
| `src/pages/PropertyForm.tsx` | Modify | Add charges section to Rates tab |
| `src/pages/Booking.tsx` | Modify | Integrate charge calculations |
| `supabase/functions/hostfully-api/index.ts` | Modify | Add sync_charges action |
| `src/integrations/supabase/types.ts` | Auto-update | Types regenerated from schema |

---

## Implementation Order

1. **Database Migration** - Create tables, indexes, RLS policies, seed presets
2. **Types & Utilities** - ChargeCalculator, TypeScript interfaces
3. **React Query Hook** - usePropertyCharges with CRUD operations
4. **UI Components** - ChargeEditor, AdditionalChargesManager, ChargePreview
5. **PropertyForm Integration** - Add to Rates tab
6. **Checkout Integration** - Update Booking.tsx cost calculation and display
7. **PMS Sync** - Hostfully integration for sync_charges action
8. **Copy Feature** - CopyChargesModal for multi-property management

---

## Technical Considerations

- **Drag-and-drop**: Use existing patterns or add `@dnd-kit/sortable` for reordering
- **Form validation**: Zod schemas for ChargeEditor form
- **Optimistic updates**: Use TanStack Query's optimistic update pattern
- **Error boundaries**: Wrap components for graceful error handling
- **Mobile responsiveness**: ChargeEditor as full-screen modal on mobile
- **Accessibility**: ARIA labels for category groups, keyboard navigation

---

## Acceptance Criteria

**Admin Can:**
- Add, edit, delete property charges
- Choose from preset charge types or create custom
- Set calculation methods (flat, per night, percentage, etc.)
- Mark charges as refundable with timing options
- Copy charges to other owned properties
- Preview guest-facing display
- Sync charges from Hostfully PMS

**Guest Sees:**
- Clear breakdown before payment (RENT, TAXES, FEES, DEPOSITS)
- Refundable items clearly marked with green highlight
- Total with refundable amount noted
- No surprise fees at checkout

**System:**
- Stores immutable charge snapshot with booking
- Calculates totals correctly for all methods
- Handles PMS sync conflicts gracefully
- Maintains audit trail via existing audit system

