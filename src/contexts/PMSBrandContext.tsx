import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  hexToHsl,
  autoForeground,
  type PropertyBrand,
} from "@/lib/brandOverride";

interface PMSBrandData {
  propertyName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  fontColor: string | null;
  tagline: string | null;
  brandEnabled: boolean;
  loading: boolean;
}

const defaultBrand: PMSBrandData = {
  propertyName: "",
  logoUrl: null,
  primaryColor: null,
  secondaryColor: null,
  fontColor: null,
  tagline: null,
  brandEnabled: false,
  loading: true,
};

const PMSBrandContext = createContext<PMSBrandData>(defaultBrand);

export function usePMSBrand() {
  return useContext(PMSBrandContext);
}

/**
 * Build CSS vars for PMS white-label. Unlike the public booking flow,
 * the PMS ALWAYS applies brand colours when they exist – no toggle needed.
 * This makes the property feel like it has its own custom software.
 */
function applyPmsBrand(primary?: string | null, secondary?: string | null, font?: string | null): () => void {
  const root = document.documentElement;
  const applied: string[] = [];

  const set = (key: string, val: string) => {
    root.style.setProperty(key, val);
    applied.push(key);
  };

  if (primary) {
    const hsl = hexToHsl(primary);
    if (hsl) {
      set("--primary", hsl);
      set("--primary-foreground", autoForeground(primary));
      set("--ring", hsl);
      // Chart colour 1
      set("--chart-1", hsl);
    }
  }

  if (secondary) {
    const hsl = hexToHsl(secondary);
    if (hsl) {
      set("--secondary", hsl);
      set("--secondary-foreground", autoForeground(secondary));
      set("--muted", hsl);
      set("--muted-foreground", autoForeground(secondary));
    }
  }

  if (font) {
    const hsl = hexToHsl(font);
    if (hsl) {
      set("--foreground", hsl);
      set("--card-foreground", hsl);
      set("--popover-foreground", hsl);
    }
  }

  return () => {
    applied.forEach((key) => root.style.removeProperty(key));
  };
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
        .select("name, brand_override_enabled, brand_primary_color, brand_secondary_color, brand_font_color, brand_logo_url")
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
        logoUrl: data.brand_logo_url,
        primaryColor: data.brand_primary_color,
        secondaryColor: data.brand_secondary_color,
        fontColor: data.brand_font_color,
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
