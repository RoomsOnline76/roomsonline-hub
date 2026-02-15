import { useEffect, useRef } from 'react';
import { loadBrandFromSession, applyBrandToDocument } from '@/lib/brandOverride';

/**
 * Hook that applies stored property brand overrides to the document root.
 * Used by downstream pages (checkout, confirmation) to maintain
 * property branding across the entire booking flow.
 */
export function useBrandOverride() {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const brand = loadBrandFromSession();
    if (brand?.enabled) {
      cleanupRef.current = applyBrandToDocument(brand);
    }
    return () => {
      cleanupRef.current?.();
    };
  }, []);
}
