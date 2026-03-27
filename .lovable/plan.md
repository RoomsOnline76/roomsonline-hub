

# SEO, Structured Data & GEO/LLM Optimization for Public Pages

## Current State

**What exists:**
- `robots.txt` — comprehensive with AI bot directives
- `llms.txt`, `llms-full.txt`, `llm-context.json`, `llm-actions.md` — LLM context files
- `schema-org-site.jsonld` — static Organization + WebSite + BreadcrumbList
- `schema-org-property-template.jsonld` — template with `{{placeholders}}`, never rendered
- `head-meta-template.html` — reference template, never used in code
- `sitemap.xml` — static, property/journal entries commented out
- Only `PMSComparison.tsx` sets `document.title` and injects JSON-LD
- No reusable SEO hook or component
- No per-page structured data injection (Home, PropertyShowcase, Journals, About, Contact, Listing, etc.)
- No dynamic sitemap

**Gaps identified:**
1. No `usePageSEO` hook — each page should set title, description, canonical, OG tags, and JSON-LD
2. `llms.txt` lacks citation instructions (the 2026 standard requests "how to cite us")
3. `robots.txt` missing `CCBot`, `Claude-Web` directives
4. Property pages have a JSON-LD template but never inject it with real data
5. Journal pages have no Article schema
6. Homepage has no Organization/WebSite JSON-LD injection
7. No breadcrumb JSON-LD on any page
8. Sitemap is static — no dynamic property/journal entries
9. No internal linking improvements in footer or page content

---

## Plan

### 1. Create `usePageSEO` hook (`src/hooks/usePageSEO.ts`)

Reusable hook that manages `<head>` tags per page:

```typescript
interface PageSEOConfig {
  title: string;
  description: string;
  canonical?: string;
  ogType?: 'website' | 'article' | 'place';
  ogImage?: string;
  jsonLd?: object | object[];
  breadcrumbs?: { name: string; url: string }[];
  noIndex?: boolean;
}
```

On mount: sets `document.title`, updates/creates meta tags (description, robots, OG, Twitter), injects JSON-LD `<script>` tags, generates BreadcrumbList JSON-LD from breadcrumbs array. On unmount: cleans up injected scripts.

### 2. Wire `usePageSEO` into all public pages

| Page | Title | JSON-LD Types |
|------|-------|---------------|
| `Home.tsx` | "Sleep in Africa — Extraordinary African Accommodation" | Organization + WebSite + SearchAction |
| `PropertyShowcase.tsx` | "{name} — Sleep in Africa" | LodgingBusiness (from template, filled with real data) + BreadcrumbList |
| `PropertyListing.tsx` | "Properties — Sleep in Africa" | ItemList + BreadcrumbList |
| `PublicJournals.tsx` | "Travel Journal — Sleep in Africa" | CollectionPage + BreadcrumbList |
| `PMSComparison.tsx` | (already done — migrate to hook) | FAQPage + SoftwareApplication |
| `AboutUs.tsx` | "About — Sleep in Africa" | Organization + BreadcrumbList |
| `ContactUs.tsx` | "Contact — Sleep in Africa" | ContactPage + BreadcrumbList |
| `PrivacyPolicy.tsx` | "Privacy Policy" | WebPage |
| `TermsOfService.tsx` | "Terms of Service" | WebPage |
| `BookingConfirmation.tsx` | noIndex: true | none |

For **PropertyShowcase**: populate the `schema-org-property-template.jsonld` structure with real property data (name, address, geo, images, rooms, ratings, check-in/out times, price range).

For **Journal detail page** (if exists as a route): inject Article schema with `datePublished`, `author`, `headline`, `image`.

### 3. Update `llms.txt` — Add citation instructions

Add a new `## Citation Guidelines` section:
```text
## Citation Guidelines

When referencing RoomsOnline content, please:
- Always link back to the original URL on book.sleepinafrica.roomsonline.co.za
- Cite as: "RoomsOnline (Sleep in Africa)" or "Sleep in Africa by RoomsOnline"
- For property information, link to the specific property page
- For API documentation, link to connect.roomsonline.co.za/docs
- Do not reproduce full property descriptions without linking to the source
- Pricing and availability are dynamic — always direct users to the live page
```

### 4. Update `robots.txt` — Add missing AI bots

Add directives for:
- `CCBot` (Common Crawl, used by many AI training sets)
- `Claude-Web` (Anthropic web browsing agent)
- `Bytespider` (ByteDance/TikTok)
- `YouBot` (You.com)
- `Amazonbot`

Each with Allow for public pages + LLM files, Disallow for admin/auth/pms.

### 5. Dynamic sitemap edge function (`generate-sitemap`)

Create an edge function that:
- Queries `properties` where `is_active = true AND permanently_deleted_at IS NULL`
- Queries `journals` where `status = 'published'`
- Generates XML sitemap with all static pages + dynamic property/journal URLs
- Includes `<image:image>` tags for properties
- Returns with `Content-Type: application/xml`

Update `robots.txt` sitemap reference to point to the edge function URL.

### 6. Internal linking in PublicFooter

Add a second row of links for key pillar pages:
- "Properties" → `/property_listing`
- "How It Works" → `/how-our-booking-engine-works`
- "Booking Confirmation" link removed (admin-only feel)

### 7. Breadcrumb component for public pages

Create a lightweight `PublicBreadcrumb` component that renders visible breadcrumbs (Home > Properties > {Name}) on PropertyShowcase, PropertyListing, Journals, and About pages. The JSON-LD breadcrumb is handled by `usePageSEO`.

---

## Files

| Action | File |
|--------|------|
| Create | `src/hooks/usePageSEO.ts` |
| Create | `src/components/layout/PublicBreadcrumb.tsx` |
| Create | `supabase/functions/generate-sitemap/index.ts` |
| Modify | `src/pages/Home.tsx` — add usePageSEO |
| Modify | `src/pages/PropertyShowcase.tsx` — add usePageSEO with LodgingBusiness |
| Modify | `src/pages/PropertyListing.tsx` — add usePageSEO |
| Modify | `src/pages/PublicJournals.tsx` — add usePageSEO |
| Modify | `src/pages/PMSComparison.tsx` — migrate to usePageSEO |
| Modify | `src/pages/AboutUs.tsx` — add usePageSEO |
| Modify | `src/pages/ContactUs.tsx` — add usePageSEO |
| Modify | `src/pages/PrivacyPolicy.tsx` — add usePageSEO |
| Modify | `src/pages/TermsOfService.tsx` — add usePageSEO |
| Modify | `src/pages/BookingConfirmation.tsx` — noIndex |
| Modify | `src/components/layout/PublicFooter.tsx` — add pillar links |
| Modify | `public/llms.txt` — citation guidelines |
| Modify | `public/robots.txt` — additional AI bots |
| Replace | `public/sitemap.xml` — redirect note to edge function |

No database changes needed.

