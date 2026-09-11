# Fix the Channel Manager error box on the live site

## What you're seeing

On the published site, the Channel Manager panel shows a warning box with the raw text
`error_occurred_message` and an endless spinner. In the preview it works. That difference
is the clue: it is a hosting-rules problem, not a Channel Manager problem.

## Cause

The Channel Manager runs inside its own small page at `/channel-manager/`. Two hosting
rule files still send that address to an old page (`ru-embed.html`) that was removed
during the last change:

- `public/_redirects`: `/channel-manager/* /ru-embed.html 200`
- `vercel.json`: rewrite `/channel-manager/(.*)` to `/ru-embed.html`

Live, that request returns nothing usable, so the Channel Manager software loads with no
setup values and shows its own generic warning — and because it never finished loading,
the warning text stays as the untranslated placeholder `error_occurred_message`.

## Fix

1. Remove the `/channel-manager/*` line from `public/_redirects`, leaving only the normal
   catch-all. Lovable hosting serves the real `public/channel-manager/index.html` file
   first and has built-in page-refresh handling, so no extra rule is needed.
2. Remove the `/channel-manager/(.*)` rewrite from `vercel.json` for the same reason, so
   the real file is served instead of the deleted one.
3. Leave the Channel Manager page itself, the sign-in token function, the panel component
   and the app's own routing untouched.

## After the change

Publish, then open the Connect channels panel on the live site: the Channel Manager should
load its own screen (channel list / connection steps) instead of the warning box. If a
warning still appears after that, it will come from the Channel Manager service itself and
we chase it with its own network responses.

## Technical notes

- No edge function, database or component changes; only the two hosting rule files.
- `vite.config.ts` already maps `/channel-manager` and `/channel-manager/*` to the physical
  document for local preview, which is why preview behaves correctly today.
- Verify after publish that `/channel-manager/?probe=1` on the live domain returns the small
  Channel Manager host document (title "Channel Manager"), not the main app shell.
