import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { IntegrationToggle } from "./IntegrationToggle";
import { Puzzle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WordPressTabProps {
  property: { id: string; name: string; slug: string };
}

export function WordPressTab({ property }: WordPressTabProps) {
  const shortcode = `[rolos_booking property="${property.slug}" property_id="${property.id}"]`;

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
        'height' => '520px',
    ), $atts);
    
    $base_url = 'https://book.sleepinafrica.roomsonline.co.za';
    $src = esc_url($base_url . '/embed/property/' . $atts['property'] 
        . '?integration=wordpress&property_id=' . $atts['property_id']);
    
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
          Install a lightweight WordPress plugin to embed booking widgets using simple shortcodes.
          Works with any WordPress theme.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
