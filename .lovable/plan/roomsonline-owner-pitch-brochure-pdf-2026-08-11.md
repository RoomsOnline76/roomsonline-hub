# RoomsOnline Owner Pitch Brochure (PDF)

A 10-page, print-ready owner-facing brochure delivered as a downloadable PDF artifact. No app code changes.

## Pages

1. **Cover** — "RoomsOnline" / "Your properties. One clear view." + ROL wreath mark, "For Property Owners", full-bleed calm interior photograph, charcoal overlay.
2. **A word to the owner** — one confident paragraph, generous white space, thin magenta rule.
3. **The Owner Reality** — five recognisable pain points (fragmented tools, rate and availability risk, admin time, inconsistent guest booking experience, limited cross-property visibility) as a restrained numbered column.
4. **What RoomsOnline Is** — plain-language definition plus three pillars: one console, live-aware visibility, consistent guest booking path.
5. **What You Keep / What You Gain** — two-column ledger. Keep: PMS, rates, inventory authority, channel relationships. Gain: single owner console, unified calendars, booking control, consistent guest experience.
6. **Core Capabilities for Owners** — six-item grid covering multi-property console, live-aware availability and rate visibility respecting PMS authority, calendars/promotions/booking overview, role-based access, multiple PMS connections plus native option.
7. **Operational Impact** — four directional bands: time, control, risk, decisions. Qualitative only, no percentages.
8. **How It Works with Your PMS** — ASCII/vector adapter diagram: PMS (source of truth) → RoomsOnline orchestration → owner console + guest booking + channels. Reassurance copy that ROL never overrides PMS inventory or rates.
9. **Who It Is For** — independent hotels, B&Bs, guesthouses, vacation rentals, small groups; plus a short "less suited to" line for credibility.
10. **Next Step** — calm CTA: a conversation or guided walkthrough, contact block, footer marking the document "For property-owner distribution. Not for public consumer marketing."

## Design specification

- Palette: charcoal `#1A1A2E`, ivory `#F6F2EC`, warm neutral `#D8CFC4`, magenta accent `#E91E8C` used sparingly (rules, page numbers, single word emphasis), muted slate for secondary text.
- Typography: Italiana for display headings, Instrument Sans for body and labels, Geist Mono for small captions and diagram labels — matching existing brand usage, with a Unicode-safe embedded fallback.
- Layout: A4 portrait, wide margins, single dominant idea per page, minimal decoration, no boxes-within-boxes.
- Imagery: generated quiet hospitality photography (interior, exterior, calm guest moment, abstract calendar/rate texture) plus clean vector-style dashboard and calendar mock-ups drawn in-document with realistic placeholder data — no cliché stock look.

## Technical approach

- Build with a Python ReportLab Platypus script under `/tmp`, registering embedded TTF fonts (Italiana / Instrument Sans / Geist Mono, DejaVu fallback) so accents render correctly.
- Generate 4 supporting images via the image tool at print-suitable resolution; draw UI mock-ups as ReportLab vector primitives for crispness.
- Copy is written in full in the script — declarative sentences, no hype words, no revenue or occupancy claims, no "replaces your PMS" language.
- Output to `/mnt/documents/roomsonline-owner-brochure.pdf`, then QA every page via `pdftoppm` and visual inspection; fix overflow, contrast and spacing issues and re-verify before delivery.
- Also deliver `/mnt/documents/roomsonline-owner-brochure-content.md` with the page-by-page layout description, imagery direction, production copy, and palette/typography specs.
