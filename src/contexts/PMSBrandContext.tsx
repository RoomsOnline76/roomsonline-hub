import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  applyBrandToDocument,
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

      const enabled = !!data.brand_override_enabled && !!data.brand_primary_color;

      setBrand({
        propertyName: data.name,
        logoUrl: data.brand_logo_url,
        primaryColor: data.brand_primary_color,
        secondaryColor: data.brand_secondary_color,
        fontColor: data.brand_font_color,
        tagline: (brandConfig as any)?.custom_tagline || null,
        brandEnabled: enabled,
        loading: false,
      });

      // Apply CSS vars
      if (enabled) {
        cleanupRef.current?.();
        const brandObj: PropertyBrand = {
          enabled: true,
          primaryColor: data.brand_primary_color,
          secondaryColor: data.brand_secondary_color,
          fontColor: data.brand_font_color,
          logoUrl: data.brand_logo_url,
          propertyId: propertyId!,
        };
        cleanupRef.current = applyBrandToDocument(brandObj);
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
