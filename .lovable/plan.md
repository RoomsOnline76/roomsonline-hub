

# ROL'OS White-Label PMS — Implementation Plan

## Overview

Properties using ROL'OS as their PMS need the entire PMS module UI to reflect **their brand identity** — not ROL's pink. This means the sidebar, PMS pages, emails, and stationery all render under the property's own logo and colours, with ROL relegated to a subtle "Powered by ROL'OS" footer.

## Current State

- **BrandingTab** already exists in the property editor — allows logo, primary/secondary/font colour uploads with WCAG contrast validation
- **`useBrandOverride` hook** injects CSS custom properties into `:root` for the public booking flow
- **PMS pages** (Dashboard, Rooms, Rate Plans, Guests, Housekeeping, Reports) all use `AppLayout` which renders the ROL-branded sidebar with ROL logo, "ROL'OS PMS" labels, and ROL pink throughout
- Brand data is stored on the `properties` table (`brand_override_enabled`, `brand_primary_color`, etc.)

The branding system currently only applies to the **public showcase/booking flow**. It does not apply to the **internal PMS module** at all.

## What to Build

### 1. PMS Brand Context Provider

Create a `PMSBrandProvider` context that wraps all `/pms/*` routes. When a `?property=<id>` is present and the property is a ROL property with branding enabled:

- Fetches the property's brand config (logo, colours)
- Applies CSS custom properties via `applyBrandToDocument()` (reusing existing infrastructure)
- Exposes brand data (logo URL, property name, colours) to all child components
- On unmount/property change, cleans up CSS vars

This replaces the ROL pink with the property's palette across all buttons, badges, accents, and cards within the PMS module automatically — since the UI already uses `hsl(var(--primary))` etc.

### 2. White-Labeled PMS Layout

Create a `PMSLayout` wrapper component that replaces `AppLayout` for PMS routes:

- **Sidebar**: Replace the ROL logo with the property's logo. Replace "ROL'OS PMS" section label with the property name. Keep nav items identical but styled with property brand colours.
- **Footer**: Add a subtle "Powered by ROL'OS" text in the sidebar footer and on each page footer, using muted styling.
- **Header area on each PMS page**: Show property logo + name instead of hardcoded "ROL'OS Native PMS" text.

### 3. Dedicated Branding & Stationery Configuration Page

New route: `/pms/branding` — a dedicated page (added to PMS nav) where property owners can:

- **Brand Identity**: Upload/change logo, set primary/secondary/font colours (reuse `BrandingTab` component or its internals)
- **Stationery Settings** (new fields on `properties` table or a new `rolos_brand_config` table):
  - Business name (as it appears on invoices/folios)
  - Business address
  - VAT/Tax number
  - Email footer text
  - Custom tagline
  - Favicon URL (optional)
- **Live Preview**: Real-time preview card showing how the PMS dashboard, folio header, and email header will look with the current brand settings
- **"Powered by" control**: Read-only display confirming ROL'OS attribution remains in footers

### 4. Database Extension

Add a new table `rolos_brand_config` to store stationery/business identity fields per property:

```sql
CREATE TABLE rolos_brand_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE UNIQUE,
  business_name text,
  business_address jsonb,
  vat_number text,
  email_footer_text text,
  custom_tagline text,
  favicon_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

With RLS: property owners can read/write their own; admins/devs can read all.

### 5. Sanitize Hardcoded ROL References in PMS Pages

Audit and replace all hardcoded ROL references in PMS components:

| File | Current | Replacement |
|------|---------|-------------|
| `PMSDashboard.tsx` | `"ROL'OS Native PMS"` heading | Property name from brand context |
| `PMSDashboard.tsx` | `<Badge>ROL'OS PMS</Badge>` | Remove or replace with property tagline |
| `AppSidebar.tsx` | `"ROL'OS PMS"` section label | Property name (from context) |
| `AppSidebar.tsx` | ROL logo in sidebar header | Property logo when in PMS context |
| All PMS pages | `<AppLayout>` wrapper | `<PMSLayout>` wrapper with brand context |

### 6. Footer Component

Create a reusable `<PoweredByRolOS />` component:
- Renders: `Powered by ROL'OS` in small muted text
- Used in: PMS layout footer, folio print views, email templates
- Non-removable by property owners

## Sequencing

1. **Migration**: Create `rolos_brand_config` table + RLS
2. **PMSBrandProvider**: Context + CSS var injection for PMS routes
3. **PMSLayout**: White-labeled layout replacing AppLayout for PMS
4. **PoweredByRolOS**: Footer component
5. **Sanitize PMS pages**: Replace hardcoded ROL refs, swap to PMSLayout
6. **Branding config page**: `/pms/branding` with stationery settings
7. **Update sidebar**: Conditional logo/label swap when in PMS context

## Technical Notes

- Reuses existing `brandOverride.ts` utilities (hexToHsl, autoForeground, applyBrandToDocument) — no duplication
- CSS custom property injection means all shadcn/ui components automatically inherit the property brand with zero per-component changes
- The `PMSBrandProvider` cleans up on unmount so navigating out of `/pms` restores ROL branding

