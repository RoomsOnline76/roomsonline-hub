# Correct RU API-key rejection reporting

## Confirmed diagnosis

The submitted key pair reaches the channel unchanged and uses child credentials, not master credentials. Live checks against `Pull_ListOwnerProp_RQ`, `Pull_ListMyUsers_RQ`, and `Pull_GetApiKeys_RQ` all return status `-4` for that pair. `Pull_ListOwnerProp_RQ` correctly includes OwnerID 742004; removing it would be invalid.

The misleading part is the follow-up portal-password probe: portal sign-in and XML API authentication are separate systems, so an XML status `-4` cannot establish that `ru-owner@roomsonline.co.za` or its portal password is incorrect.

## Changes

1. Remove the portal username/password confirmation call from `save_api_keys`.
2. Keep the existing owner-scoped API-key verification and its rate-limit/wrong-account safeguards.
3. Report exactly what is known: the channel's XML API rejected the downloaded pair for OwnerID 742004, without claiming the portal credentials failed.
4. Direct the operator to confirm that the downloaded pair is enabled for `XmlApi` access on that sub-account.
5. Deploy `ru-cert-portal` and retry the real save flow to verify the corrected response.

## Technical scope

- `supabase/functions/ru-cert-portal/index.ts`: only the rejected-key response branch in `save_api_keys`.
- No schema, credential storage, OwnerID mapping, or listing-push changes.
- `rentalsunited-api` child-auth code remains unchanged; its locked authentication path has been inspected and is correct for this request.