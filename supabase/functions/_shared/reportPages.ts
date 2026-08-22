// Canonical page catalogue for the draft revenue report. Mirrors
// src/lib/reportPages.ts — keep both in step.

export const mediaPageKey = (section: string): string => `media:${section}`;

/**
 * Applies a saved order to a list of page keys: known keys first in saved
 * order, then anything new appended so a fresh section never disappears.
 */
export function orderPageKeys(available: string[], saved: string[] | null | undefined): string[] {
  if (!saved || saved.length === 0) return available;
  const set = new Set(available);
  const ordered = saved.filter((key) => set.has(key));
  const rest = available.filter((key) => !ordered.includes(key));
  return [...ordered, ...rest];
}
