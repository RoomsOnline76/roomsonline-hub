

# Add Inline Affiliate Disclosure — Tastefully, Only Where Needed

## Where Booking.com Affiliate Links Actually Appear

After reviewing the codebase, external (NightsBridge/Booking.com) links appear in exactly these surfaces:

1. **`LeavingRoomsOnlineModal`** — the interstitial shown when users click to book externally
2. **`StickyBookingCTA`** — when `isExternal=true`, shows "Book Now" with external link icon
3. **`BookingSidebar`** — receives `isExternal` prop on property pages
4. **`PublicFooter`** — already links to `/affiliate-disclosure`

The itinerary builder and non-external property pages do **not** link to Booking.com and need nothing.

## Design Approach: Subtle, Not Terrible

- **Create a reusable `<AffiliateNotice />` component** — a single `text-xs text-muted-foreground` line, conditionally rendered only when `isExternal` is true
- **No garish banners** — just a quiet footnote-style line beneath the relevant CTA
- Keep it legally compliant but visually unobtrusive

## Changes

### 1. Create `src/components/AffiliateNotice.tsx`
A tiny reusable component with a `Link` to `/affiliate-disclosure`:
```
As a Booking.com affiliate, we earn from qualifying bookings.
This comes at no extra cost to you. Learn more.
```
Styled as `text-xs text-muted-foreground/70` — barely visible unless you look for it.

### 2. Add to `LeavingRoomsOnlineModal` (most important)
Place the notice inside the modal body, below the existing "third-party booking system" text. This is the moment of highest intent — legally the most important placement.

### 3. Add to `BookingSidebar` (when `isExternal`)
Below the CTA button, render `<AffiliateNotice />` only when `isExternal={true}`.

### 4. Add to `StickyBookingCTA` (when `isExternal`)
Below the main CTA button area, same conditional render.

### 5. Footer already handled
`/affiliate-disclosure` link already exists in the footer.

## Files

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/components/AffiliateNotice.tsx` | Reusable inline disclosure |
| Modify | `src/components/LeavingRoomsOnlineModal.tsx` | Add notice in modal body |
| Modify | `src/components/showcase/BookingSidebar.tsx` | Add notice below CTA when external |
| Modify | `src/components/showcase/StickyBookingCTA.tsx` | Add notice below CTA when external |

