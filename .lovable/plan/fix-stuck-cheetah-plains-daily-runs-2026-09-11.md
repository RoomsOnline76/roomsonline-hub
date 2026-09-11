# Fix stuck Cheetah Plains daily runs

- Preserve completed file parsing and retry counters when Build is pressed again.
- If a worker call fails, immediately move the run from Processing to Failed with the visible error.
- Recover the current stale run, then rerun and verify it reaches a terminal state.
- Verify the app build and the generated workbook/report paths.
