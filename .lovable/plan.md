# Send only the changed field on save — and say so honestly

## What I found (verified in the ledger and the code)

- The property you renamed is "RU Name Change". Its `ru_push_enabled` is **false**, so the
  operational gate refused the push. The save at 17:13 today was logged as
  `static_delta_skipped` with the reason **"not listed on the channel"** — which is wrong: the
  listing exists (10 listed units), the wizard gate simply has pushes switched off.
- Because a skip is treated as "nothing owed", the editor showed **no toast at all**, so the save
  looked successful while nothing was sent. The change was also *not* parked for automatic
  re-delivery, so it will only reach the channel on the weekly full push.
- Why it feels slow: a content delta waits out a **60-second** de-bounce inside the request and
  then pushes the **whole property plus every active unit** in resumable chunks (10 units for this
  property) — even when one property-level field changed.
- The per-field fingerprint map already exists (`field_fingerprints` in `ru_sync_runs.details`),
  so we already know exactly which fields moved. It is currently only recorded, never used to
  narrow the push.

## What changes

### 1. Push only what changed
- Property-level fields (name, description, address, amenities, hero image, occupancy) feed every
  listing's payload, so those still push the property's listings — but content only, as today.
- When **only unit-level fields** changed (unit name, beds, unit photos, times, unit amenities),
  the push is scoped to just those units via the existing `only_unit_ids` filter. A one-unit edit
  on an 11-unit property becomes one channel write instead of eleven.
- The changed-field list is recorded on the run, so the log answers "what did this delta carry".

### 2. Make it fast
- De-bounce drops from 60s to 10s, and only applies when a previous push happened inside that
  window. The fingerprint check already prevents duplicate content being sent twice, so the long
  wait bought nothing.
- The push still runs in the background after the response, so the editor never blocks.

### 3. Never claim silence as success
- Separate the three skip reasons properly: **not listed**, **pushes switched off / wizard not
  ready**, **nothing the channel cares about changed**.
- A gate refusal on a listed property is parked as *still owed* (`static_delta_pending`), so the
  existing automatic re-arm delivers it the moment pushes are enabled — no manual button.
- The save toast tells the truth per section:
  - delivered → "Sent to the Channel Manager: property name."
  - parked → "Property name is queued — the Channel Manager is switched off for this property; it
    will be sent automatically when pushes are enabled."
  - rejected → the channel's reason plus the field names.
  - genuinely unchanged or not distributed → stays silent, as today.

## Technical notes

- `supabase/functions/_shared/ruStaticDelta.ts`: carry the gate result in the snapshot; split the
  skip reason; log gate refusals under `RU_STATIC_DELTA_PENDING_ACTION` with `error_code` so
  `ruPendingDeltas.resumePendingRuDeltas` re-fires them; derive `scopeUnitIds` from the
  fingerprint diff (`unit:<id>.<column>` keys) when no `property.*` key changed and pass it as
  `only_unit_ids`; `RU_STATIC_DELTA_DEBOUNCE_MS` 60s → 10s.
- `src/lib/channelPushConfirm.ts`: return the skip/park reason with the verdict and map a parked
  run to `deferred` rather than `not_owed`.
- `src/lib/channelSavePush.ts`: report `not_owed` with a reason as an informational toast naming
  the fields, keep silence only for "unchanged"/"not distributed".
- No schema change; no change to the `push-property-to-ru` contract (it already supports
  `static_only` + `only_unit_ids`).
