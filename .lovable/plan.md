

# Interactive Widget Configurators with Visual Previews

## Problem
Currently, only the **Smart Button** and **Widget Setup Wizard** offer interactive configuration with live previews. The remaining five integration types — Direct Link, Widget (code tab), Booking Bar, Full Embed, and Elementor — only show static code snippets with no visual sample of what the output looks like. Owners cannot see or test these tools before deploying them.

## Solution
Add a **visual preview panel** and **interactive controls** to every integration tab so owners can configure, preview, and test each embeddable tool directly within the system.

## Changes

### 1. Upgrade `ElementorTab.tsx` — Full interactive configurator
Replace static widget cards with an interactive configurator per widget type:
- **Controls panel**: Brand color picker, layout selector, height slider, months-to-display for availability grid, show/hide toggles for property card
- **Live preview**: Renders a styled mockup of each widget (booking widget shows a miniature calendar + room card + book button; property card shows a card with image placeholder, price, and availability badge; availability grid shows a mini month grid with colored cells)
- **Shortcode generator**: Updates dynamically as controls change
- **"Test in new tab" button**: Opens the actual embed URL with current config

### 2. Upgrade `BookingBarTab.tsx` — Add visual preview
- Add a **contained preview area** that renders the booking bar inside a mock browser frame (not fixed to page bottom) so owners can see exactly what it looks like
- Add color picker and position controls (bottom/top)
- Preview updates live as brand color changes

### 3. Upgrade `FullEmbedTab.tsx` — Add live iframe preview
- Add a "Show Preview" toggle (like WidgetSetupWizard has)
- When toggled, render the actual embed iframe in a bordered container with height control
- Add brand color picker that regenerates the snippet and preview URL

### 4. Upgrade `DirectLinkTab.tsx` — Add button preview
- Show a live-rendered preview of the "Book Now" button with the current brand color
- Add button style controls: solid/outline/pill, size small/medium/large (similar to SmartBookButtonGenerator but simpler)
- "Test link" button that opens the booking URL in a new tab

### 5. Upgrade `WidgetTab.tsx` — Add inline preview
- Add a collapsible live preview iframe (matches WidgetSetupWizard pattern)
- The WidgetSetupWizard already handles customization; WidgetTab just needs the preview toggle for the default snippet

### 6. Create `WidgetPreviewFrame.tsx` — Shared preview component
A reusable component that renders a mock browser chrome (URL bar, dots) around an iframe or rendered content. Used by all tabs for visual consistency:
- Props: `title`, `url`, `children` (for rendered mockups), `height`, `showUrlBar`
- Gives owners context that this is what it looks like "on their site"

## Visual Design
Each tab will follow this layout pattern:
```text
┌─────────────────────────────────────────┐
│  [Icon] Integration Name    [Toggle]    │
│  Description with brand colour swatch   │
├─────────────────────────────────────────┤
│  ┌─ Controls ─────────────────────────┐ │
│  │ Brand Color [picker] Layout [▼]    │ │
│  │ Height [slider]  Options [toggles] │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌─ Live Preview ─────────────────────┐ │
│  │ ● ● ●  ┃ yoursite.com            │ │
│  │ ┌─────────────────────────────────┐│ │
│  │ │  [Rendered widget / iframe]     ││ │
│  │ └─────────────────────────────────┘│ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌─ Code Snippet ────────────────────┐  │
│  │ <script src="...">  [Copy]        │  │
│  └───────────────────────────────────┘  │
│                                         │
│  [Test in New Tab]                      │
└─────────────────────────────────────────┘
```

## Files
1. **Create** `src/components/integrations/WidgetPreviewFrame.tsx` — Reusable mock-browser preview wrapper
2. **Rewrite** `src/components/integrations/ElementorTab.tsx` — Interactive configurator with mockup previews for all 3 widget types
3. **Modify** `src/components/integrations/BookingBarTab.tsx` — Add contained preview + color control
4. **Modify** `src/components/integrations/FullEmbedTab.tsx` — Add preview toggle + color picker
5. **Modify** `src/components/integrations/DirectLinkTab.tsx` — Add button preview + style controls
6. **Modify** `src/components/integrations/WidgetTab.tsx` — Add collapsible iframe preview

## Result
Every embeddable integration tool becomes fully testable within the platform. Owners and ROL'OS PMS users can visually configure, preview, and validate each widget before copying the code to their site.

