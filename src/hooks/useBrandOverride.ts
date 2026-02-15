import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  loadBrandFromSession,
  saveBrandToSession,
  applyBrandToDocument,
  type PropertyBrand,
} from '@/lib/brandOverride';

/**
 * Hook that applies stored property brand overrides to the document root.
 * 
 * When called with a propertyIdentifier (slug or UUID), it will:
 * 1. Check sessionStorage for cached brand data
 * 2. If not found, fetch brand settings from the database
 * 3. Apply CSS custom properties to document.documentElement
 * 
 * This ensures branding works even on direct navigation (not coming from PropertyShowcase).
 */
export function useBrandOverride(propertyIdentifier?: string | null) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    // Try session first
    const cached = loadBrandFromSession();
    if (cached?.enabled) {
      // If cached brand matches the current property (or no identifier given), apply it
      if (!propertyIdentifier || cached.propertyId === propertyIdentifier) {
        cleanupRef.current = applyBrandToDocument(cached);
        return () => { cleanupRef.current?.(); };
      }
    }

    // If no identifier provided, nothing more to do
    if (!propertyIdentifier) return;

    // Avoid duplicate fetches for same identifier
    if (fetchedRef.current === propertyIdentifier) return;
    fetchedRef.current = propertyIdentifier;

    let cancelled = false;

    async function fetchBrand() {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(propertyIdentifier!);

        let query = supabase
          .from('properties')
          .select('id, brand_override_enabled, brand_primary_color, brand_secondary_color, brand_font_color, brand_logo_url');

        if (isUuid) {
          query = query.eq('id', propertyIdentifier!);
        } else {
          query = query.eq('slug', propertyIdentifier!);
        }

        const { data } = await query.single();

        if (cancelled || !data) return;

        if (data.brand_override_enabled && data.brand_primary_color) {
          const brand: PropertyBrand = {
            enabled: true,
            primaryColor: data.brand_primary_color,
            secondaryColor: data.brand_secondary_color,
            fontColor: data.brand_font_color,
            logoUrl: data.brand_logo_url,
            propertyId: data.id,
          };
          saveBrandToSession(brand);
          cleanupRef.current = applyBrandToDocument(brand);
        }
      } catch {
        // Silent fail — branding is enhancement, not critical
      }
    }

    fetchBrand();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
    };
  }, [propertyIdentifier]);
}
