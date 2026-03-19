

# Per-Property Payment Provider Selection

## Current State
- The `properties` table already has a `payment_provider` column (nullable string)
- Payment gateway is currently resolved globally via `supporting_systems` table + `useActivePaymentGateway` hook
- The hook only supports "payfast" or "paygate" and ignores the per-property `payment_provider` field entirely

## What Changes

### 1. New shared component: `PropertyPaymentProviderSelect`
**File:** `src/components/integrations/PropertyPaymentProviderSelect.tsx`

A reusable card with a dropdown listing all 14 payment providers. Each option shows name + website. Reads/writes `properties.payment_provider`. Default label: "Platform Default (PayFast/PayGate)" when null.

Provider list (stored values → display labels):
`payfast`, `paygate`, `peach`, `yoco`, `ozow`, `dpo`, `addpay`, `payflex`, `stitch`, `ikhokha`, `snapscan`, `zapper`, `flutterwave`, `stripe`

### 2. Add to PMS Integrations page
**File:** `src/pages/pms/PMSIntegrations.tsx`
- Import `PropertyPaymentProviderSelect`
- Render it between the Property Context Card and the Integration Tabs
- Pass `propertyId` prop

### 3. Add to Admin Property Edit (Integrations tab)
**File:** `src/components/property/PropertyFormIntegrationsTab.tsx`
- Import `PropertyPaymentProviderSelect`
- Render it at the top of the integrations tab, above the Widget Toolkit card
- Pass `propertyId={property.id}` prop

### 4. Add to Admin Integrations page
**File:** `src/pages/AdminIntegrations.tsx`
- Import `PropertyPaymentProviderSelect`
- Render it between the PayFast Environment Toggle and the Integration Analytics
- Pass `propertyId={selectedProperty}` prop

### 5. Update `useActivePaymentGateway` hook
**File:** `src/hooks/useActivePaymentGateway.tsx`
- Accept optional `propertyId` parameter
- When provided, first check `properties.payment_provider` for that property
- If property has a specific provider set (not null/not "default"), return that
- Otherwise fall back to the existing global `supporting_systems` lookup
- Expand `PaymentGateway` type to include all 14 providers

### No database migration needed
The `payment_provider` column already exists on the `properties` table as a nullable string. No schema change required.

