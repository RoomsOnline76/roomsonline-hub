# TOBI: HubSpot knowledge enrichment

TOBI currently knows almost nothing about the HubSpot owner CRM add-on. The public Connect assistant has no HubSpot block at all, and the in-app helper (generic, PMS and onboarding modes) never mentions the add-on, the Inquiries pipeline, digital check-in or the 15-minute delta sweep. Visitors and owners asking "can I use HubSpot?" get generic or invented answers.

This is a prompt/knowledge change only — no schema, no new endpoints, no UI.

## What TOBI will be able to do afterwards

Connect (sales) TOBI:
- Pitch HubSpot as a free, opt-in owner-level add-on covering the whole portfolio.
- Explain what lands in HubSpot: guests as contacts (stay history, lifetime spend), trade partners as companies, bookings as deals, website enquiries as a pipeline.
- Make clear ROL'OS CRM is native and HubSpot is an optional projection — nothing breaks if it's off.
- Point to /connect/hubspot and the feature brochure, and to the free 60-day trial path.
- Answer the security question honestly: token encrypted server-side, verified before save, owner-scoped, revocable.

In-app (owner/PMS) TOBI:
- Walk through connecting: Owner Account → HubSpot card → paste private-app token → Test connection → save; same card also appears in the go-live workspace.
- Explain the 15-minute delta sweep, what triggers an immediate push (new/modified/cancelled booking, enquiry status change), and that it is one-way ROL'OS → HubSpot.
- Explain Trade vs Direct segmentation and where the badges show (Guests page), plus repeat/lapsed flags.
- Point to the Inquiries pipeline at /pms/inquiries, website enquiry intake, digital check-in and post-departure feedback as native features that also project to HubSpot.
- Troubleshoot the common cases: invalid/expired token, missing scopes, nothing syncing yet (sweep window), disconnect behaviour.

Onboarding TOBI:
- One short answer that the HubSpot step is optional and never blocks go-live.

## Guardrails

- Never claim two-way sync, HubSpot-side writes back into ROL'OS, or paid tiers for the add-on.
- Keep the branding rule: TOBI only, never name the underlying model.
- Never quote a price for the add-on other than "free / included".
- If asked for scopes or exact object property names beyond what is documented, defer to the help article rather than inventing.

## Technical detail

- `supabase/functions/connect-assistant/index.ts` — add a `HUBSPOT CRM ADD-ON` section to `BASE_SYSTEM_PROMPT` plus two entries in `COMMON GUIDANCE` ("do you have a CRM?", "we already use HubSpot"), with the /connect/hubspot next step.
- `supabase/functions/help-assistant/index.ts` — add a shared HubSpot knowledge block appended to `GENERIC_SYSTEM_PROMPT` and `PMS_SYSTEM_PROMPT`, one line in `ONBOARDING_SYSTEM_PROMPT`, and an "Inquiries" entry in the PMS navigation guide (the route exists in `PMSSidebar.tsx` but the prompt's navigation list omits it).
- Keep the existing `help_articles` retrieval untouched; the `hubspot-crm-owner-addon` article already exists and will continue to be surfaced as a citation.
- Deploy both edge functions after the edits.
