import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { IntegrationToggle } from "./IntegrationToggle";
import { Button } from "@/components/ui/button";
import { Puzzle, AlertCircle, Download, RefreshCw, Rocket } from "lucide-react";
import { PUBLIC_DOMAIN } from "@/lib/config";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import JSZip from "jszip";
import { useState } from "react";

interface WordPressTabProps {
  property: { id: string; name: string; slug: string; brand_primary_color: string | null };
  showPushUpdate?: boolean;
}

export function WordPressTab({ property, showPushUpdate = false }: WordPressTabProps) {
  const queryClient = useQueryClient();
  const [pushing, setPushing] = useState(false);
  const brandColor = property.brand_primary_color || "#e91e63";

  // Fetch current plugin version from integration_configs
  const { data: integrationConfig } = useQuery({
    queryKey: ["wordpress-config", property.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("integration_configs")
        .select("id, config")
        .eq("property_id", property.id)
        .eq("integration_type", "wordpress")
        .maybeSingle();
      return data;
    },
  });

  const currentVersion = (integrationConfig?.config as Record<string, unknown>)?.plugin_version as string || "1.0.2";

  const updateUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wordpress-plugin-update`;

  const phpSnippet = `<?php
/**
 * Plugin Name: RoomsOnline Booking Widget
 * Plugin URI: https://roomsonline.co.za
 * Description: Embed the RoomsOnline booking engine on any page via shortcode.
 * Version: ${currentVersion}
 * Author: RoomsOnline
 * Author URI: https://roomsonline.co.za
 * License: GPL v2 or later
 * Text Domain: rolos-booking
 */

if (!defined('ABSPATH')) {
    exit;
}

define('ROLOS_PLUGIN_VERSION', '${currentVersion}');
define('ROLOS_PROPERTY_ID', '${property.id}');
define('ROLOS_UPDATE_URL', '${updateUrl}');

if (!function_exists('rolos_booking_activate')) {
    function rolos_booking_activate() {
        // Shortcode-only plugin: no setup required on activation.
    }
}
register_activation_hook(__FILE__, 'rolos_booking_activate');

if (!function_exists('rolos_booking_shortcode')) {
    function rolos_booking_shortcode($atts) {
        $atts = shortcode_atts(array(
            'property' => '${property.slug}',
            'property_id' => '${property.id}',
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
add_shortcode('rolos_booking', 'rolos_booking_shortcode');

/* ─── Auto-Updater ─── */

if (!function_exists('rolos_check_for_update')) {
    function rolos_check_for_update($transient) {
        if (empty($transient->checked)) {
            return $transient;
        }

        $plugin_file = plugin_basename(__FILE__);
        $response = wp_remote_post(ROLOS_UPDATE_URL, array(
            'timeout' => 10,
            'body' => wp_json_encode(array(
                'action' => 'check',
                'property_id' => ROLOS_PROPERTY_ID,
                'current_version' => ROLOS_PLUGIN_VERSION,
            )),
            'headers' => array('Content-Type' => 'application/json'),
        ));

        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            return $transient;
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (!empty($body['new_version']) && version_compare(ROLOS_PLUGIN_VERSION, $body['new_version'], '<')) {
            $transient->response[$plugin_file] = (object) array(
                'slug' => 'rolos-booking',
                'plugin' => $plugin_file,
                'new_version' => $body['new_version'],
                'package' => $body['download_url'],
                'url' => 'https://roomsonline.co.za',
                'tested' => $body['tested'] ?? '6.7',
                'requires_php' => $body['requires_php'] ?? '7.4',
            );
        }

        return $transient;
    }
}
add_filter('site_transient_update_plugins', 'rolos_check_for_update');

if (!function_exists('rolos_plugin_info')) {
    function rolos_plugin_info($result, $action, $args) {
        if ($action !== 'plugin_information' || !isset($args->slug) || $args->slug !== 'rolos-booking') {
            return $result;
        }

        $response = wp_remote_post(ROLOS_UPDATE_URL, array(
            'timeout' => 10,
            'body' => wp_json_encode(array(
                'action' => 'info',
                'property_id' => ROLOS_PROPERTY_ID,
            )),
            'headers' => array('Content-Type' => 'application/json'),
        ));

        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            return $result;
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (empty($body)) {
            return $result;
        }

        return (object) array(
            'name' => 'RoomsOnline Booking Widget',
            'slug' => 'rolos-booking',
            'version' => $body['version'] ?? ROLOS_PLUGIN_VERSION,
            'author' => '<a href="https://roomsonline.co.za">RoomsOnline</a>',
            'homepage' => 'https://roomsonline.co.za',
            'requires' => '5.8',
            'tested' => $body['tested'] ?? '6.7',
            'requires_php' => $body['requires_php'] ?? '7.4',
            'download_link' => $body['download_url'] ?? '',
            'sections' => array(
                'description' => 'Embed the RoomsOnline booking engine on any WordPress page via a simple shortcode.',
                'changelog' => $body['changelog'] ?? '<p>Bug fixes and improvements.</p>',
            ),
        );
    }
}
add_filter('plugins_api', 'rolos_plugin_info', 20, 3);`.trim();

  const shortcode = `[rolos_booking property="${property.slug}" property_id="${property.id}" color="${brandColor}"]`;

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

  const handlePushUpdate = async () => {
    setPushing(true);
    try {
      // Bump version: parse current and increment patch
      const parts = currentVersion.split(".").map(Number);
      parts[2] = (parts[2] || 0) + 1;
      const newVersion = parts.join(".");

      if (integrationConfig?.id) {
        // Update existing config
        const existingConfig = (integrationConfig.config as Record<string, unknown>) || {};
        const { error } = await supabase
          .from("integration_configs")
          .update({ config: { ...existingConfig, plugin_version: newVersion } })
          .eq("id", integrationConfig.id);
        if (error) throw error;
      } else {
        // Create config entry
        const { error } = await supabase
          .from("integration_configs")
          .insert({
            property_id: property.id,
            integration_type: "wordpress",
            is_active: true,
            config: { plugin_version: newVersion },
          });
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["wordpress-config", property.id] });
      toast({
        title: "Update pushed!",
        description: `Version ${newVersion} will be available to all WordPress sites within 12 hours (or when they manually check for updates).`,
      });
    } catch (err) {
      console.error("Push update error:", err);
      toast({ title: "Error", description: "Failed to push update.", variant: "destructive" });
    } finally {
      setPushing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Puzzle className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">WordPress Plugin</CardTitle>
            <Badge variant="outline" className="text-xs font-mono">v{currentVersion}</Badge>
          </div>
          <IntegrationToggle propertyId={property.id} integrationType="wordpress" />
        </div>
        <CardDescription>
          Install a lightweight WordPress plugin to embed a <strong>full booking engine with availability calendar,
          room rates, and checkout — all inside the widget</strong>. Guests never leave your WordPress site.
          The plugin <strong>auto-updates</strong> when you push changes from here.
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

        {/* Action buttons */}
        <div className={showPushUpdate ? "grid grid-cols-2 gap-3" : ""}>
          <Button onClick={handleDownloadZip} variant="default" className="gap-2 w-full">
            <Download className="h-4 w-4" />
            Download Plugin (.zip)
          </Button>
          {showPushUpdate && (
            <Button onClick={handlePushUpdate} variant="outline" className="gap-2" disabled={pushing}>
              {pushing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Push Update to All Sites
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground text-center -mt-2">
          <strong>Download</strong> for first install.{showPushUpdate && <> <strong>Push Update</strong> bumps the version — all WordPress sites see the update automatically.</>}
        </p>

        <div>
          <h4 className="text-sm font-medium mb-2">Shortcode</h4>
          <CodeSnippetBlock code={shortcode} language="text" title="WordPress Shortcode" />
        </div>

        <details className="group">
          <summary className="text-sm font-medium mb-2 cursor-pointer select-none list-none flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
            <span className="transition-transform group-open:rotate-90">▶</span>
            Plugin Code (Reference)
          </summary>
          <div className="mt-2">
            <CodeSnippetBlock code={phpSnippet} language="php" title="rolos-booking.php" />
          </div>
        </details>

        <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
          <h5 className="font-medium text-foreground mb-1">Installation Steps</h5>
          <ol className="list-decimal list-inside space-y-1">
            <li>Click <strong>Download Plugin</strong> above</li>
            <li>In WordPress Admin, go to <strong>Plugins → Add New → Upload Plugin</strong></li>
            <li>Select the downloaded <code className="bg-muted px-1 rounded">rolos-booking.zip</code> file</li>
            <li>Click <strong>Install Now</strong>, then <strong>Activate</strong></li>
            <li>Add the shortcode above to any page or post</li>
            <li>Optional: Adjust height with <code className="bg-muted px-1 rounded">height="600px"</code></li>
          </ol>
          <p className="mt-3 text-xs">
            <strong>Auto-Updates:</strong> Once installed, the plugin checks for updates every 12 hours. When you click <strong>Push Update</strong>, all WordPress sites will see the new version in <strong>Dashboard → Updates</strong>.
          </p>
          <p className="mt-2 text-xs italic">
            <strong>Note:</strong> This plugin only registers a shortcode — it does not create pages. If you see new pages (e.g. "Hotel Checkout"), they are from your WordPress theme or another plugin.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
