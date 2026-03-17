import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { IntegrationToggle } from "./IntegrationToggle";
import { Puzzle, AlertCircle } from "lucide-react";
import { PUBLIC_DOMAIN } from "@/lib/config";

interface WordPressTabProps {
  property: { id: string; name: string; slug: string; brand_primary_color: string | null };
}

export function WordPressTab({ property }: WordPressTabProps) {
  const brandColor = property.brand_primary_color || "#e91e63";
  const encodedColor = encodeURIComponent(brandColor);
  const shortcode = `[rolos_booking property="${property.slug}" property_id="${property.id}" color="${brandColor}"]`;

  const phpSnippet = `<?php
/**
 * Plugin Name: RoomsOnline Booking Widget
 * Description: Embed RoomsOnline booking engine via shortcode.
 * Version: 1.0.0
 */

function rolos_booking_shortcode($atts) {
    $atts = shortcode_atts(array(
        'property' => '',
        'property_id' => '',
        'color' => '${brandColor}',
        'height' => '520px',
    ), $atts);
    
    $base_url = '${PUBLIC_DOMAIN}';
    $src = esc_url($base_url . '/embed/property/' . $atts['property'] 
        . '?integration=wordpress&property_id=' . $atts['property_id']
        . '&brand_color=' . urlencode($atts['color'])
        . '&mode=embedded');
    
    return '<div class="rolos-booking-widget">'
        . '<iframe src="' . $src . '" '
        . 'style="width:100%;height:' . esc_attr($atts['height']) . ';border:none;border-radius:8px;" '
        . 'title="Book Now" loading="lazy" allow="payment"></iframe>'
        . '</div>';
}
add_shortcode('rolos_booking', 'rolos_booking_shortcode');
?>`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Puzzle className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">WordPress Plugin</CardTitle>
          </div>
          <IntegrationToggle propertyId={property.id} integrationType="wordpress" />
        </div>
        <CardDescription>
          Install a lightweight WordPress plugin to embed a <strong>full booking engine with availability calendar,
          room rates, and checkout — all inside the widget</strong>. Guests never leave your WordPress site.
          Renders in your brand colour{" "}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full border" style={{ backgroundColor: brandColor }} />
            <code className="bg-muted px-1 rounded text-xs">{brandColor}</code>
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Commission info */}
        <div className="flex items-start gap-2.5 rounded-lg border border-muted bg-muted/30 p-3 text-sm">
          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <span className="text-muted-foreground">
            Bookings through this widget use the ROL'OS platform. The platform fee is as per your property agreement — no additional integration costs.
          </span>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Shortcode</h4>
          <CodeSnippetBlock code={shortcode} language="text" title="WordPress Shortcode" />
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Plugin Code (Single File)</h4>
          <CodeSnippetBlock code={phpSnippet} language="php" title="rolos-booking.php" />
        </div>

        <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
          <h5 className="font-medium text-foreground mb-1">Installation Steps</h5>
          <ol className="list-decimal list-inside space-y-1">
            <li>Copy the PHP code above and save it as <code className="bg-muted px-1 rounded">rolos-booking.php</code></li>
            <li>Upload to <code className="bg-muted px-1 rounded">wp-content/plugins/rolos-booking/</code></li>
            <li>Activate the plugin in WordPress Admin → Plugins</li>
            <li>Add the shortcode to any page or post</li>
            <li>Optional: Adjust height with <code className="bg-muted px-1 rounded">height="600px"</code></li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
