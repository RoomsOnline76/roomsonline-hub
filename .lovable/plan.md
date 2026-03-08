

# Smart Book Button Generator

## What It Does
A new interactive component where property owners select their website platform (WordPress, Wix, Squarespace, Custom HTML) and get auto-generated, platform-specific "Book Now" button code with customization options (button text, color, size, style).

## New Component: `src/components/integrations/SmartBookButtonGenerator.tsx`

**Step 1 — Platform Selection**: Radio card grid with 4 options: WordPress, Wix, Squarespace, Custom HTML. Each with icon and brief description.

**Step 2 — Button Customization**:
- Button text (default "Book Now")
- Button color (defaults to property's `brand_primary_color`)
- Button size: Small / Medium / Large
- Button style: Solid / Outline / Pill
- Open in: New tab / Same tab

**Step 3 — Generated Output** (platform-specific):
- **Custom HTML**: Styled `<a>` tag with inline CSS
- **WordPress**: Shortcode `[rolos_button]` + a PHP snippet for the shortcode handler, OR a Gutenberg "Custom HTML" block instruction
- **Wix**: Step-by-step instructions to add via Wix "Embed HTML" element, with the HTML snippet
- **Squarespace**: Instructions to use a "Code Block" with the HTML snippet, plus a Squarespace-friendly CSS override note

Each output includes a live preview of the button and a one-click copy snippet.

## Integration Points

1. **AdminIntegrations page** (`/pms/integrations`): Add as a new tab "Smart Button" (with a `Sparkles` icon) in the existing TabsList — becomes a 7th tab.

2. **PropertyFormIntegrationsTab** (edit property → Integrations tab): Same — add as 7th tab alongside existing ones.

## Files to Create/Modify
- **Create**: `src/components/integrations/SmartBookButtonGenerator.tsx` — the full generator component
- **Edit**: `src/pages/AdminIntegrations.tsx` — add "Smart Button" tab
- **Edit**: `src/components/property/PropertyFormIntegrationsTab.tsx` — add "Smart Button" tab

