
Goal: make the RU edge-function return the exact RU error code and enough diagnostics to pinpoint the XML fault, instead of losing detail behind generic edge-function failures.

What I found
- The RU adapter is already capturing RU’s XML error code correctly:
  - `extractStatusId()` reads `<error ID="...">...`
  - current logs show RU returned `ID="-3"` with:
    `Invalid request. There is an error in XML document (1, 2941). Input string was not in a correct format.`
- The main problem is observability, not just parsing:
  - `rentalsunited-api` returns `{ success:false, error:{ code:'RU_ERROR', message, ru_status_id } }`, but it does not return the raw RU response, XML diagnostics, or a snippet around the failing character.
  - `push-property-to-ru` then re-wraps failures as HTTP 422 and drops most debugging context.
  - UI components only display `error.code` + `error.message`, so the exact RU fault location is not exposed.

Likely fault from current evidence
- RU’s parser is failing at XML character ~2941 with “Input string was not in a correct format”.
- That strongly suggests a field value/attribute format issue inside our generated XML, not a connectivity issue.
- Since we already know the position, the fastest next step is to return the compact XML length and a snippet around char 2941 so we can identify the exact offending node/value.

Implementation plan
1. Improve `rentalsunited-api` diagnostics
- Keep returning HTTP 200 for RU-level failures so callers can always read the body.
- Extend the RU error response to include:
  - `ru_status_id`
  - `ru_status_message`
  - `ru_raw_xml` or truncated raw response
  - `diagnostics.error_stage` (`push_property`)
  - `diagnostics.xml_length`
  - `diagnostics.xml_error_position` parsed from `(1, 2941)`
  - `diagnostics.xml_context` = substring around that position from the compacted request XML
  - `diagnostics.request_preview` = safe truncated start of compact XML
- Add helper logic to parse XML error positions from RU messages like:
  `XML document (1, 2941)`

2. Preserve diagnostics in `push-property-to-ru`
- Do not collapse RU failures into a generic 422-only response.
- Forward the full structured error object from `rentalsunited-api`, including `ru_status_id`, `ru_status_message`, and `diagnostics`.
- Prefer a 200 response with `success:false` for RU validation failures so the client can reliably read the body through the SDK.

3. Surface the exact RU fault in the UI
- Update `src/components/property/PushToRentalsUnited.tsx` to support richer error fields:
  - show RU status ID prominently
  - show parsed XML position if present
  - show a short “XML context” snippet in the alert for debugging
- Optional small improvement in the background auto-push path in `src/pages/PropertyForm.tsx`:
  - log full returned diagnostics instead of only `message`

4. Then use the returned RU code/details to fault-find the actual XML bug
- After diagnostics are in place, retry the Seesig push.
- Use the returned `xml_context` around char 2941 to identify the bad value/tag.
- Based on current code, I would inspect first:
  - `SecurityDeposit DepositTypeID="5"` numeric formatting
  - cancellation policy attribute/value format
  - check-in/out field formats
  - payment method values
  - any empty or malformed numeric field serialized as text

Files to update
- `supabase/functions/rentalsunited-api/index.ts`
- `supabase/functions/push-property-to-ru/index.ts`
- `src/components/property/PushToRentalsUnited.tsx`
- optionally `src/pages/PropertyForm.tsx`

Technical detail
- Current logs already confirm RU code `-3`; the missing piece is correlating that error to the exact part of the outbound compact XML.
- Best debugging payload shape:
```ts
{
  success: false,
  error: {
    code: "RU_ERROR",
    message: "...",
    ru_status_id: "-3",
    ru_status_message: "...",
  },
  diagnostics: {
    error_stage: "push_property",
    xml_length: 5574,
    xml_error_position: 2941,
    xml_context: "...<snippet around failing char>...",
    request_preview: "<Push_PutProperty_RQ>..."
  }
}
```
- This keeps client behavior stable while making the next retry actionable instead of guesswork.
