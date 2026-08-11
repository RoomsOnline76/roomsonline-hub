# Switching Brochure — "Considering a change" edition

A second premium PDF, same design language as the owner brochure, aimed at properties already running a booking/reservation system and weighing a move to ROL'OS. It carries an unnamed side-by-side comparison against the kind of legacy reservation system these owners typically use today.

## Output

- `/mnt/documents/roomsonline-switching-brochure.pdf` — 10 pages, A4 portrait
- `/mnt/documents/roomsonline-switching-brochure-content.md` — copy/spec companion

## Design continuity

Same system as the first brochure: charcoal `#1A1A2E`, ivory `#F6F2EC`, magenta `#E91E8C`; Italiana headings, Instrument Sans body, Geist Mono labels. Reuse the generated hospitality imagery and vector mock-up style, with two new visuals: a "migration path" diagram and a comparison grid.

## Page flow

1. **Cover** — "Thinking about changing systems?" Calm, no urgency.
2. **Where owners are today** — the honest picture: a system that takes bookings but leaves rates, channels and reporting scattered.
3. **What usually triggers a review** — five prompts (rate drift, channel work, guest experience, reporting, cost per room).
4. **What ROL'OS is** — owner-controlled booking and control layer; keeps or replaces the existing system, owner's choice.
5. **Side-by-side comparison** — two-column grid: "Typical reservation system" vs "ROL'OS". No vendor named anywhere. Rows: rate authoring, seasons/rate plans, channel distribution, direct-booking engine and white-label, guest journeys and concierge, groups/packages/F&B, reporting and revenue view, refunds and payment handling, content quality and channel readiness, cost model per room.
6. **What you keep** — existing PMS/booking flow can stay as source of truth; no forced rip-out; data and guest relationships stay the owner's.
7. **Migration in four steps** — diagram: Conversation → Mirror (read-only) → Parallel run → Cut over when the owner is ready.
8. **Risk and reversibility** — parallel-run period, no lock-in language, what happens if the owner stops.
9. **Cost framing** — room-count subscription tiers, add-ons named plainly (channel manager per unit, white-label, revenue add-on), commission and per-booking facilitator surcharge described as variable. No competitor pricing claims.
10. **Next steps** — "A conversation, then a walkthrough." Contact block.

## Comparison rules

- Never name, hint at, or abbreviate any competitor; use "a typical reservation system" / "most legacy systems".
- Only verifiable, capability-level statements about ROL'OS; comparison column stated as general market patterns, no performance or price claims about others.
- Neutral tone — advantages implied by the capability list, not by knocking anyone.

## Technical notes

- Python + ReportLab canvas script under `/tmp`, mirroring the first brochure's page builders and helpers.
- New images via image generation where needed; comparison grid and migration diagram drawn as vectors.
- Numerals set in Instrument Sans Bold (Italiana lacks reliable figure glyphs).
- QA: render every page to JPEG with `pdftoppm` and inspect all 10 for clipping, overlap, margin and contrast issues; fix and re-render until clean.
