import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, CheckCircle2, AlertCircle, Lightbulb, Code2, Zap, Shield, ExternalLink } from "lucide-react";

interface IntegrationDocumentationProps {
  type: "direct" | "widget" | "booking_bar" | "full_embed" | "wordpress" | "api" | "elementor";
}

const documentationContent: Record<string, {
  title: string;
  overview: string;
  useCases: string[];
  quickStart: string[];
  advanced: { title: string; content: string }[];
  troubleshooting: { issue: string; solution: string }[];
  bestPractices: string[];
}> = {
  direct: {
    title: "Direct Booking Link",
    overview: "The simplest integration method — a URL that takes guests directly to your booking page. Perfect for email signatures, social media posts, QR codes, and any clickable content.",
    useCases: [
      "Email marketing campaigns and newsletters",
      "Social media bio links (Instagram, Facebook, LinkedIn)",
      "QR codes on printed materials (brochures, business cards)",
      "SMS and WhatsApp messages",
      "Google My Business booking button",
    ],
    quickStart: [
      "Copy the booking URL from the panel above",
      "Paste it as the href of any link or button on your website",
      "Test the link opens your booking page correctly",
      "All bookings from this link are automatically tracked",
    ],
    advanced: [
      {
        title: "URL Parameters",
        content: `The direct link supports several query parameters for tracking and pre-filling:
        
• source=website — Identifies traffic source (website, email, social, etc.)
• integration=direct — Marks this as a direct link integration
• property_id — Your unique property identifier (required)
• utm_campaign — For campaign tracking (e.g., utm_campaign=summer2026)
• checkin=YYYY-MM-DD — Pre-select check-in date
• checkout=YYYY-MM-DD — Pre-select check-out date
• guests=N — Pre-select number of guests`
      },
      {
        title: "Custom Styling",
        content: `When using the HTML button snippet, customize the appearance:
        
• Change background color: Replace #e91e63 with your brand color
• Modify border-radius for square or pill shapes
• Add hover effects with CSS transitions
• Match font-family to your website's typography`
      },
    ],
    troubleshooting: [
      { issue: "Link shows 404 error", solution: "Verify the property slug is correct and the property is published" },
      { issue: "Bookings not tracked", solution: "Ensure integration=direct and property_id are in the URL" },
      { issue: "Link blocked by email client", solution: "Use the full HTTPS URL with no redirects" },
    ],
    bestPractices: [
      "Use descriptive anchor text like 'Book Your Stay' instead of 'Click Here'",
      "Test links across different devices before publishing",
      "Include UTM parameters for marketing campaign tracking",
      "Consider adding a QR code version for offline materials",
    ],
  },
  widget: {
    title: "Embedded Booking Widget",
    overview: "A compact, embeddable widget that displays availability and initiates bookings without guests leaving your website. Automatically adapts to your brand colors.",
    useCases: [
      "Homepage booking section",
      "Sidebar widget on accommodation pages",
      "Landing pages for marketing campaigns",
      "Room detail pages",
      "Pop-up modals triggered by CTAs",
    ],
    quickStart: [
      "Choose iframe (simplest) or JavaScript (more flexible) embed method",
      "Copy the snippet and paste into your website HTML",
      "Place inside a container div for width control",
      "Test responsiveness on mobile and desktop",
    ],
    advanced: [
      {
        title: "Responsive Sizing",
        content: `The widget uses 100% width of its container. Control sizing via:
        
• max-width: Limit widget width on large screens
• min-height: Ensure enough space for the booking form
• Flexbox/Grid: Center widget within page layouts

Example container:
<div style="max-width: 480px; margin: 0 auto;">
  <!-- widget iframe here -->
</div>`
      },
      {
        title: "CSS Customization",
        content: `The widget inherits your property's brand_primary_color. Additional styling:
        
• Box-shadow: Adjust shadow depth for your design
• Border-radius: Match your site's corner radius (default 8px)
• Border: Add a subtle border if preferred

Note: Internal widget styles cannot be modified via CSS due to iframe sandboxing.`
      },
      {
        title: "JavaScript Events",
        content: `The JavaScript embed allows listening for events:
        
window.addEventListener('message', function(event) {
  if (event.data.type === 'rolos_booking_started') {
    console.log('User started booking');
  }
  if (event.data.type === 'rolos_widget_loaded') {
    console.log('Widget ready');
  }
});`
      },
    ],
    troubleshooting: [
      { issue: "Widget appears too small", solution: "Set explicit height (min 520px) on the iframe" },
      { issue: "Widget doesn't load", solution: "Check browser console for CSP errors; whitelist your domain" },
      { issue: "Mobile layout issues", solution: "Ensure container is max-width: 100% with no overflow" },
      { issue: "Payment not completing", solution: "Ensure allow='payment' is present on the iframe" },
    ],
    bestPractices: [
      "Place widget above the fold on key pages for visibility",
      "Use loading='lazy' to defer loading until visible",
      "Test on multiple browsers and devices",
      "Consider dark mode compatibility with your site",
    ],
  },
  booking_bar: {
    title: "Floating Booking Bar",
    overview: "A persistent bar that sticks to the bottom of your website, providing always-visible booking access without intrusive pop-ups. Ideal for multi-page journeys.",
    useCases: [
      "Property websites with multiple pages",
      "Blog or content-heavy sites",
      "Gallery and portfolio sites",
      "Any site where booking should be accessible from every page",
    ],
    quickStart: [
      "Copy the floating bar snippet",
      "Paste just before </body> in your website's footer/template",
      "The bar will appear on all pages using that template",
      "Test scrolling behavior and z-index conflicts",
    ],
    advanced: [
      {
        title: "Z-Index Management",
        content: `The bar uses z-index: 9999 by default. If conflicts occur:
        
• Your site's header/nav should be z-index < 9999
• Modals/overlays should be z-index > 9999 to appear above
• Cookie banners may need z-index adjustment

Adjust the container's z-index value if needed.`
      },
      {
        title: "Mobile Considerations",
        content: `On mobile devices:
        
• Bar height is 72px (fixed)
• Add padding-bottom: 72px to your body/main content to prevent overlap
• Consider hiding on very small screens with CSS media queries:

@media (max-height: 500px) {
  #rolos-booking-bar { display: none; }
}`
      },
      {
        title: "Page-Specific Control",
        content: `Show/hide the bar on specific pages:
        
<script>
  // Hide on checkout pages
  if (window.location.pathname.includes('/checkout')) {
    document.getElementById('rolos-booking-bar').style.display = 'none';
  }
</script>`
      },
    ],
    troubleshooting: [
      { issue: "Bar covers footer content", solution: "Add padding-bottom: 80px to your main content area" },
      { issue: "Bar hidden behind other elements", solution: "Increase z-index or reduce z-index of conflicting elements" },
      { issue: "Bar appears on mobile keyboard", solution: "Use position: fixed with bottom: 0" },
    ],
    bestPractices: [
      "Ensure the bar doesn't overlap important CTAs or content",
      "Test thoroughly on mobile devices",
      "Consider a close/minimize option for better UX",
      "Use subtle shadow for visual separation",
    ],
  },
  full_embed: {
    title: "Full Booking Engine",
    overview: "Embed the complete booking engine with room selection, availability calendar, and checkout flow. Designed for dedicated booking pages that replace external booking sites.",
    useCases: [
      "Dedicated 'Book Now' or 'Reservations' page",
      "Full-page booking experience",
      "Replacing third-party booking engines",
      "Custom booking microsites",
    ],
    quickStart: [
      "Create a new page on your website (e.g., /book or /reservations)",
      "Paste the full embed iframe into the page body",
      "Remove or minimize other page elements for focus",
      "Set the iframe to fill available space",
    ],
    advanced: [
      {
        title: "Height Management",
        content: `The booking engine adjusts based on content. For best results:
        
• Set min-height: 800px as a baseline
• Use CSS to expand: height: calc(100vh - 80px) for header offset
• The iframe will scroll internally if content exceeds height

Full-page example:
<iframe style="width:100%; min-height: 800px; height: calc(100vh - 100px);"></iframe>`
      },
      {
        title: "SEO Considerations",
        content: `Since iframe content isn't indexed:
        
• Add descriptive page title and meta tags
• Include JSON-LD structured data for your property
• Add text content above/below the iframe describing your property
• Use canonical URL to the booking page`
      },
      {
        title: "Cross-Origin Communication",
        content: `Listen for booking completion events:
        
window.addEventListener('message', function(event) {
  if (event.origin !== 'https://sleepinafrica.roomsonline.co.za') return;
  
  if (event.data.type === 'rolos_booking_complete') {
    // Redirect to thank-you page or trigger analytics
    window.location.href = '/booking-confirmed';
  }
});`
      },
    ],
    troubleshooting: [
      { issue: "Content cuts off at bottom", solution: "Increase min-height or use dynamic height script" },
      { issue: "Horizontal scrollbar appears", solution: "Ensure iframe width is 100% with no fixed pixel width" },
      { issue: "Payment modal doesn't appear", solution: "Check allow='payment' attribute is present" },
    ],
    bestPractices: [
      "Remove distracting navigation and sidebars on the booking page",
      "Ensure HTTPS is used to avoid mixed content warnings",
      "Add clear breadcrumbs so users know where they are",
      "Test the complete booking flow end-to-end",
    ],
  },
  wordpress: {
    title: "WordPress Plugin",
    overview: "A lightweight WordPress plugin that adds a shortcode for embedding booking widgets anywhere on your WordPress site. Compatible with all themes and page builders.",
    useCases: [
      "WordPress-powered hotel websites",
      "Bed & breakfast sites on WordPress",
      "WordPress page builder integrations (Elementor, Divi, etc.)",
      "Blog posts promoting special offers",
    ],
    quickStart: [
      "Copy the PHP code and save as rolos-booking.php",
      "Upload to wp-content/plugins/rolos-booking/",
      "Activate in WordPress Admin → Plugins",
      "Use [rolos_booking property=\"your-slug\"] on any page",
    ],
    advanced: [
      {
        title: "Shortcode Attributes",
        content: `Available shortcode parameters:
        
[rolos_booking 
  property="property-slug"     // Required: your property slug
  property_id="uuid"           // Required: your property ID
  height="600px"               // Optional: iframe height (default 520px)
]

Example with custom height:
[rolos_booking property="sunset-villa" property_id="abc-123" height="700px"]`
      },
      {
        title: "Page Builder Integration",
        content: `In visual builders:
        
• Elementor: Use Shortcode widget, paste shortcode
• Divi: Use Code module, paste shortcode
• Gutenberg: Use Shortcode block
• WPBakery: Use Raw HTML element

All builders support shortcodes natively.`
      },
      {
        title: "Theme Compatibility",
        content: `The plugin outputs minimal HTML and should work with any theme. If styling conflicts occur:
        
• Wrap in a custom div with your CSS class
• Override iframe styles in your theme's style.css
• Use !important sparingly if needed

.rolos-booking-widget iframe {
  box-shadow: none !important;
}`
      },
    ],
    troubleshooting: [
      { issue: "Shortcode displays as text", solution: "Verify plugin is activated in WordPress Admin" },
      { issue: "Widget doesn't appear", solution: "Check property slug matches exactly (case-sensitive)" },
      { issue: "Height not applying", solution: "Include 'px' in the height value (e.g., height=\"600px\")" },
    ],
    bestPractices: [
      "Test on a staging site before deploying to production",
      "Keep the plugin file updated when new versions are released",
      "Use descriptive page content around the widget for SEO",
      "Consider caching exclusions if using aggressive caching plugins",
    ],
  },
  api: {
    title: "Developer API",
    overview: "RESTful API for custom integrations. Query availability, property details, and generate booking URLs programmatically. Ideal for developers building custom experiences.",
    useCases: [
      "Custom booking interfaces and mobile apps",
      "Availability widgets with custom designs",
      "Integration with CRM or marketing automation",
      "Multi-property booking aggregators",
      "Automated availability alerts",
    ],
    quickStart: [
      "Generate an API key using the button above",
      "Store the key securely (environment variable, secrets manager)",
      "Include key in x-api-key header on all requests",
      "Test with the cURL example provided",
    ],
    advanced: [
      {
        title: "Authentication",
        content: `All API requests require authentication:
        
Headers:
  Content-Type: application/json
  x-api-key: YOUR_API_KEY

The API key is scoped to your property. Keep it secret — if compromised, rotate immediately using the Rotate button.`
      },
      {
        title: "Rate Limits",
        content: `To ensure service quality:
        
• 100 requests per minute per API key
• 1000 requests per hour per API key
• Exceeding limits returns 429 Too Many Requests

Best practices:
• Cache availability responses for 5-10 minutes
• Use exponential backoff on errors
• Batch requests where possible`
      },
      {
        title: "Available Endpoints",
        content: `POST /functions/v1/wordpress-plugin-api

Actions:

1. get_property_info
   Returns: Property details, room types, rate plans, amenities
   
2. get_availability
   Params: check_in (YYYY-MM-DD), check_out (YYYY-MM-DD)
   Returns: Available rooms, rates, total pricing
   
3. create_booking_redirect
   Params: check_in, check_out, guests, room_type_id
   Returns: URL to pre-filled booking page with tracking`
      },
      {
        title: "Error Handling",
        content: `API responses include status codes:

• 200 OK — Success
• 400 Bad Request — Invalid parameters
• 401 Unauthorized — Invalid or missing API key
• 404 Not Found — Property not found
• 429 Too Many Requests — Rate limited
• 500 Internal Error — Contact support

Error response format:
{
  "error": true,
  "message": "Description of the error",
  "code": "ERROR_CODE"
}`
      },
    ],
    troubleshooting: [
      { issue: "401 Unauthorized", solution: "Verify API key is correct and included in x-api-key header" },
      { issue: "Invalid property_id", solution: "Use the exact UUID shown in your integration settings" },
      { issue: "Availability returns empty", solution: "Check date format is YYYY-MM-DD and dates are in the future" },
    ],
    bestPractices: [
      "Never expose API keys in client-side code",
      "Implement proper error handling and user feedback",
      "Cache responses to reduce API calls and improve performance",
      "Monitor usage to stay within rate limits",
      "Use HTTPS exclusively for all API requests",
    ],
  },
  elementor: {
    title: "Elementor Widgets",
    overview: "ROL'OS provides three native Elementor widgets — Booking Widget, Property Card, and Availability Grid. They appear under the 'ROL'OS' category in the Elementor widget panel and use your existing shortcodes as the render backend.",
    useCases: [
      "Drag-and-drop booking engine into any Elementor page",
      "Property showcase cards on landing pages",
      "Availability calendars on room-type pages",
      "Multi-property portfolios with individual cards",
    ],
    quickStart: [
      "Install the ROL'OS Plugin and ensure Elementor is active",
      "Open the Elementor editor on any page",
      "Search 'ROL'OS' in the widget panel — 3 widgets appear",
      "Drag a widget onto your page and configure via the sidebar controls",
    ],
    advanced: [
      {
        title: "Widget Controls Reference",
        content: `Booking Widget:
• Property ID — UUID of the property
• Layout — compact, standard, or full
• Brand Color — color picker
• Button Text — customizable CTA
• Height — iframe height
• Custom CSS Class — additional styling

Property Card:
• Property ID — UUID
• Show Price — toggle
• Show Availability — toggle
• Card Style — minimal or detailed
• Button Color — color picker

Availability Grid:
• Property ID — UUID
• Months to Display — 1 to 6
• Color Scheme — color picker`,
      },
      {
        title: "Shortcode Fallback",
        content: `If Elementor is not active, you can use these shortcodes directly:

[rolos_booking_widget property_id="UUID" color="#2563EB" layout="standard"]
[rolos_property_card property_id="UUID"]
[rolos_availability property_id="UUID" months="2"]`,
      },
    ],
    troubleshooting: [
      { issue: "Widgets don't appear in Elementor", solution: "Ensure both the ROL'OS Plugin and Elementor are activated. Deactivate and reactivate the ROL'OS Plugin to re-register widgets." },
      { issue: "Widget shows blank in editor", solution: "Check that the Property ID is correct. The widget renders via shortcodes — verify shortcodes work outside Elementor first." },
      { issue: "Styles don't match my theme", solution: "Use the Brand Color and Custom CSS Class controls to align with your theme. Elementor's built-in spacing/padding controls also apply." },
    ],
    bestPractices: [
      "Use the compact layout for sidebars and the full layout for dedicated booking pages",
      "Set brand colours to match your site theme for a seamless look",
      "Test the booking flow end-to-end after embedding",
      "Keep the ROL'OS Plugin updated for the latest widget features",
    ],
  },
};

export function IntegrationDocumentation({ type }: IntegrationDocumentationProps) {
  const content = documentationContent[type];
  if (!content) return null;

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4 text-primary" />
          Implementation Guide
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* White-label mode callout — behaviour is identical for every integration type */}
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">White-label mode</p>
              <p className="text-muted-foreground">
                When your property has white-label enabled, snippets on this page automatically hide the
                "Powered by ROL'OS" chrome (adds <code className="bg-muted px-1 rounded">wl=1</code>).
                Once you connect your own booking subdomain (see the panel at the top of the Integrations tab),
                every generated URL and embed uses that domain — guests never see the ROL'OS URL.
              </p>
            </div>
          </div>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {/* Overview */}
          <AccordionItem value="overview">
            <AccordionTrigger className="text-sm hover:no-underline">
              <span className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                Overview & Use Cases
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">{content.overview}</p>
              <div>
                <h5 className="font-medium mb-2">When to use this integration:</h5>
                <ul className="space-y-1">
                  {content.useCases.map((useCase, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                      <span>{useCase}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Quick Start */}
          <AccordionItem value="quickstart">
            <AccordionTrigger className="text-sm hover:no-underline">
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-500" />
                Quick Start
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm">
              <ol className="space-y-2">
                {content.quickStart.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Badge variant="secondary" className="shrink-0 h-5 w-5 rounded-full p-0 items-center justify-center text-xs">
                      {i + 1}
                    </Badge>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </AccordionContent>
          </AccordionItem>

          {/* Advanced Configuration */}
          <AccordionItem value="advanced">
            <AccordionTrigger className="text-sm hover:no-underline">
              <span className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-violet-500" />
                Advanced Configuration
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 text-sm">
              {content.advanced.map((section, i) => (
                <div key={i} className="bg-muted/50 rounded-lg p-4">
                  <h5 className="font-medium mb-2">{section.title}</h5>
                  <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-mono">
                    {section.content}
                  </pre>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>

          {/* Troubleshooting */}
          <AccordionItem value="troubleshooting">
            <AccordionTrigger className="text-sm hover:no-underline">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                Troubleshooting
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm">
              <div className="space-y-3">
                {content.troubleshooting.map((item, i) => (
                  <div key={i} className="border-l-2 border-orange-300 pl-3">
                    <p className="font-medium text-foreground">{item.issue}</p>
                    <p className="text-muted-foreground">{item.solution}</p>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Best Practices */}
          <AccordionItem value="best-practices">
            <AccordionTrigger className="text-sm hover:no-underline">
              <span className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-500" />
                Best Practices
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm">
              <ul className="space-y-2">
                {content.bestPractices.map((practice, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{practice}</span>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
