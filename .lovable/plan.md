

# Fix Property Fonts, Dark Mode Sidebar, and Command Centre Room Names

## Three Issues

### 1. Jongensfontein Properties Missing Custom Fonts
The 4 properties were seeded without `brand_heading_font` / `brand_body_font`. Based on jongensfontein.com's design (coastal, relaxed serif headings), we'll set appropriate Google Fonts via a database update:
- **Heading font**: `Playfair Display` (elegant serif, matches coastal luxury feel)
- **Body font**: `Lato` (clean, readable sans-serif)

**Action**: Database update on `properties` table — set `brand_heading_font` and `brand_body_font` for all 4 properties matching owner "Julius Erasmus".

### 2. Dark Mode Sidebar Hard to Read
The PMS sidebar in dark mode uses `text-foreground/70` for inactive items (which at `40 6% 95%` × 0.7 opacity on a `220 18% 10%` background is low contrast). The group labels use `text-muted-foreground/60` — even worse.

**Fix in `PMSSidebar.tsx`**:
- Inactive nav items: change `text-foreground/70` → `text-foreground/80`
- Group labels: change `text-muted-foreground/60` → `text-muted-foreground/80`
- Also improve the footer "Back to ROL" button contrast

**Fix in `src/index.css`** dark mode section:
- Bump `--muted-foreground` from `220 10% 60%` to `220 10% 65%` for better base readability
- Bump `--sidebar-accent` from `220 15% 16%` to `220 15% 20%` for better hover contrast

### 3. Command Centre Shows Internal Room Type IDs
Line 107 of `PMSCommandCentre.tsx` maps `external_room_type_id` directly as the display name — resulting in UUIDs being shown in the grid.

**Fix in `PMSCommandCentre.tsx`**:
- After fetching availability cache data, also fetch `rolos_room_types` for the same property IDs: `select('id, name, property_id')`
- Build a lookup map: `roomTypeId → name`
- On line 107, resolve: `room_type_name: roomTypeMap[r.external_room_type_id] || r.external_room_type_id`
- This shows "3-Bedroomed Holiday House" instead of a UUID

## Files

| Action | File | What |
|--------|------|------|
| DB update | `properties` table | Set fonts for 4 Jongensfontein properties |
| Modify | `src/components/layout/PMSSidebar.tsx` | Increase text opacity for dark mode readability |
| Modify | `src/index.css` | Adjust dark mode muted-foreground and sidebar-accent values |
| Modify | `src/pages/pms/PMSCommandCentre.tsx` | Fetch `rolos_room_types` names and resolve IDs to human-readable labels |

