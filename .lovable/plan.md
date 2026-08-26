# Correct automatic RU API-key creation payload

## Confirmed diagnosis

The affected property is bound to OwnerID 742143, and its stored login matches the current distribution-account roster. The live call reaches `Push_CreateApiKey_RQ` with the expected child username/password authentication envelope, so Step A is not substituting the master identity.

The request body is assembled in the wrong schema order. The current implementation sends:

```xml
<Authentication>…</Authentication>
<Scope>XmlApi</Scope>
<Label>ROLOS</Label>
```

The supplied RU contract requires:

```xml
<Authentication>…</Authentication>
<Label>ROLOS</Label>
<Scope>XmlApi</Scope>
```

RU XML methods use ordered schemas; the malformed request is being rejected with the generic status `-4`, even though the same child login works in the portal.

## Changes

1. **Correct the wire payload.** Change only the `Push_CreateApiKey_RQ` builder to emit `Authentication → Label → Scope`, preserving child username/password authentication for the first key and child key authentication for later keys.
2. **Protect the contract with a regression test.** Assert the exact element sequence, XML escaping, `XmlApi` scope, and absence of master credentials/OwnerID in the key-creation request.
3. **Keep Step A atomic.** The existing account-creation flow will continue to mint and encrypt the returned AccessKey/SecretKey immediately; rate-limit countdown and guided recovery behavior remain unchanged.
4. **Deploy and test the real function path.** Invoke `rentalsunited-api:create_child_api_key` for the bound account through Step A, confirm RU returns status `0` and a key pair, then verify the pair is stored against OwnerID 742143 and Step A advances to company details without manual key capture.

## Technical scope

- `supabase/functions/rentalsunited-api/index.ts`: only the `create_child_api_key` XML construction (within the locked child-auth region).
- A focused test/fixture for the `Push_CreateApiKey_RQ` request contract, following the existing function test structure.
- Deploy and test `rentalsunited-api`; no schema or frontend changes.

Approval of this plan is explicit approval to modify this narrowly scoped Rentals United adapter-locked region.
