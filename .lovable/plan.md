# CRM add-on settings collapse + website enquiry form builder

## 1. CRM page — collapse the add-on settings

On `/pms/crm`, the "Add-on settings" card (connect, replace token, pause, disconnect) renders fully expanded at the bottom of the page. Make it collapsed by default:

- Header stays visible with title, description and a small connection state badge (Connected / Not connected).
- Whole header is the toggle, with a chevron affordance.
- Body (the HubSpot card) only renders when opened.

## 2. Integrations — Enquiry form section

New tab **Enquiry form** in the single-property tab row on `/pms/integrations`, shown only when the CRM add-on is live for the owner (same capability check the CRM menu item uses). When the add-on is off, the tab is hidden.

The tab holds two parts:

**Website keys** — reuse the existing publishable intake-key card (currently only on the Inquiries page): create, label, restrict to domains, activate/deactivate, copy key.

**Form builder** — pick which fields the website form shows (name, email, phone, country, company/trade, dates, guests, message; name is always on and one of email/phone is required), choose the button label, redirect-or-inline confirmation message, and accent colour (defaults to the property brand colour). Live preview beside the options, and a copy-ready snippet generated from the selection:

```text
Enquiry form
------------------------------------------------------
Key:  [Website form ▾]  rol_inq_…            [Copy]
Fields: [x] Name  [x] Email  [x] Phone  [ ] Country
        [ ] Company (trade)  [x] Dates  [x] Guests  [x] Message
Button: [Send enquiry]     Confirmation: [Thank you…]
------------------------------------------------------
| Preview                     | HTML  |  WordPress  |
| Name  [           ]         |  <form …>            |
| Email [           ]         |  … copy snippet …    |
```

Snippet output tabs: plain HTML + JS (self-contained, no dependencies), and a WordPress/Elementor-friendly variant of the same markup. Both post to the existing public intake endpoint with the selected key, include the honeypot field the endpoint already expects, and show the configured confirmation text on success.

## Technical notes

- `src/pages/pms/PMSCrm.tsx`: wrap the settings card in `Collapsible` from `@/components/ui/collapsible`, `open` state defaulting to `false`.
- New `src/components/integrations/EnquiryFormTab.tsx`: local state for field selection, preview, and snippet generation; imports the existing `InquiryIntakeKeysCard` for key management. No new backend work — it targets `inquiry-intake` and `rolos_inquiry_keys` as they exist today.
- `src/pages/pms/PMSIntegrations.tsx`: add the gated `TabsTrigger`/`TabsContent` pair in single-property mode, using the existing HubSpot capability hook (`useHubspotCapability`).
- Snippet styling uses inline styles (it runs on the owner's own site, outside our token system); in-app UI keeps semantic tokens.
- No changes to inquiry pipeline logic, the intake edge function, or HubSpot projection behaviour.
