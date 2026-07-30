import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";
import { buildPmsBrandVars, type PmsBrandPalette, type UiMode } from "@/lib/brandOverride";
import { loadGoogleFont } from "@/lib/brandFonts";

interface PMSBrandData {
  propertyName: string;
  propertySlug: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  fontColor: string | null;
  accentColor: string | null;
  headingFont: string | null;
  bodyFont: string | null;
  tagline: string | null;
  brandEnabled: boolean;
  loading: boolean;
}

const defaultBrand: PMSBrandData = {
  propertyName: "",
  propertySlug: null,
  logoUrl: null,
  primaryColor: null,
  secondaryColor: null,
  fontColor: null,
  accentColor: null,
  headingFont: null,
  bodyFont: null,
  tagline: null,
  brandEnabled: false,
  loading: true,
};

const PMSBrandContext = createContext<PMSBrandData>(defaultBrand);

export function usePMSBrand() {
  return useContext(PMSBrandContext);
}

/**
 * Apply the PMS white-label palette for the ACTIVE light/dark mode.
 *
 * The PMS always applies brand colours when they exist, but only to brand
 * identity tokens — structural surfaces stay on the theme so dark mode keeps
 * working. Every colour is contrast-corrected for the current mode.
 */
function applyPmsBrand(palette: PmsBrandPalette, mode: UiMode): () => void {
  if (palette.headingFont) loadGoogleFont(palette.headingFont);
  if (palette.bodyFont) loadGoogleFont(palette.bodyFont);

  const vars = buildPmsBrandVars(palette, mode);
  const root = document.documentElement;
  const keys = Object.keys(vars);
  keys.forEach((key) => root.style.setProperty(key, vars[key]));

  return () => keys.forEach((key) => root.style.removeProperty(key));
}


export function PMSBrandProvider({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get("property");
  const [brand, setBrand] = useState<PMSBrandData>(defaultBrand);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!propertyId) {
      setBrand({ ...defaultBrand, loading: false });
      return;
    }

    let cancelled = false;

    async function fetchBrand() {
      const { data } = await supabase
        .from("properties")
        .select("name, slug, brand_override_enabled, brand_primary_color, brand_secondary_color, brand_font_color, brand_accent_color, brand_logo_url, brand_heading_font, brand_body_font")
        .eq("id", propertyId!)
        .single();

      if (cancelled || !data) {
        if (!cancelled) setBrand({ ...defaultBrand, loading: false });
        return;
      }

      // Also fetch custom tagline from rolos_brand_config
      const { data: brandConfig } = await supabase
        .from("rolos_brand_config" as any)
        .select("custom_tagline")
        .eq("property_id", propertyId!)
        .maybeSingle();

      if (cancelled) return;

      const hasColors = !!(data.brand_primary_color);

      setBrand({
        propertyName: data.name,
        propertySlug: (data as any).slug || null,
        logoUrl: data.brand_logo_url,
        primaryColor: data.brand_primary_color,
        secondaryColor: data.brand_secondary_color,
        fontColor: data.brand_font_color,
        accentColor: (data as any).brand_accent_color || null,
        headingFont: (data as any).brand_heading_font || null,
        bodyFont: (data as any).brand_body_font || null,
        tagline: (brandConfig as any)?.custom_tagline || null,
        brandEnabled: hasColors,
        loading: false,
      });

      // PMS always applies brand colours when they exist
      cleanupRef.current?.();
      if (hasColors) {
        cleanupRef.current = applyPmsBrand(
          data.brand_primary_color,
          data.brand_secondary_color,
          data.brand_font_color,
          (data as any).brand_accent_color,
          (data as any).brand_heading_font,
          (data as any).brand_body_font,
        );
      }
    }

    fetchBrand();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [propertyId]);

  return (
    <PMSBrandContext.Provider value={brand}>
      {children}
    </PMSBrandContext.Provider>
  );
}
