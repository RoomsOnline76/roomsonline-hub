# Bring Rooms back into the ROL'OS menu

## What I verified first

- The Room Inventory page itself is intact and still works: `/pms/rooms` renders the portfolio/single Room Type Plan, reservation finder, status filters and room cards exactly as in your screenshot (confirmed by loading the page in a browser).
- The menu definition still contains a Rooms entry, but it now sits in a separate **Operations** group further down the list, while the top **Front Desk** group leads with **Bookings** (`/pms/bookings`, the admin reservations list). So the prominent slot Rooms used to occupy is taken by Bookings, which is what reads as "Rooms is gone".
- Permissions are not the cause: the Dassiesingel / Fonteinhutte logins are `general_manager`, which has full Rooms access, and owners/platform users see every module.

## What to change

1. **Rooms returns to the top of the working menu.** In the shared ROL'OS nav config, Rooms moves back into the first group right after Dashboard, so it is the first operational page in the sidebar again — same label, same icon, same `/pms/rooms` target.
2. **Bookings stops occupying that slot.** The reservations list moves down (below Guests) so it is still reachable but no longer displaces Room Inventory as the primary front-desk surface.
3. **Mobile bottom nav follows suit.** The mobile quick-nav ordering is updated to the same priority (Dashboard, Rooms, Guests, Channels) so the phone bar matches the sidebar.
4. **No change to the Rooms page, its route, or any bookings functionality** — this is menu ordering only.

## Technical notes

- Single source of truth: `pmsNavGroups` in `src/components/layout/PMSSidebar.tsx` (consumed by both the desktop sidebar and `PmsMobileBottomNav.tsx`).
- Reorder items only; module keys (`rooms`, `bookings`), hrefs and the permission matrix in `src/lib/pmsPermissions.ts` stay untouched.
- Update the `preferred` array in `src/components/layout/PmsMobileBottomNav.tsx` to keep desktop and mobile in sync.

## If that is not what you are seeing

If Rooms is genuinely absent from your sidebar (not just moved down), tell me and I will add a diagnostic: the sidebar will log which modules resolved for your login so we can pin the gating rule instead of reordering.
