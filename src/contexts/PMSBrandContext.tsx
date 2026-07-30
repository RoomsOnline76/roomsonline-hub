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
  const { resolvedTheme } = useTheme();
  const mode: UiMode = resolvedTheme === "dark" ? "dark" : "light";
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

      // Portfolio parity: when the property carries no palette of its own, fall
      // back to the portfolio branding so portfolio views are branded the same.
      let portfolioBranding: Record<string, string> | null = null;
      if (!data.brand_primary_color) {
        const { data: member } = await supabase
          .from("property_portfolio_members" as any)
          .select("portfolio_id")
          .eq("property_id", propertyId!)
          .limit(1)
          .maybeSingle();
        const portfolioId = (member as any)?.portfolio_id;
        if (portfolioId) {
          const { data: portfolio } = await supabase
            .from("property_portfolios" as any)
            .select("metadata")
            .eq("id", portfolioId)
            .maybeSingle();
          portfolioBranding = ((portfolio as any)?.metadata?.branding as Record<string, string>) || null;
        }
      }
      if (cancelled) return;

      const palette: PmsBrandPalette = {
        primaryColor: data.brand_primary_color || portfolioBranding?.primary_color || null,
        secondaryColor: data.brand_secondary_color || portfolioBranding?.secondary_color || null,
        fontColor: data.brand_font_color || portfolioBranding?.font_color || null,
        accentColor: (data as any).brand_accent_color || null,
        headingFont: (data as any).brand_heading_font || null,
        bodyFont: (data as any).brand_body_font || null,
      };

      setBrand({
        propertyName: data.name,
        propertySlug: (data as any).slug || null,
        logoUrl: data.brand_logo_url || portfolioBranding?.logo_url || null,
        primaryColor: palette.primaryColor ?? null,
        secondaryColor: palette.secondaryColor ?? null,
        fontColor: palette.fontColor ?? null,
        accentColor: palette.accentColor ?? null,
        headingFont: palette.headingFont ?? null,
        bodyFont: palette.bodyFont ?? null,
        tagline: (brandConfig as any)?.custom_tagline || null,
        brandEnabled: !!palette.primaryColor,
        loading: false,
      });
    }

    fetchBrand();

    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  /**
   * Re-apply the palette whenever the brand OR the light/dark mode changes.
   * Without the mode dependency, brand vars written for light mode would keep
   * overriding the dark theme and make the ROLOS UI unreadable.
   */
  useEffect(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!brand.brandEnabled) return;

    cleanupRef.current = applyPmsBrand(
      {
        primaryColor: brand.primaryColor,
        secondaryColor: brand.secondaryColor,
        fontColor: brand.fontColor,
        accentColor: brand.accentColor,
        headingFont: brand.headingFont,
        bodyFont: brand.bodyFont,
      },
      mode,
    );

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [
    brand.brandEnabled,
    brand.primaryColor,
    brand.secondaryColor,
    brand.fontColor,
    brand.accentColor,
    brand.headingFont,
    brand.bodyFont,
    mode,
  ]);


  return (
    <PMSBrandContext.Provider value={brand}>
      {children}
    </PMSBrandContext.Provider>
  );
}
