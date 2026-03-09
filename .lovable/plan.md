

# UX Audit & Optimization Plan

## Analysis Findings

### 1. Accessibility Gaps (WCAG)
- **No skip-to-content link** anywhere in the app — keyboard users must tab through entire nav on every page load
- **Missing `aria-label`s**: Only 2 instances across all public pages (Home hero + menu button). PropertyCard images, footer links, mobile nav buttons, and search form elements all lack accessible labels
- **Empty `alt=""` on brand logos** in `EmbedProperty.tsx` and `PMSBranding.tsx` — decorative is OK but brand logos convey meaning
- **Color contrast**: Hero overlay text at `text-white/70` and `text-white/60` risks failing WCAG AA on light backgrounds
- **Mobile nav**: Bottom nav buttons have no `aria-label` — screen readers get icon-only labels

### 2. Performance Issues
- **Zero code splitting**: All 60+ page imports are eagerly loaded in `App.tsx` — every visitor downloads the entire admin/PMS/dev bundle. This is the single biggest performance win available
- **PropertyCard images**: No `loading="lazy"` — all property cards in segments load all images immediately
- **Hero image**: Uses CSS `background-image` (no lazy load, no `<img>` optimization, no format negotiation)
- **Google Fonts**: Two font families loaded render-blocking via `@import` in CSS

### 3. UX Pain Points
- **Home page (855 lines)**: Hamburger menu uses custom click-outside logic instead of a proper accessible Sheet/Dialog — no keyboard trap, no Escape key, no focus management
- **PublicHeader mobile menu**: Emoji icons (📖👥🔗🔒📋✉️) instead of Lucide icons — inconsistent with rest of UI, poor screen reader experience
- **Auth page (1,047 lines)**: Very long monolith with login, signup, password reset, recovery, and access request all in one component
- **No loading/skeleton state on Home hero**: `isLoadingHero` fades in but shows nothing during load — flash of empty black
- **Footer**: Minimal — no logo, no tagline, no social links. Doesn't match the "luxury editorial" brand

### 4. Inconsistencies
- **Home page has its own nav/header** (not using `PublicHeader`) — two separate navigation implementations with different behavior
- **Home mobile menu** uses emoji icons; `PublicHeader` mobile menu also uses emojis. Desktop nav in `PublicHeader` uses no icons. Three different patterns
- **`theme-color` in manifest/index.html is `#000000`** — should be brand pink `#e91e8c` or the warm neutral background

---

## Implementation Plan

### Phase A — Performance (Highest Impact)

**1. Route-level code splitting with `React.lazy`**
Split all non-public pages into lazy chunks. Public pages (Home, PropertyShowcase, Booking, Auth, About, Contact, Journals, Privacy, Terms) stay eager. All admin, PMS, dev, and dashboard pages become lazy.

- Add `Suspense` wrapper with a minimal spinner in `App.tsx`
- Convert ~40 admin/PMS/dev imports to `React.lazy(() => import(...))`
- **Impact**: ~60-70% reduction in initial bundle for public visitors

**2. Add `loading="lazy"` to PropertyCard images**
- `PropertyCard.tsx`: Add `loading="lazy"` to the `<img>` tag
- Public-facing property grid loads 20+ images; lazy loading defers below-fold images

**3. Preconnect Google Fonts**
- Add `<link rel="preconnect" href="https://fonts.googleapis.com">` to `index.html`
- Move font import from CSS `@import` to `<link>` tag in `index.html` for faster loading

### Phase B — Accessibility (WCAG AA)

**4. Skip-to-content link**
- Add a visually-hidden, focus-visible skip link as first element in `PublicLayout` and `AppLayout`
- Target: `<a href="#main-content" class="sr-only focus:not-sr-only ...">Skip to content</a>`
- Add `id="main-content"` to `<main>` elements

**5. Fix missing accessible labels**
- `PropertyCard.tsx`: Add meaningful `alt` text using property name
- `MobileBottomNav.tsx`: Add `aria-label` to nav buttons
- `PublicHeader.tsx`: Add `aria-label` to mobile menu button
- `PublicFooter.tsx`: Add `aria-label="Footer navigation"` to `<nav>`
- `EmbedProperty.tsx` / `PMSBranding.tsx`: Replace `alt=""` with brand name

**6. Fix hero text contrast**
- Change `text-white/70` → `text-white/80` and `text-white/60` → `text-white/75` on Home hero overlays
- Ensure property credit badge text meets 4.5:1 ratio against `bg-black/60`

### Phase C — UX Consistency

**7. Replace emoji icons in mobile menus with Lucide icons**
- `PublicHeader.tsx` mobile dropdown: Replace 📖👥🔗🔒📋✉️ with `BookOpen`, `Users`, `Link2`, `Shield`, `FileText`, `Mail` from Lucide
- Consistent icon language across the entire app

**8. Update `theme-color` to brand color**
- `index.html`: Change `<meta name="theme-color">` from `#000000` to `#e91e8c`
- `manifest.json`: Update `theme_color` to `#e91e8c`
- Better browser chrome / PWA appearance matching brand

**9. Add hero skeleton state**
- Home page: Show a subtle shimmer/gradient placeholder while `isLoadingHero` is true instead of invisible content

### Phase D — System Files

**10. Update `index.html` head optimization**
- Add `preconnect` hints for Supabase and Google Fonts
- Move Google Fonts from CSS `@import` to HTML `<link>` (render priority)

---

### What We Will NOT Touch
- **Shadcn UI components** — auto-generated, already accessible
- **Edge functions** — backend, no UX impact
- **Admin/PMS page internals** — functional, not public-facing priority
- **Home page nav architecture** — the dual-nav pattern is intentional (hero-integrated vs standard)
- **Auth page monolith** — functional, splitting risks regressions

### Estimated Scope
- ~12 files modified
- 0 behavioral changes
- Major bundle size reduction from code splitting
- WCAG AA baseline achieved for public pages

