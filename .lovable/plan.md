

# Add Portfolio Showcase Link Button

## Change

Add an "Open" / "View" button (ExternalLink icon) to each portfolio row's action buttons that opens the portfolio showcase page (`/embed/portfolio/{slug}`) in a new tab using the `PUBLIC_DOMAIN` from config.

## File

| Action | File | What |
|--------|------|------|
| Modify | `src/pages/admin/AdminPortfolios.tsx` | Import `ExternalLink` from lucide-react and `PUBLIC_DOMAIN` from `@/lib/config`. Add a new button in the actions column (line ~318) that opens `{PUBLIC_DOMAIN}/embed/portfolio/{slug}` in a new tab. |

## Detail

In the actions `<div>` (line 317), add before the copy button:

```tsx
<Button variant="ghost" size="icon" className="h-7 w-7"
  onClick={() => window.open(`${PUBLIC_DOMAIN}/embed/portfolio/${p.slug}`, '_blank')}>
  <ExternalLink className="h-3.5 w-3.5" />
</Button>
```

Single line addition — no other changes needed.

