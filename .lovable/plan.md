## Plan: WETU Content Adapter Integration

### 1. Database — add WETU ID field to properties
Migration adding a single nullable column so every property can store its WETU pin ID:
- `properties.wetu_id` — `text`, nullable, indexed (partial `WHERE wetu_id IS NOT NULL`)
- No RLS changes (inherits existing properties policies)

### 2. Channel Manager card (PMS → Channels)
The "Channel Manager" cards are driven by `CHANNEL_CONFIG` / `ALL_CHANNELS` in `src/components/pms/channels/ChannelLogo.tsx`.
- Add `wetu` entry with brand color, label "WETU", category "Content Distribution"
- It will automatically appear as a card on `/pms/channels` via the existing `ALL_CHANNELS.map` loop in `PMSChannels.tsx`
- Connect dialog needs a WETU-specific credential field set: `api_key` (already provisioned project-wide via `WETU_API_KEY` secret, but per-property override allowed) and `wetu_id` (pin ID)

### 3. Milestone tracker entry
In `src/components/ApiMilestones.tsx`, add a `wetu` block mirroring the `hyperguest` shape:
- `auth: 'complete'` (WETU_API_KEY already configured)
- `healthCheck: 'complete'` (wetu-api `health_check` action exists)
- `pullAvailability: 'pending'` (content-only, N/A — mark as `n/a` if supported, else `pending` with note)
- `syncIn: 'in_progress'` (this plan wires it)
- `pushBooking: 'n/a'` (WETU is read-only content)
- `liveMonitor: false`

### 4. WETU ID field on Property Edit → General tab
`src/components/property/GeneralTab.tsx` — add a new field block:
- Labelled "WETU Pin ID" with helper text "Used to auto-import marketing content from WETU"
- Input + "Import from WETU" button next to it
- Button disabled until `wetu_id` is saved
- Available to all properties (no PMS gating)
- On click → invokes new orchestrator action `import_wetu_content` (see step 5), shows toast with imported field counts, refreshes property cache

### 5. WETU Content Adapter — extend `supabase/functions/wetu-api/index.ts`
Add a new action `import_to_property`:
- Input: `{ action: "import_to_property", property_id, wetu_id, mode: "preview" | "apply" }`
- Calls existing `get_property` against WETU API
- Maps WETU response → ROL'OS property fields:
  - `description`, `short_description` (from WETU description / teaser)
  - `images` (WETU gallery → JSONB array, only ≥1024×683 per image-size rule)
  - `amenities` (WETU facilities → existing amenity schema via `lib/hostfullyAmenityCorrelation.ts`-style mapper, new `lib/wetuFieldMapper.ts`)
  - `latitude`, `longitude` (if present and property has none)
  - `address`, `city`, `country` (only if currently null)
- Writes via service-role Supabase client; respects `pms_managed_fields` (never overwrite a field listed there)
- Updates `external_metadata.wetu_last_import_at`, returns summary of fields written + skipped

### 6. Front-end glue
- New tiny hook `src/hooks/useWetuImport.ts` wrapping `supabase.functions.invoke('wetu-api', { body: { action: 'import_to_property', ... } })` with React Query mutation + toast
- Used by the GeneralTab button

### Technical details
- Field mapper kept in client-side `src/lib/wetuFieldMapper.ts` for reuse by edge function (Deno-friendly — pure functions, no DOM)
- All payloads snake_case at the wire boundary (per API contract memory)
- Strict TS, no `any`
- Edge function returns `{ success, updated_fields, skipped_fields, image_count }`
- Migration includes `GRANT` block per public-schema rules

### Out of scope
- WETU push (read-only)
- Auto-scheduled re-imports (manual button only this round)
- Mapping rooms/units (content-only — rooms stay on existing PMS)
- Removing existing `WETU` entry from `pmsSystemsConfig.ts` (kept as-is)

### Files touched
- `supabase/migrations/<new>.sql` (add column)
- `src/components/pms/channels/ChannelLogo.tsx`
- `src/components/pms/channels/ConnectChannelDialog.tsx` (add wetu credential schema)
- `src/components/ApiMilestones.tsx`
- `src/components/property/GeneralTab.tsx`
- `src/components/onboarding/steps/types.ts` (add `wetu_id` to `PropertyData`)
- `src/hooks/useWetuImport.ts` (new)
- `src/lib/wetuFieldMapper.ts` (new, shared with edge function)
- `supabase/functions/wetu-api/index.ts` (extend with `import_to_property`)
