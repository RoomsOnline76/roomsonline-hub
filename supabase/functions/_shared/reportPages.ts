// Canonical page catalogue for the draft revenue report. Mirrors
// src/lib/reportPages.ts — keep both in step.

export const mediaPageKey = (section: string): string => `media:${section}`;

export const mediaImagePageKey = (imageId: string): string => `media:img:${imageId}`;

/**
 * Legacy saved orders reference a whole media section (e.g. `media:Additional
 * Slides`). Swap such a key for the per-image slide keys at the same position so
 * runs saved before per-slide ordering keep their sequence.
 */
export function expandLegacyMediaKeys(
  saved: string[] | null | undefined,
  expansions: Record<string, string[]>,
): string[] {
  if (!saved || saved.length === 0) return [];
  const out: string[] = [];
  for (const key of saved) {
    const replacement = expansions[key];
    if (replacement) out.push(...replacement.filter((entry) => !out.includes(entry)));
    else if (!out.includes(key)) out.push(key);
  }
  return out;
}

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
