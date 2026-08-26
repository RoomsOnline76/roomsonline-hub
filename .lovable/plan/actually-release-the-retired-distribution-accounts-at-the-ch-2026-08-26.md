# Actually release the retired distribution accounts at the channel

The "retire" action in Channel Monitor → Advanced only ever wrote our own registry: the account, its listings and its API keys stayed fully alive at the channel. The channel-side purge (authenticate as the sub-account → read the listings it really owns → archive each one → release the keys → stamp the registry) is now built. This run uses it on the accounts you listed.

## What happens per account

1. Authenticate as the sub-account: stored API key pair if we still hold one, otherwise mint a fresh pair — owner-scoped through the master account first, and the portal password you supply as the last envelope.
2. Read what the account actually owns at the channel (live read, never our stored listing ids).
3. Archive every still-live listing, one at a time, and record the channel's answer per listing.
4. Delete the stored key pair — only when every listing was accepted.
5. Stamp the registry with the proven outcome. Nothing is marked "archived at channel" unless the channel confirmed it.

## Accounts in this run

Fourteen unbound, already-retired accounts get purged:

```text
742569  dassiesingel-self-catering-units@roomsonline.co.za
742143  dawie@polka.co.za
742555  dawienew@polka.co.za
742536  newjulius@polka.co.za
742576  ru-test-3@roomsonline.co.za
742091  ru-testowner@roomsonline.co.za
742126  ru@roomsonline.co.za
742568  seesig-self-catering-chalets-cop@roomsonline.co.za
742573  test1@polka.co.za
742572  test2@polka.co.za
742570  test3@polka.co.za
742575  testb@polka.co.za
742566  tidal-pools-self-cateri@channels.roomsonline.co.za
741769  rolos-apitest-544d36@roomsonline.co.za  (already archived at channel — keys still get released)
```

Three of the accounts you pasted are **bound** and are refused by design, because they are live inventory:

```text
741761  rooms@roomsonline.co.za   Bound
742577  ru-test-32@roomsonline.co.za   Bound (portfolio DEMO C / RU Test 33)
742574  testc@polka.co.za   Bound
```

To decommission any of those, the binding is retired first (Retire a bound sub-account), then the same purge runs against it.

## How the run is driven

Channel Monitor → Advanced → Orphan distribution accounts: enter the portal password once in the password field, then use **Archive all at channel**. It walks the outstanding registry entries strictly one at a time (never in parallel, so the channel's rate limit is respected), and each row shows the channel's own answer — listings archived, listings refused, keys released. Any account the channel refuses stays flagged "Still live at channel" and can be retried individually.

## Notes

- The channel exposes no verb to archive or rename a sub-account itself — only its listings. Releasing the listings and the API keys is what removes the billable footprint; the login remains visible in the master roster, which is why our roster reads exclude retired ids at source.
- The password is used for the run only and is never stored. Please confirm the exact string: the earlier message in this project used `SLPafrica24&*` and this one repeats it, while a still earlier account was created with `SLPafrica247*`. If a login refuses, the run reports that account as refused rather than guessing.
- After the run, listing counts, the cost monitor and the reconciliation figures refresh so the "listings we bill for" comparison matches the channel.
