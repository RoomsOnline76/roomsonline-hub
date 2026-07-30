## What I verified

- **Property branding saves only 3 colours.** `src/components/property/BrandingTab.tsx` exposes `brand_primary_color`, `brand_secondary_color`, `brand_font_color` only, and `PropertyForm.tsx` (save block ~line 2934) writes only those. The database `properties` table already has `brand_heading_text_color`, `brand_body_text_color`, `brand_muted_text_color`, `brand_light_bg_color`, `brand_dark_bg_color`, `brand_accent_color`. So when the readability panel proposes a fix on any of those fields, the patch is merged into form state, never persisted, and the palette prop the panel reads never changes — the same suggestions re-render immediately. That is exactly "does not clear when accepted and nothing saves".
- **The panel only assesses light mode.** `brandAutoCorrect.ts` and `BrandReadabilityPanel.tsx` score text against `brand_light_bg_color` / primary / secondary, with the dark band checked only for the footer replica. No day/dark pairing is evaluated.
- **ROLOS dark mode is broken by hardcoded light-only utilities.** ~150 occurrences of `bg-white`, `bg-amber-50`, `bg-emerald-50/100`, `text-gray-600/700/900`, `text-emerald-800`, etc. across `src/pages/pms/**`, `src/components/pms/**`, `src/components/property/**` and `BrandReadabilityPanel.tsx` — the dark tokens in `index.css` are fine, the components bypass them. Worst offenders: `PMSDashboard.tsx` (39), `PMSHousekeeping.tsx` (12), `RoomManagerTab.tsx` (12), `SeasonsCalendar.tsx`, `ReviewActionPanel.tsx`, `ProgressDashboard.tsx`, `BrandReadabilityPanel.tsx`, `PMSBranding.tsx`, `PMSRooms.tsx`, `PMSStaff.tsx`, `BookingFolioTab.tsx`, plus ~18 smaller files.

## Part 1 — Persist the full palette (fixes "nothing saves")

1. `src/index.css` + `tailwind.config.ts`: add semantic status surface tokens for both themes — `--success`, `--success-foreground`, `--success-surface`, `--warning`, `--warning-foreground`, `--warning-surface`, `--info*` — so status panels stop needing raw Tailwind palette colours.
2. `BrandingTab.tsx`: extend `BrandingData` with the five extra colour fields and render them as colour fields (Heading text, Body text, Muted text, Light background, Dark background), matching the ROLOS `PMSBranding` set. Pass the full palette to `BrandReadabilityPanel`.
3. `PropertyForm.tsx`: initialise those fields on load (~line 2244) and include them in the save payload (~line 2934) so accepted fixes actually persist.

## Part 2 — Day/dark-aware readability assessment

4. `src/lib/brandAutoCorrect.ts`: evaluate every text/surface pair twice — once on the light surface set (`brand_light_bg_color`, secondary, primary) and once on the dark set (`brand_dark_bg_color`, primary, dark cards). A fix is proposed only when a value fails in either mode, and the proposed value is chosen so it passes **both**; where one colour cannot satisfy both (e.g. near-black body text on a near-black dark background), the fix targets the mode-specific field instead of forcing an unreadable compromise. Each `BrandFix` gains a `modes: ("light" | "dark")[]` marker and the reason text names the failing mode.
5. `BrandReadabilityPanel.tsx`:
   - Add a **Day / Dark** preview toggle above the replicas; the replicas render on the light or dark surface set accordingly, and every contrast tag recomputes for the active mode.
   - Show a per-fix "fails in: day / dark / both" badge.
   - Keep the panel's own chrome on semantic tokens (remove `bg-amber-50`, `text-emerald-900`, `bg-emerald-100`, etc.) so the panel itself is readable in dark mode.

## Part 3 — Suggestions clear on accept

6. `BrandReadabilityPanel.tsx`: track the accepted values (`appliedSignature`) rather than a bare `dismissed` flag. On accept: fire `onApply`, replace the proposal card with a green "Applied — X changes staged, press Save to publish" confirmation, and re-open the proposal card only when a *new* signature appears (i.e. the user edits a colour and a genuinely new issue arises). Combined with Part 1, the recomputed fix list will be empty after saving, so the card resolves to the "all surfaces pass" state.

## Part 4 — ROLOS dark mode pass

7. Sweep the ROLOS surface files (in priority order: `PMSDashboard`, `PMSHousekeeping`, `PMSRooms`, `PMSStaff`, `PMSNightAudit`, `PMSBranding`, then `components/pms/**` and the `components/property/**` tabs used inside ROLOS) replacing hardcoded palette utilities with the semantic tokens: `bg-white` → `bg-card`, `text-gray-600` → `text-muted-foreground`, `text-gray-900` → `text-foreground`, `bg-emerald-50/text-emerald-800` → `bg-success-surface/text-success`, `bg-amber-50/text-amber-900` → `bg-warning-surface/text-warning`, `bg-red-50/text-red-800` → `bg-destructive/10 text-destructive`, and equivalents. No layout or behaviour changes — day mode must look identical to today.
8. Verify with a Playwright pass over `/pms/dashboard`, `/pms/rooms`, `/pms/housekeeping`, `/pms/branding` and Edit Property → Branding in both light and dark, capturing screenshots for comparison.

## Notes

- Day mode is explicitly preserved: every replacement maps a light-mode colour to a token whose light value matches the current appearance; only the dark values change.
- Public/guest-facing booking pages are out of scope for the dark sweep — they are brand-driven, not theme-driven.
