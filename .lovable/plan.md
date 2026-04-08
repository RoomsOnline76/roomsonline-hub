

# Collapsible Categories + Category-Aware Status Report Email

## 1. Collapsible category sections in `/admin-keys`

**File: `src/pages/AdminKeys.tsx`**

Currently the page has flat `<div>` sections with `<h2>` headings for each category (ROL'OS PMS, Property Management Systems, Channel Managers, Financial Services, Additional Services, External Tools). These are always expanded.

**Change**: Wrap each category section in a collapsible `<Collapsible>` component (from `@/components/ui/collapsible`) with a clickable header that toggles open/closed. Default state: **collapsed**. Each section header shows the category name + a chevron icon that rotates on expand.

Use `Collapsible`, `CollapsibleTrigger`, and `CollapsibleContent` from the existing shadcn/ui collapsible component. Each category gets its own state toggle (or use a single `Set<string>` of open sections).

Sections to make collapsible:
- ROL'OS PMS (Internal)
- Property Management Systems
- Channel Managers
- Financial Services
- Additional Services
- External Tools

## 2. Update status report email to include categories and all systems

**File: `supabase/functions/send-pms-status-report/index.ts`**

Currently the email lists all systems in a single flat table sorted by integration status. The `getPMSDisplayName` map is also missing newer systems (Channex, Airbnb, Expedia, Agoda, Google Hotels, Lekkeslaap, HyperGuest).

**Changes**:

1. **Add missing systems to `getPMSDisplayName`**: Add entries for `channex` → "Channex.io", `airbnb` → "Airbnb", `expedia` → "Expedia", `agoda` → "Agoda", `google_hotels` → "Google Hotels", `lekkeslaap` → "Lekkeslaap", `hyperguest` → "HyperGuest", `booking_com` → "Booking.com".

2. **Add a category mapping** (mirroring `pmsSystemsConfig.ts`): A `const CHANNEL_MANAGERS` set containing all channel manager keys. Systems not in the set are PMS.

3. **Split the status table into two sections** in the HTML: "Property Management Systems" table and "Channel Managers" table — each with its own heading, same column structure, same styling.

4. **Update summary cards** to show counts per category (e.g., "PMS: 8 systems" / "Channels: 12 systems") or keep existing summary but ensure all systems are counted.

## Files

| File | Change |
|---|---|
| `src/pages/AdminKeys.tsx` | Wrap each category section in `Collapsible` (default collapsed) |
| `supabase/functions/send-pms-status-report/index.ts` | Add missing system names, split table by PMS vs Channel Manager category |

