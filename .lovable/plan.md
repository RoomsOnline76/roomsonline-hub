

## Plan: ROL'OS Integrations Menu & Property Overview Tab with Documentation

### Summary
Add integrations access to ROL'OS PMS sidebar menu, create a conditional "Integrations" tab in Property Overview (visible only for ROL properties), and include comprehensive implementation documentation for each integration type.

---

### 1. Add Integrations to ROL'OS PMS Sidebar

**File:** `src/config/navigation.ts`

Add new menu item to `pmsSection.items`:
```typescript
{ id: 'pms-integrations', title: 'Integrations', icon: Code2, href: '/pms/integrations', minRole: 'owner', description: 'Website widgets & embeds' }
```

---

### 2. Create PMS Integrations Page

**New file:** `src/pages/pms/PMSIntegrations.tsx`

- Uses `usePmsPropertyId()` hook to resolve current ROL property
- Reuses existing integration components (`DirectLinkTab`, `WidgetTab`, `BookingBarTab`, `FullEmbedTab`, `WordPressTab`, `ApiTab`)
- Wraps in `PMSLayout` with ROL'OS branding
- Includes property selector dropdown for multi-property owners

---

### 3. Add Route for PMS Integrations

**File:** `src/App.tsx`

Register route:
```typescript
<Route path="/pms/integrations" element={<PMSIntegrations />} />
```

Update `src/pages/pms/index.ts` to export `PMSIntegrations`.

---

### 4. Add Conditional "Integrations" Tab to Property Overview

**File:** `src/pages/PropertyOverview.tsx`

- Add new tab: "Integrations" (only visible when selected property has `is_rol_property = true`)
- Tab content displays integration options for that specific property
- Uses existing integration tab components with `property` prop

---

### 5. Create Documentation Components

**New file:** `src/components/integrations/IntegrationDocumentation.tsx`

Comprehensive documentation for each integration type:

| Integration | Documentation Sections |
|------------|----------------------|
| **Direct Link** | When to use, URL parameters, tracking query strings, email/social usage |
| **Widget** | iframe vs JS embed, sizing, responsive behavior, CSS customization |
| **Booking Bar** | Fixed positioning, z-index considerations, mobile behavior |
| **Full Embed** | Dedicated page setup, height management, cross-origin communication |
| **WordPress** | Plugin installation, shortcode attributes, theme compatibility |
| **API** | Authentication, rate limits, endpoint reference, error handling |

Each section includes:
- Use case overview
- Step-by-step implementation
- Code examples
- Troubleshooting tips
- Best practices

---

### 6. Technical Details

**Integration components reuse:**
- All existing integration components accept a `property` object
- `DomainWhitelist` component available for security configuration
- `IntegrationAnalytics` shows engagement metrics

**Conditional tab visibility:**
```typescript
{selectedProperty?.is_rol_property && (
  <TabsTrigger value="integrations">Integrations</TabsTrigger>
)}
```

**Documentation structure:**
- Collapsible accordion for each integration type
- "Quick Start" + "Advanced" sections
- Copy-to-clipboard code blocks
- External resource links where applicable

