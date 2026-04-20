

## Plan: RU Response Triage — Remediation Tasks + Q&A Document

### Context
RU support replied to our ticket and **identified the root cause of Status 24**: it's not an ownership issue — it's an **XML schema violation**. Our `Push_PutPrices_RQ` puts `PropertyID` as a child element, but RU's schema requires it as an **attribute** of `<Prices>`. Same structural issue for `Push_PutAvbUnits_RQ`. Also: `Push_PutChangeoverDays_RQ` and `Push_PutMinStay_RQ` don't exist — they're folded into `Push_PutAvbUnits_RQ`. Date format also wrong.

This unblocks Steps 5–13. Major win.

### Two deliverables

**1. Remediation Plan (code changes — for default mode after approval)**
**2. Q&A Document (markdown artifact — chronological RU questions + our answers with source URLs)**

---

### Part 1 — Remediation Tasks (Code Changes)

Investigate `supabase/functions/rentals-united-adapter/` (or equivalent) to locate the XML builders, then fix:

| # | Task | File(s) | Severity |
|---|------|---------|----------|
| T1 | Fix `Push_PutPrices_RQ` — move `PropertyID` from child element to attribute of `<Prices>` | RU adapter price builder | 🔴 Blocker |
| T2 | Fix `Push_PutPrices_RQ` season format — use `<Season DateFrom="..." DateTo="...">` as attributes (not child elements), add `<Extra>` if required | RU adapter price builder | 🔴 Blocker |
| T3 | Fix `Push_PutAvbUnits_RQ` structure — verify against RU schema (PropertyID as attribute, correct AvailabilityDay format) | RU adapter availability builder | 🔴 Blocker |
| T4 | **Remove** standalone `Push_PutChangeoverDays_RQ` and `Push_PutMinStay_RQ` calls — fold MinStay/MaxStay/Changeover into `Push_PutAvbUnits_RQ` `<AvailabilityDay>` attributes | RU adapter, orchestrator | 🔴 Blocker |
| T5 | Add EGPS (extra guest pricing) block to `Push_PutPrices_RQ` if per-person rates exist | RU adapter price builder | 🟡 Medium |
| T6 | Add a unit test fixture comparing our generated XML against RU's documented schema example | `*.test.ts` for adapter | 🟢 Hygiene |
| T7 | Re-run end-to-end ARI push for one test PropertyID (e.g. 4707636 / Steenbok) and confirm Status 0 | Manual via curl_edge_functions | 🔴 Verification |

**Investigation steps before coding:**
- Read the current RU adapter file(s) — locate XML builders for Prices, AvbUnits, MinStay, ChangeoverDays
- Read recent `sync_logs` rows for `Push_PutPrices_RQ` to confirm exact malformed structure
- Cross-reference with `mem://integrations/pms/rentals-united-xml-adapter` for any documented XSD ordering rules already captured

---

### Part 2 — Q&A Markdown Artifact

Generate `/mnt/documents/RU-Response-QA.md` containing:

**Section A — Chronological list of RU's questions/corrections to us** (5 items):
1. Structural error: `PropertyID` placement in `Push_PutPrices_RQ` (attribute vs element)
2. Seasonal date range syntax in `Push_PutPrices_RQ`
3. `Push_PutAvbUnits_RQ` request syntax not followed
4. Source/origin of `Push_PutChangeoverDays_RQ` and `Push_PutMinStay_RQ` (undocumented methods — where did we get them?)
5. Context/examples needed for `Push_PutBuilding_RS` missing `UnitTypeID`s
6. Clarification needed: `Pull_GetBuilding_RQ` doesn't exist — did we mean `Pull_ListBuildings_RQ`?

**For each question**, provide:
- **RU's exact question** (verbatim)
- **Our answer** with concrete evidence
- **Source URL** where the method/format was originally referenced (RU dev portal, internal sync_log ID, our adapter file path)
- **Corrective action** (links to T1–T7 above)

**Section B — Acknowledged RU concessions:**
- RU confirmed Status 24 message is misleading and is being improved internally
- RU confirmed `Push_PutAvbUnits_RQ` is the unified endpoint for avail+min/max stay+changeovers

**Section C — Outstanding clarifications we still need from RU:**
- Confirm exact XSD URL/version we should validate against
- Confirm whether `Pull_ListBuildings_RQ` returns `UnitTypeID`s in composition
- Confirm building→property linkage mechanism (our prior Section 5 questions)

---

### Technical notes
- Investigation will use `code--search_files` for "Push_PutPrices" and "Push_PutAvbUnits" to find builders
- Will query `sync_logs` for the exact 2026-04-20 02:00:12 entry RU referenced to confirm what we sent
- Q&A doc will be written to `/mnt/documents/RU-Response-QA.md` (new file, not appended to ticket — keeps it focused)
- After Q&A is generated, the remediation tasks become the next implementation pass

### Out of scope
- Not modifying `RU-Technical-Ticket.md` (it served its purpose; reply is the resolution)
- Not addressing building-linkage gap in this pass — RU asked for more context first; we'll respond via Q&A doc, then loop back if they confirm a real issue
- Not touching reservation polling, RLNM, or cron — all confirmed working

