# Fix: published build number differs from preview

## What's wrong

The badge number is computed at build time from `git rev-list --count HEAD`.

- The preview sandbox has the full git history: **14,583 commits** → `v1.211 · Build 10` (correct).
- The publish build environment gets a truncated clone, so it counts only **36 commits** → `v1.0 · Build 36`.

So the two environments genuinely see different histories. Any scheme that reads the commit count *at publish time* will keep drifting.

## The fix: bake the number into the repo

Stop asking the deploy environment to count commits. Record the sequence in a small committed file that ships with the code, so preview and the live domain read the exact same value.

1. Add `src/build-seq.json` — a one-line file holding the current sequence (`14583`) and the stamp time.
2. The Vite plugin becomes: read the committed file, read the git count if git history is available, and use **whichever is higher**. In the sandbox git wins and the plugin rewrites the file so the new number gets committed with the change; in the publish environment git returns a small number, the committed file wins, and the badge matches preview.
3. Keep the existing `v1.<cycles> · Build <1..69>` display maths and the `VITE_COMMIT_COUNT` env fallback untouched.

Result: the domain badge will read the same as preview (currently `v1.211 · Build 10`) and advance by one per prompt, since each prompt commits the refreshed file.

## Technical notes

- `vite.config.ts`: replace `commitCount()` with `resolveBuildSeq()` = `Math.max(gitCount, storedCount)`; write the file back only when `gitCount > storedCount` and only outside the production build, so a deploy never mutates source.
- `src/lib/appVersion.ts`: unchanged logic; it already prefers `VITE_COMMIT_COUNT` then the virtual module.
- The badge will not change in preview — it is already correct there. The live value updates on the next publish.
