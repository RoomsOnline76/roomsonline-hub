/**
 * Property Brand Override Utilities
 * Manages CSS custom property injection for property-specific branding
 * across the entire booking flow (showcase, calendar, checkout, confirmation).
 */

const BRAND_STORAGE_KEY = 'rol_property_brand';

export interface PropertyBrand {
  enabled: boolean;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  fontColor?: string | null;
  logoUrl?: string | null;
  headingFont?: string | null;
  bodyFont?: string | null;
  headingTextColor?: string | null;
  bodyTextColor?: string | null;
  mutedTextColor?: string | null;
  lightBgColor?: string | null;
  darkBgColor?: string | null;
  propertyId: string;
}

/** Convert hex (#rrggbb) to "H S% L%" for CSS custom properties */
export function hexToHsl(hex: string): string | null {
  const clean = hex.replace("#", "");
  if (clean.length < 6) return null;
  let r = parseInt(clean.substring(0, 2), 16) / 255;
  let g = parseInt(clean.substring(2, 4), 16) / 255;
  let b = parseInt(clean.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Determine best foreground for a given bg (white or black) */
export function autoForeground(bgHex: string): string {
  const clean = bgHex.replace("#", "");
  if (clean.length < 6) return "0 0% 100%";
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return lum > 0.4 ? "220 20% 12%" : "0 0% 100%";
}

/** Compute CSS variable map from brand config */
export function buildBrandVarsMap(brand: PropertyBrand): Record<string, string> {
  if (!brand.enabled) return {};
  const vars: Record<string, string> = {};

  if (brand.primaryColor) {
    const hsl = hexToHsl(brand.primaryColor);
    if (hsl) {
      vars["--primary"] = hsl;
      vars["--primary-foreground"] = autoForeground(brand.primaryColor);
      vars["--ring"] = hsl;
    }
  }
  if (brand.secondaryColor) {
    const hsl = hexToHsl(brand.secondaryColor);
    if (hsl) {
      vars["--secondary"] = hsl;
      vars["--secondary-foreground"] = autoForeground(brand.secondaryColor);
      vars["--muted"] = hsl;
      vars["--muted-foreground"] = autoForeground(brand.secondaryColor);
    }
  }
  if (brand.fontColor) {
    const hsl = hexToHsl(brand.fontColor);
    if (hsl) {
      vars["--foreground"] = hsl;
      vars["--card-foreground"] = hsl;
      vars["--popover-foreground"] = hsl;
    }
  }
  if (brand.headingFont) {
    vars["--font-heading"] = `'${brand.headingFont}', serif`;
  }
  if (brand.bodyFont) {
    vars["--font-body"] = `'${brand.bodyFont}', sans-serif`;
  }
  return vars;
}

/**
 * Apply brand CSS vars to document.documentElement so all portals
 * (drawers, dialogs, modals) inherit the overridden colours.
 * Returns a cleanup function that removes the vars.
 */
export function applyBrandToDocument(brand: PropertyBrand): () => void {
  // Load Google Fonts if specified
  if (brand.headingFont || brand.bodyFont) {
    const { loadGoogleFont } = await_loadGoogleFont();
    if (brand.headingFont) loadGoogleFont(brand.headingFont);
    if (brand.bodyFont) loadGoogleFont(brand.bodyFont);
  }

  const vars = buildBrandVarsMap(brand);
  const root = document.documentElement;
  const body = document.body;
  const keys = Object.keys(vars);

  keys.forEach((key) => {
    root.style.setProperty(key, vars[key]);
    body.style.setProperty(key, vars[key]);
  });

  return () => {
    keys.forEach((key) => {
      root.style.removeProperty(key);
      body.style.removeProperty(key);
    });
  };
}

/** Lazy font loader to avoid circular imports */
function await_loadGoogleFont() {
  // Inline implementation to avoid import issues
  const loadedFonts = new Set<string>();
  return {
    loadGoogleFont(fontFamily: string) {
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
  };
}

/** Persist brand info to sessionStorage so downstream pages can read it */
export function saveBrandToSession(brand: PropertyBrand): void {
  sessionStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(brand));
}

/** Read brand info from sessionStorage */
export function loadBrandFromSession(): PropertyBrand | null {
  try {
    const raw = sessionStorage.getItem(BRAND_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PropertyBrand;
  } catch {
    return null;
  }
}

/** Clear persisted brand info */
export function clearBrandFromSession(): void {
  sessionStorage.removeItem(BRAND_STORAGE_KEY);
}

/**
 * Synchronously apply cached brand from sessionStorage.
 * Returns true if brand was found and applied, false otherwise.
 * Call this outside React lifecycle to prevent FOUC.
 */
export function applyCachedBrandSync(): boolean {
  const cached = loadBrandFromSession();
  if (!cached?.enabled || !cached.primaryColor) return false;
  applyBrandToDocument(cached);
  return true;
}
