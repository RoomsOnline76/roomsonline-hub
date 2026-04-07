

# Performance Optimization — FCP < 2s, Smooth Booking Engine

## 1. Code-Splitting via `vite.config.ts`

Add `build.rollupOptions.output.manualChunks` to split heavy vendor and page bundles:

```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        'vendor-query': ['@tanstack/react-query'],
        'vendor-motion': ['framer-motion'],
        'booking': ['./src/pages/Booking.tsx'],
      }
    }
  }
}
```

This isolates the largest dependencies into cacheable chunks and separates the heavy Booking page.

## 2. Lazy-Load Remaining Eager Public Pages

Currently **20 public pages are eagerly imported** (lines 19–40 of App.tsx), including `Booking`, `PropertyListing`, `EmbedProperty`, `EmbedPortfolio`, `ContractSign`, `PropertyOnboarding`, `GuestPortal`, etc. Only `Home`, `Auth`, and `NotFound` need to stay eager for FCP.

**Change**: Convert all non-critical public pages to `lazy()` imports. Keep `Home`, `Auth`, `NotFound` eager. Wrap all lazy routes in the existing `<Suspense>` with the skeleton fallback already defined in App.tsx.

## 3. QueryClient Global Defaults

The `QueryClient` at line 158 has **no default options**. Add sensible global defaults to reduce refetching across all hooks:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,      // 5 min
      gcTime: 10 * 60 * 1000,         // 10 min
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

This means individual hooks no longer need to repeat these settings (many already set `staleTime: 5 * 60 * 1000` individually). Hooks that need fresh data (like Dashboard with `staleTime: 0`) already override locally.

## 4. Memoize PropertyCard

`PropertyCard` is rendered in lists (segments, search results) and re-renders on every parent state change. Wrap with `React.memo` and stabilize:

- Wrap export: `export const PropertyCard = memo(PropertyCardInner)`
- Add custom comparator checking `property.id`, `variant`, `showCautionBadge`
- Image URL computation is already in `useMemo` — good

## 5. Image Lazy Loading

`PropertyCard` already has `loading="lazy"` — confirmed. The `BuildingGallery` also has `loading="lazy"`. Check and add `loading="lazy"` to any remaining `<img>` tags across showcase components. Add `decoding="async"` to all property images for non-blocking decode.

No `next/image` equivalent needed — Vite projects use native `loading="lazy"` + `decoding="async"` which achieves the same result without a framework dependency.

## 6. Bundle Analysis

Add a script to `package.json` for on-demand analysis:
```json
"analyze": "vite build && npx rollup-plugin-visualizer"
```

Actually, use `rollup-plugin-visualizer` as a Vite plugin in analyze mode — simpler and more accurate for Vite projects.

---

## Files Changed

| File | Change |
|---|---|
| `vite.config.ts` | Add `build.rollupOptions.output.manualChunks` + visualizer plugin (dev only) |
| `src/App.tsx` | Convert ~15 eager public imports to `lazy()`. Add `defaultOptions` to `QueryClient`. |
| `src/components/PropertyCard.tsx` | Wrap with `React.memo` + custom comparator, add `decoding="async"` to img |
| `src/components/showcase/BuildingGallery.tsx` | Add `decoding="async"` to images |

## What does NOT change
- No database or edge function changes
- No routing behavior changes — all routes resolve identically
- Hooks that already set `staleTime` locally continue to work (local overrides global)
- No new dependencies (visualizer is dev-only, optional)

