/**
 * Google Font loading and CSS custom property management for brand fonts.
 */

const loadedFonts = new Set<string>();

/** Inject a Google Fonts <link> into <head> if not already present */
export function loadGoogleFont(fontFamily: string): void {
  if (!fontFamily || loadedFonts.has(fontFamily)) return;
  loadedFonts.add(fontFamily);

  const encoded = fontFamily.replace(/ /g, '+');
  const id = `gfont-${encoded}`;
  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@300;400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

/**
 * Apply brand fonts as CSS custom properties on :root and return a cleanup fn.
 * Also loads Google Fonts if needed.
 */
export function applyBrandFonts(
  headingFont?: string | null,
  bodyFont?: string | null,
): () => void {
  const root = document.documentElement;
  const applied: string[] = [];

  if (headingFont) {
    loadGoogleFont(headingFont);
    root.style.setProperty('--font-heading', `'${headingFont}', serif`);
    applied.push('--font-heading');
  }

  if (bodyFont) {
    loadGoogleFont(bodyFont);
    root.style.setProperty('--font-body', `'${bodyFont}', sans-serif`);
    applied.push('--font-body');
  }

  return () => {
    applied.forEach((key) => root.style.removeProperty(key));
  };
}
