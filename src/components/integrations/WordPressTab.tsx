import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { IntegrationToggle } from "./IntegrationToggle";
import { Button } from "@/components/ui/button";
import { Puzzle, AlertCircle, Download } from "lucide-react";
import { PUBLIC_DOMAIN } from "@/lib/config";
import JSZip from "jszip";

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
 * Plugin URI: https://roomsonline.co.za
 * Description: Embed the RoomsOnline booking engine on any page via shortcode.
 * Version: 1.0.2
 * Author: RoomsOnline
 * Author URI: https://roomsonline.co.za
 * License: GPL v2 or later
 * Text Domain: rolos-booking
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('rolos_booking_activate')) {
    function rolos_booking_activate() {
        // Shortcode-only plugin: no setup required on activation.
    }
}
register_activation_hook(__FILE__, 'rolos_booking_activate');

if (!function_exists('rolos_booking_shortcode')) {
    function rolos_booking_shortcode($atts) {
        $atts = shortcode_atts(array(
            'property' => '',
            'property_id' => '',
            'color' => '${brandColor}',
            'height' => '520px',
        ), $atts, 'rolos_booking');

        $base_url = '${PUBLIC_DOMAIN}';
        $src = esc_url($base_url . '/embed/property/' . $atts['property']
            . '?integration=wordpress&property_id=' . $atts['property_id']
            . '&brand_color=' . rawurlencode($atts['color'])
            . '&mode=embedded');

        return '<div class="rolos-booking-widget">'
            . '<iframe src="' . $src . '" '
            . 'style="width:100%;height:' . esc_attr($atts['height']) . ';border:none;border-radius:8px;" '
            . 'title="Book Now" loading="lazy" allow="payment"></iframe>'
            . '</div>';
    }
}
add_shortcode('rolos_booking', 'rolos_booking_shortcode');`.trim();

  const handleDownloadZip = async () => {
    const zip = new JSZip();
    const folder = zip.folder("rolos-booking");
    const cleanPhpSnippet = phpSnippet.replace(/^\uFEFF/, "").trimStart();
    folder?.file("rolos-booking.php", cleanPhpSnippet, { binary: false });
    
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rolos-booking.zip";
    a.click();
    URL.revokeObjectURL(url);
  };

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

        {/* Download ZIP button */}
        <Button onClick={handleDownloadZip} variant="default" className="w-full gap-2">
          <Download className="h-4 w-4" />
          Download WordPress Plugin (.zip)
        </Button>
        <p className="text-xs text-muted-foreground text-center -mt-2">
          Ready to install — go to <strong>WordPress Admin → Plugins → Add New → Upload Plugin</strong> and select this file.
        </p>

        <div>
          <h4 className="text-sm font-medium mb-2">Shortcode</h4>
          <CodeSnippetBlock code={shortcode} language="text" title="WordPress Shortcode" />
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Plugin Code (Reference)</h4>
          <CodeSnippetBlock code={phpSnippet} language="php" title="rolos-booking.php" />
        </div>

        <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
          <h5 className="font-medium text-foreground mb-1">Installation Steps</h5>
          <ol className="list-decimal list-inside space-y-1">
            <li>Click <strong>Download WordPress Plugin</strong> above</li>
            <li>In WordPress Admin, go to <strong>Plugins → Add New → Upload Plugin</strong></li>
            <li>Select the downloaded <code className="bg-muted px-1 rounded">rolos-booking.zip</code> file</li>
            <li>Click <strong>Install Now</strong>, then <strong>Activate</strong></li>
            <li>Add the shortcode above to any page or post</li>
            <li>Optional: Adjust height with <code className="bg-muted px-1 rounded">height="600px"</code></li>
          </ol>
          <p className="mt-2 text-xs italic">
            <strong>Note:</strong> This plugin only registers a shortcode — it does not create pages. If you see new pages (e.g. "Hotel Checkout"), they are from your WordPress theme or another plugin.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
