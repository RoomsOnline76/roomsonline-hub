

# Generate ROL vs Litchi Feature Comparison Document

## What This Is

A professional PDF document for ROL ownership that maps each of the 6 features from the Litchi "features_lead.pdf" to ROL's implementation, showing how ROL matches or exceeds each one. The document will be branded with ROL's identity and suitable for stakeholder presentation.

## The 6 Litchi Features vs ROL Implementation

| # | Litchi Feature | ROL Implementation | ROL Advantage |
|---|---------------|-------------------|---------------|
| 1 | Flexible Cancellation Policy for Specified Dates | Phase 1: Dynamic Policy Engine — `rolos_policies` table with date-range policies, evaluated live via Experience Engine | AI-evaluated policies with deposit schedule integration, not just date ranges. Policies cascade through booking flow + guest portal automatically |
| 2 | Customisable Fonts to Match Your Brand | Phase 2: Full BrandKit System — any Google Font, CSS custom properties, auto-loaded via `useBrandOverride` + `PMSBrandContext` | Unlimited Google Fonts (not a fixed list of 15). Full brand kit with colors, logos, fonts applied across booking engine, PMS, emails, and guest portal |
| 3 | Online Availability Overview Calendar for Agents | Phase 3: Live Collaborative Command Centre — agent role, multi-property calendar, AI suggestions | AI-powered suggestions for agents. Multi-property view with role-based access. Not just viewing — agents get actionable intelligence |
| 4 | Customisable Guest Emails | Phase 4: AI Personalised Guest Journey — TipTap rich editor, AI content generation, branded preview, Experience Engine template resolution | AI writes email drafts in the property's brand voice. Rich text editor (not plain text). Live branded preview. Starter template library. Auto-applies brand kit |
| 5 | Multiple Properties Overview on One Booking Engine | Phase 5: AI Portfolio Experience — semantic grouping, AI bundles, natural language search, featured property recommendations | AI groups properties by theme. Suggests multi-property bundles. Natural language search ("pet-friendly near beach"). Not just a grid — intelligent discovery |
| 6 | Guest Self-Service Cancellation | Phase 6: Guest Portal + Smart Resolution — token-based access, AI alternatives before cancellation, PMS sync | AI tries to save the booking first (date changes, shorter stays, credits). Token-based security (no login required). Full PMS sync for external systems |

## Document Structure

1. **Cover page** — ROL branding, title "Feature Capability Report", date
2. **Executive Summary** — ROL doesn't just match Litchi's 6 features; it exceeds them with AI-powered intelligence at every layer
3. **Feature-by-Feature Comparison** — 6 sections, each with:
   - Litchi's offering (brief, factual)
   - ROL's implementation (what we built, how it works)
   - Why ROL exceeds (the differentiator)
4. **Architecture Advantage** — The Experience Engine as a unified layer vs point features
5. **Summary Matrix** — Quick visual comparison table

## Technical Approach

- Generate using ReportLab (Python PDF)
- ROL brand colors from codebase (primary colors used in the platform)
- Output to `/mnt/documents/ROL_Feature_Capability_Report.pdf`
- Visual QA via `pdftoppm` conversion

## Files

| Action | Details |
|--------|---------|
| Script | `/tmp/generate_report.py` — ReportLab PDF generation |
| Output | `/mnt/documents/ROL_Feature_Capability_Report.pdf` |

