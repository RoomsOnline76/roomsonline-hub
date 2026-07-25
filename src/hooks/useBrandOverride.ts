import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  loadBrandFromSession,
  saveBrandToSession,
  applyBrandToDocument,
  applyCachedBrandSync,
  type PropertyBrand,
} from '@/lib/brandOverride';

/**
 * Hook that applies stored property brand overrides to the document root.
 * Returns { brandReady } — true once branding is resolved (cached, fetched, or not applicable).
 */
export function useBrandOverride(propertyIdentifier?: string | null): { brandReady: boolean } {
  const cleanupRef = useRef<(() => void) | null>(null);
  const fetchedRef = useRef<string | null>(null);
  const [brandReady, setBrandReady] = useState(() => {
    // Synchronous check: if cached brand exists, apply immediately and mark ready
    const cached = loadBrandFromSession();
    if (cached?.enabled && cached.primaryColor) {
      if (!propertyIdentifier || cached.propertyId === propertyIdentifier) {
        return true; // inline script already applied vars
      }
    }
    // If no identifier needed, ready immediately
    if (!propertyIdentifier) return true;
    return false;
  });

  useEffect(() => {
    // Try session first (synchronous path)
    const cached = loadBrandFromSession();
    if (cached?.enabled) {
      if (!propertyIdentifier || cached.propertyId === propertyIdentifier) {
        cleanupRef.current = applyBrandToDocument(cached);
        setBrandReady(true);
        return () => { cleanupRef.current?.(); };
      }
    }

    // If no identifier provided, nothing more to do
    if (!propertyIdentifier) {
      setBrandReady(true);
      return;
    }

    // Avoid duplicate fetches for same identifier
    if (fetchedRef.current === propertyIdentifier) return;
    fetchedRef.current = propertyIdentifier;

    let cancelled = false;

    async function fetchBrand() {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(propertyIdentifier!);

        let query = supabase
          .from('properties')
          .select('id, brand_override_enabled, brand_primary_color, brand_secondary_color, brand_font_color, brand_logo_url, brand_heading_font, brand_body_font, brand_heading_text_color, brand_body_text_color, brand_muted_text_color, brand_light_bg_color, brand_dark_bg_color');

        if (isUuid) {
          query = query.eq('id', propertyIdentifier!);
        } else {
          query = query.eq('slug', propertyIdentifier!);
        }

        const { data } = await query.single();

        if (cancelled || !data) {
          if (!cancelled) setBrandReady(true);
          return;
        }

        if (data.brand_override_enabled && data.brand_primary_color) {
          const brand: PropertyBrand = {
            enabled: true,
            primaryColor: data.brand_primary_color,
            secondaryColor: data.brand_secondary_color,
            fontColor: data.brand_font_color,
            logoUrl: data.brand_logo_url,
            headingFont: (data as any).brand_heading_font,
            bodyFont: (data as any).brand_body_font,
            headingTextColor: (data as any).brand_heading_text_color,
            bodyTextColor: (data as any).brand_body_text_color,
            mutedTextColor: (data as any).brand_muted_text_color,
            lightBgColor: (data as any).brand_light_bg_color,
            darkBgColor: (data as any).brand_dark_bg_color,
            propertyId: data.id,
          };
          saveBrandToSession(brand);
          cleanupRef.current = applyBrandToDocument(brand);
        }
        if (!cancelled) setBrandReady(true);
      } catch {
        if (!cancelled) setBrandReady(true);
      }
    }

    fetchBrand();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
    };
  }, [propertyIdentifier]);

  return { brandReady };
}
