import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { JSZip } from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PUBLIC_DOMAIN = "https://book.sleepinafrica.roomsonline.co.za";

function generatePhpPlugin(property: { id: string; slug: string; brand_primary_color: string | null }, version: string, updateUrl: string): string {
  const brandColor = property.brand_primary_color || "#e91e63";
  return `<?php
/**
 * Plugin Name: RoomsOnline Booking Widget
 * Plugin URI: https://roomsonline.co.za
 * Description: Embed the RoomsOnline booking engine on any page via shortcode.
 * Version: ${version}
 * Author: RoomsOnline
 * Author URI: https://roomsonline.co.za
 * License: GPL v2 or later
 * Text Domain: rolos-booking
 */

if (!defined('ABSPATH')) {
    exit;
}

define('ROLOS_PLUGIN_VERSION', '${version}');
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
add_filter('plugins_api', 'rolos_plugin_info', 20, 3);
`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { action, property_id } = body;

    if (!property_id) {
      return new Response(JSON.stringify({ error: "property_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get integration config for this property's wordpress integration
    const { data: config } = await supabase
      .from("integration_configs")
      .select("config, is_active, property_id")
      .eq("property_id", property_id)
      .eq("integration_type", "wordpress")
      .maybeSingle();

    const pluginVersion = (config?.config as Record<string, unknown>)?.plugin_version as string || "1.0.0";

    // Get property details
    const { data: property } = await supabase
      .from("properties")
      .select("id, name, slug, brand_primary_color")
      .eq("id", property_id)
      .single();

    if (!property) {
      return new Response(JSON.stringify({ error: "Property not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updateUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/wordpress-plugin-update`;
    const downloadUrl = `${updateUrl}?download=${property_id}`;

    if (action === "check") {
      const currentVersion = body.current_version || "0.0.0";
      const hasUpdate = pluginVersion !== currentVersion && 
        pluginVersion.localeCompare(currentVersion, undefined, { numeric: true }) > 0;

      return new Response(JSON.stringify({
        new_version: hasUpdate ? pluginVersion : null,
        download_url: hasUpdate ? downloadUrl : null,
        tested: "6.7",
        requires_php: "7.4",
        changelog: `<p>Updated plugin settings and booking engine configuration.</p>`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "info") {
      return new Response(JSON.stringify({
        version: pluginVersion,
        download_url: downloadUrl,
        tested: "6.7",
        requires_php: "7.4",
        changelog: `<p>Updated plugin settings and booking engine configuration.</p>`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    // Handle GET requests for ZIP download
    const url = new URL(req.url);
    const downloadPropertyId = url.searchParams.get("download");
    
    if (req.method === "GET" && downloadPropertyId) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        const { data: config } = await supabase
          .from("integration_configs")
          .select("config")
          .eq("property_id", downloadPropertyId)
          .eq("integration_type", "wordpress")
          .maybeSingle();

        const pluginVersion = (config?.config as Record<string, unknown>)?.plugin_version as string || "1.0.0";

        const { data: property } = await supabase
          .from("properties")
          .select("id, name, slug, brand_primary_color")
          .eq("id", downloadPropertyId)
          .single();

        if (!property) {
          return new Response("Property not found", { status: 404, headers: corsHeaders });
        }

        const updateUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/wordpress-plugin-update`;
        const phpCode = generatePhpPlugin(property, pluginVersion, updateUrl);

        const zip = new JSZip();
        const folder = zip.folder("rolos-booking");
        folder?.file("rolos-booking.php", phpCode);

        const zipBlob = await zip.generateAsync({ type: "uint8array" });

        return new Response(zipBlob, {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/zip",
            "Content-Disposition": "attachment; filename=rolos-booking.zip",
          },
        });
      } catch (zipErr) {
        console.error("ZIP generation error:", zipErr);
        return new Response("Error generating plugin", { status: 500, headers: corsHeaders });
      }
    }

    console.error("wordpress-plugin-update error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
