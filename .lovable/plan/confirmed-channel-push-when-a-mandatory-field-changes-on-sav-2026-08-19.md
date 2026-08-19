# Confirmed channel push when a mandatory field changes on save

Editing a property in `/edit` or `/setup property` should send the changed mandatory
detail to the Channel Manager on save, and only report success once the channel has
actually accepted it — naming exactly what was sent.

## Today

- Saving fires two fire-and-forget deltas (content, rates) plus a company-details
  re-push. Content/rates return `accepted: true` immediately, so nothing confirms the
  channel took the change.
- The only field-specific toast is for company information; every other mandatory
  field (hero image, bed composition, address, contact person, occupancy) saves
  silently as far as the channel is concerned.
- A rate-limited channel window makes the push land later; the save surface currently
  says nothing about it either way.

## What changes

### 1. Know what changed, in the wizard's language

Extend the existing change-diff so a save produces a list of changed **mandatory
channel fields** with human labels, not just macro step keys:

- company name, registration/VAT, primary contact name, contact email/phone
- hero image / gallery images
- property type, name, description
- address, coordinates
- occupancy, bedrooms, bathrooms, bed composition
- check-in/out times, cancellation policy, prices

Each label carries the section it belongs to (company / content / rates), so we know
which push satisfies it.

### 2. One push per affected section, never per field

- Company fields → company-details push.
- Content fields → static content delta (a single push covers every static field that
  changed in that save).
- Rate and availability fields → rates delta.

Sections with no changed mandatory field are not pushed at all, so a save that only
touches non-channel data spends nothing against the channel's window.

### 3. Confirm before claiming success

Each push runs in confirm mode: the save does not block on it, but a small watcher
waits for the channel verdict and only then toasts.

- **Accepted by the channel** → success toast naming the fields:
  "Sent to the Channel Manager: company name, primary contact."
- **Rate-limited / deferred** → neutral "queued" toast ("Channel window is busy —
  hero image will land within a minute"), then the watcher keeps polling and upgrades
  to the success toast when the delivery is recorded. No repeated calls: it reads our
  own delivery log, it does not re-hit the channel.
- **Rejected or failed** → destructive toast with the channel's reason and the field
  names, so the operator knows the change is still owed.
- **Nothing owed** (fingerprint unchanged, listing not connected, pushes paused) → no
  toast, exactly as today.

### 4. Rate-limit discipline

- Coalesced: one content push, one rates push, one company push per save, fired
  sequentially rather than in parallel.
- Confirmation is done by polling our own sync-run log, not by calling the channel.
- Deferred pushes rely on the existing queue/re-arm path, so they are replayed once,
  automatically.

## Technical notes

- `src/lib/channelStepLedger.ts`: add a mandatory-field → `{ step, section, label }`
  map and a `deriveChangedChannelFields(before, after)` helper alongside
  `derivePropertyStepsFromChanges`.
- New `src/lib/channelPushConfirm.ts`: `confirmChannelPush({ propertyId, section,
  labels, since })` polls `ru_sync_runs` for a delivered (`static_delta` /
  `refresh_ari` / company) run newer than the save timestamp, with a bounded window
  (~90s, 5s interval) and terminal states `delivered | deferred | failed | not_owed`.
- `src/pages/PropertyForm.tsx` save path: replace the current fire-and-forget block
  with the section routing above; keep the existing "Property updated" toast, add the
  field-specific channel toasts driven by the confirm helper.
- `queueChannelContentSync` / `queueChannelRatesSync` gain an optional
  `expectDelivery` flag that returns the run id/reason so the watcher has an anchor;
  the `ru-static-delta` / `ru-ari-delta` functions keep their current contract
  (`accepted` immediately, work continues server-side).
- Company push keeps `ru-cert-portal / ensure_company_details`, but its result is
  interpreted through the same three-state (delivered / deferred / failed) reporting
  so its toast wording matches the others.
- Deferred and failed pushes stay visible in Channel monitor → Diagnostics; no change
  needed there.
