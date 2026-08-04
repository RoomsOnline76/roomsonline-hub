# Link RU sub-accounts into the ROLOS property flow

## What I verified first

- The only RU sub-account on file is the Jongensfontein portfolio row: OwnerID **741765**, login `connect@roomsonline.co.za`, company details sent, and a verified AccessKey/SecretKey pair stored in `ru_api_credentials` (keyed by OwnerID). Tidal Pools carries RU PropertyID 741765 and sits in that portfolio, so its sibling ROLOS properties (Dassiesingel, Fonteinhutte, SEESIG) already resolve to the same sub-account and the same key pair.
- Other ROLOS properties have **no** portfolio and **no** RU account: Latter Days - STILBAAI, SIX ON N, [SANDBOX] Woodlands Close.
- The certification console already owns every mechanism this needs — `ru-cert-portal` actions `ensure_owner_account` (create/adopt sub-user + company details), `list_ru_candidates`, `bind_ru_account`, `save_api_keys`, `verify_api_keys`, `list_stored_api_keys`, `property_readiness`, `phase_status`. So the property-level work is a new front-end surface plus a thin status/readiness action, not a second adapter.
- Keys are already stored per RU OwnerID (not per property), which is exactly the "one pair shared by the whole portfolio" behaviour asked for. Legacy mirror columns on `ru_owner_accounts` stay as fallback.
- Child-scoped RU calls resolve keys OwnerID-first, then legacy columns, then legacy portal password.

## What gets built

### 1. "Rentals United owner" panel in Identity & Location → Owner

A new card rendered directly under the Owner field in `PropertyForm.tsx`, only when the property's PMS is ROLOS. It resolves the RU identity for this property using the console's own resolution order: portfolio-scoped `ru_owner_accounts` row → property-scoped row → owner-email match.

States shown:

```text
No owner email          -> "Set an owner before linking Rentals United"
Sub-account found       -> OwnerID, RU login email, company-details state,
                           key state (access key last 4, label, verified date),
                           "shared with N properties in this portfolio"
No sub-account          -> readiness checklist + [Create RU sub-account]
Sub-account, no keys     -> API keys required (all push/pull blocked)
```

### 2. Readiness check before creating a sub-account

Before the create button is enabled, a readiness list is evaluated (reusing the console's field logic): owner email, owner/representative name, registered business name, address + city + country + postal code, RU LocationID, phone, currency, and RU user management not parked. Each missing item is listed with a link to the field that fills it. Creating requires an explicit confirmation dialog ("this creates a new white-label account at Rentals United for &nbsp;") — no silent creation.

On success the local row is created/bound, company details are submitted, and the property is linked to the resolved OwnerID.  
ALL SUB-ACCOUNTS ARE CREATED WIT THE SAME PASSWORD: "SLPafrica247*" during the crate sub-acocunt push.

### 3. API key + secret capture on the property

The same panel carries AccessKey / SecretKey inputs (secret masked, never returned to the browser after saving) plus a **Verify** action. Saving goes through the console's `save_api_keys`, which validates the pair against RU before encrypting it, so a bad pair can never be stored. Because storage is keyed by OwnerID, saving from any one property updates the pair for every ROLOS property sharing that sub-account, and the panel says so explicitly.

Step-by-step instructions inline in the panel:

1. Sign in at the RU platform **as this sub-user** (login email shown, with the RU login URL).
2. Open Security settings and generate an API key with scope `XmlApi`.
3. Copy the AccessKey and SecretKey and paste them here, then press Verify.
4. RU only lets the very first pair be generated in their dashboard; later pairs can be minted from ROLOS.

### 4. Gate every RU push/pull until keys are verified

- Front end: `PushToRentalsUnited` and the RU pipeline card on the Integrations tab show a blocking "RU API keys required" state with a link back to the Identity panel, and their action buttons are disabled.
- Server: a shared guard used by the child-scoped RU paths returns a single explicit `RU_KEYS_REQUIRED` error (422) when no verified pair exists for the resolved OwnerID, instead of surfacing RU status `-4`. Cron fan-outs skip such owners rather than failing.

### 5. Switching a property to ROLOS

When PMS is set to ROLOS (on load and on save), the panel resolves the RU identity automatically and surfaces the next required step, so the flow is: owner set → sub-account found or created → keys captured → push/pull unlocked.  

6. 5. Switching a property away from  ROLOS

Prompt for confirmation to switch and warn consequnaces. rooms/units will be archived.  Prompt to archive only one proeprty or all proerties inthe portfolio. Arcive the property(s) in RU, depending on seleciton. Owner ID will be unbound from portfolio and properties. 

## Technical notes

- New `ru-cert-portal` actions: `property_ru_identity` (resolved account + key state + portfolio share count for one property) and `sub_account_readiness` (field checklist). Creation reuses `ensure_owner_account`; key save/verify reuse `save_api_keys` / `verify_api_keys` — no duplicated adapter logic.
- New front-end component `src/components/property/PropertyRuOwnerPanel.tsx`, mounted in `PropertyForm.tsx` Identity tab; a small hook wraps the status query so `PushToRentalsUnited` can share the same gate.
- Server guard lives in `supabase/functions/_shared/` and is called from the child-scoped entry points in `rentalsunited-api` / `push-property-to-ru`. Adapter-locked regions (availability/booking payload builders) are not touched.
- No schema change: `ru_owner_accounts` + `ru_api_credentials` already model portfolio-scoped identity and per-OwnerID keys.
- Access: creating a sub-account and saving keys stay admin/dev/fearless_leader; owners see the panel read-only with the instructions, so they can be told what to fetch.