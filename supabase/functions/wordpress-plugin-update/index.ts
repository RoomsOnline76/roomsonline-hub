import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { JSZip } from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PUBLIC_DOMAIN = "https://book.sleepinafrica.roomsonline.co.za";

// ════════════════════════════════════════════════════════════════════
// PHP File Generators — Multi-file plugin structure
// ════════════════════════════════════════════════════════════════════

function generateMainPlugin(property: { id: string; slug: string; brand_primary_color: string | null }, version: string, updateUrl: string, apiUrl: string): string {
  const brandColor = property.brand_primary_color || "#e91e63";
  return `<?php
/**
 * Plugin Name: ROL'OS Plugin
 * Plugin URI: https://roomsonline.co.za
 * Description: Full-featured ROL'OS integration — booking engine, property sync, availability, and operations dashboard.
 * Version: ${version}
 * Author: RoomsOnline
 * Author URI: https://roomsonline.co.za
 * License: GPL v2 or later
 * Text Domain: rolos
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Tested up to: 6.7
 */

if (!defined('ABSPATH')) exit;

define('ROLOS_VERSION', '${version}');
define('ROLOS_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('ROLOS_PLUGIN_URL', plugin_dir_url(__FILE__));
define('ROLOS_UPDATE_URL', '${updateUrl}');
define('ROLOS_DEFAULT_PROPERTY_ID', '${property.id}');
define('ROLOS_DEFAULT_SLUG', '${property.slug}');
define('ROLOS_DEFAULT_BRAND_COLOR', '${brandColor}');
define('ROLOS_CDN_BASE', '${PUBLIC_DOMAIN}/wp-assets');

// Load classes
require_once ROLOS_PLUGIN_DIR . 'includes/class-rolos-api-client.php';
require_once ROLOS_PLUGIN_DIR . 'includes/class-rolos-sync-engine.php';
require_once ROLOS_PLUGIN_DIR . 'includes/class-rolos-settings.php';
require_once ROLOS_PLUGIN_DIR . 'includes/class-rolos-shortcodes.php';
require_once ROLOS_PLUGIN_DIR . 'includes/class-rolos-updater.php';
require_once ROLOS_PLUGIN_DIR . 'includes/class-rolos-blocks.php';
require_once ROLOS_PLUGIN_DIR . 'includes/class-rolos-admin-dashboard.php';

// ─── Activation ───
function rolos_activate() {
    $engine = new Rolos_Sync_Engine();
    $engine->register_cpt();
    flush_rewrite_rules();

    if (!get_option('rolos_api_url')) {
        update_option('rolos_api_url', '${apiUrl}');
    }
    if (!get_option('rolos_property_id')) {
        update_option('rolos_property_id', ROLOS_DEFAULT_PROPERTY_ID);
    }

    // Schedule sync cron
    if (!wp_next_scheduled('rolos_daily_sync')) {
        wp_schedule_event(time(), 'daily', 'rolos_daily_sync');
    }

    // Redirect to wizard on first activation
    set_transient('rolos_activation_redirect', true, 30);
}
register_activation_hook(__FILE__, 'rolos_activate');

// ─── Deactivation ───
function rolos_deactivate() {
    wp_clear_scheduled_hook('rolos_daily_sync');
}
register_deactivation_hook(__FILE__, 'rolos_deactivate');

// ─── Init ───
function rolos_init() {
    $engine = new Rolos_Sync_Engine();
    $engine->register_cpt();

    new Rolos_Settings();
    new Rolos_Shortcodes();
    new Rolos_Updater();
    new Rolos_Blocks();
    new Rolos_Admin_Dashboard();

    // Handle activation redirect
    if (get_transient('rolos_activation_redirect')) {
        delete_transient('rolos_activation_redirect');
        if (!isset(\$_GET['activate-multi'])) {
            wp_safe_redirect(admin_url('admin.php?page=rolos-settings&wizard=1'));
            exit;
        }
    }
}
add_action('init', 'rolos_init');

// ─── Cron hook ───
add_action('rolos_daily_sync', function() {
    \$client = new Rolos_API_Client();
    \$engine = new Rolos_Sync_Engine();
    \$engine->run_sync(\$client);
});
`;
}

function generateApiClient(apiUrl: string): string {
  return `<?php
/**
 * ROL'OS API Client — PHP SDK wrapper for roomsonline-pms-api
 */

if (!defined('ABSPATH')) exit;

class Rolos_API_Client {
    private \$api_url;
    private \$anon_key;

    public function __construct() {
        \$this->api_url = get_option('rolos_api_url', '');
        \$this->anon_key = self::decrypt_key(get_option('rolos_anon_key_enc', ''));
    }

    /**
     * Send an action to the ROL'OS PMS API
     */
    public function call(\$action, \$params = array()) {
        if (empty(\$this->api_url) || empty(\$this->anon_key)) {
            return new WP_Error('rolos_not_configured', 'ROL\\'OS API credentials not configured.');
        }

        \$body = array_merge(array('action' => \$action), \$params);

        \$response = wp_remote_post(\$this->api_url, array(
            'timeout' => 30,
            'body' => wp_json_encode(\$body),
            'headers' => array(
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . \$this->anon_key,
                'apikey' => \$this->anon_key,
            ),
        ));

        if (is_wp_error(\$response)) {
            return \$response;
        }

        \$code = wp_remote_retrieve_response_code(\$response);
        \$data = json_decode(wp_remote_retrieve_body(\$response), true);

        if (\$code !== 200) {
            return new WP_Error(
                'rolos_api_error',
                \$data['error']['message'] ?? 'API request failed',
                array('status' => \$code, 'response' => \$data)
            );
        }

        return \$data;
    }

    // ─── Convenience methods ───

    public function health_check() {
        return \$this->call('health_check');
    }

    public function get_capabilities(\$property_id) {
        return \$this->call('get_capabilities', array('propertyId' => \$property_id));
    }

    public function get_room_types(\$property_id) {
        return \$this->call('get_room_types', array('propertyId' => \$property_id));
    }

    public function get_physical_rooms(\$property_id) {
        return \$this->call('get_physical_rooms', array('propertyId' => \$property_id));
    }

    public function fetch_availability(\$property_id, \$start_date, \$end_date) {
        return \$this->call('fetch_availability', array(
            'propertyId' => \$property_id,
            'startDate' => \$start_date,
            'endDate' => \$end_date,
        ));
    }

    public function get_rate_plans(\$property_id) {
        return \$this->call('get_rate_plans', array('propertyId' => \$property_id));
    }

    public function create_reservation(\$params) {
        return \$this->call('create_reservation', \$params);
    }

    public function get_daily_metrics(\$property_id, \$date = null) {
        return \$this->call('get_daily_metrics', array(
            'propertyId' => \$property_id,
            'date' => \$date ?? date('Y-m-d'),
        ));
    }

    public function get_housekeeping_board(\$property_id) {
        return \$this->call('get_housekeeping_board', array('propertyId' => \$property_id));
    }

    // ─── Key encryption helpers ───

    public static function encrypt_key(\$plaintext) {
        if (empty(\$plaintext)) return '';
        \$key = wp_salt('auth');
        \$iv = openssl_random_pseudo_bytes(16);
        \$encrypted = openssl_encrypt(\$plaintext, 'AES-256-CBC', \$key, 0, \$iv);
        return base64_encode(\$iv . '::' . \$encrypted);
    }

    public static function decrypt_key(\$encrypted) {
        if (empty(\$encrypted)) return '';
        \$key = wp_salt('auth');
        \$parts = explode('::', base64_decode(\$encrypted), 2);
        if (count(\$parts) !== 2) return '';
        return openssl_decrypt(\$parts[1], 'AES-256-CBC', \$key, 0, \$parts[0]);
    }

    public function is_configured() {
        return !empty(\$this->api_url) && !empty(\$this->anon_key);
    }
}
`;
}

function generateSyncEngine(): string {
  return `<?php
/**
 * ROL'OS Sync Engine — CPT registration + property synchronisation
 */

if (!defined('ABSPATH')) exit;

class Rolos_Sync_Engine {

    const CPT = 'rolos_property';

    public function register_cpt() {
        if (post_type_exists(self::CPT)) return;

        register_post_type(self::CPT, array(
            'labels' => array(
                'name' => 'Properties',
                'singular_name' => 'Property',
                'menu_name' => 'ROL\\'OS Properties',
                'add_new_item' => 'Add Property',
                'edit_item' => 'Edit Property',
                'view_item' => 'View Property',
                'search_items' => 'Search Properties',
                'not_found' => 'No properties found',
            ),
            'public' => true,
            'has_archive' => true,
            'show_in_rest' => true,
            'supports' => array('title', 'editor', 'thumbnail', 'custom-fields', 'excerpt'),
            'menu_icon' => 'dashicons-building',
            'rewrite' => array('slug' => 'properties'),
        ));
    }

    /**
     * Run full sync for configured property
     */
    public function run_sync(\$client) {
        \$property_id = get_option('rolos_property_id', ROLOS_DEFAULT_PROPERTY_ID);
        if (empty(\$property_id)) return;

        // Fetch room types
        \$result = \$client->get_room_types(\$property_id);
        if (is_wp_error(\$result) || empty(\$result['success'])) {
            error_log('[ROL\\'OS Sync] Failed to fetch room types: ' . (is_wp_error(\$result) ? \$result->get_error_message() : 'API error'));
            return;
        }

        \$room_types = \$result['data'] ?? array();

        foreach (\$room_types as \$rt) {
            \$this->upsert_property_post(\$rt, \$property_id);
        }

        update_option('rolos_last_sync', current_time('mysql'));

        do_action('rolos_after_sync', \$room_types, \$property_id);
    }

    private function upsert_property_post(\$room_type, \$property_id) {
        \$rolos_id = \$room_type['id'] ?? '';
        if (empty(\$rolos_id)) return;

        // Check if post exists
        \$existing = get_posts(array(
            'post_type' => self::CPT,
            'meta_key' => 'rolos_room_type_id',
            'meta_value' => \$rolos_id,
            'posts_per_page' => 1,
            'post_status' => 'any',
        ));

        \$post_data = array(
            'post_type' => self::CPT,
            'post_title' => sanitize_text_field(\$room_type['name'] ?? 'Untitled'),
            'post_content' => wp_kses_post(\$room_type['description'] ?? ''),
            'post_status' => (\$room_type['is_active'] ?? true) ? 'publish' : 'draft',
        );

        if (!empty(\$existing)) {
            \$post_data['ID'] = \$existing[0]->ID;
            wp_update_post(\$post_data);
            \$post_id = \$existing[0]->ID;
        } else {
            \$post_id = wp_insert_post(\$post_data);
        }

        if (is_wp_error(\$post_id)) return;

        // Update meta
        update_post_meta(\$post_id, 'rolos_room_type_id', \$rolos_id);
        update_post_meta(\$post_id, 'rolos_property_id', \$property_id);
        update_post_meta(\$post_id, 'rolos_max_occupancy', \$room_type['max_occupancy'] ?? 2);
        update_post_meta(\$post_id, 'rolos_default_rate', \$room_type['default_rate'] ?? 0);
        update_post_meta(\$post_id, 'rolos_amenities', wp_json_encode(\$room_type['amenities'] ?? array()));
        update_post_meta(\$post_id, 'rolos_images', wp_json_encode(\$room_type['images'] ?? array()));

        // Sideload featured image if available
        \$images = \$room_type['images'] ?? array();
        if (!empty(\$images) && !has_post_thumbnail(\$post_id)) {
            \$first_image = is_array(\$images[0]) ? (\$images[0]['url'] ?? '') : \$images[0];
            if (!empty(\$first_image) && filter_var(\$first_image, FILTER_VALIDATE_URL)) {
                \$this->sideload_image(\$first_image, \$post_id);
            }
        }
    }

    private function sideload_image(\$url, \$post_id) {
        if (!function_exists('media_sideload_image')) {
            require_once ABSPATH . 'wp-admin/includes/media.php';
            require_once ABSPATH . 'wp-admin/includes/file.php';
            require_once ABSPATH . 'wp-admin/includes/image.php';
        }
        \$attachment_id = media_sideload_image(\$url, \$post_id, null, 'id');
        if (!is_wp_error(\$attachment_id)) {
            set_post_thumbnail(\$post_id, \$attachment_id);
        }
    }
}
`;
}

function generateSettings(): string {
  return `<?php
/**
 * ROL'OS Settings Page + Connection Wizard
 */

if (!defined('ABSPATH')) exit;

class Rolos_Settings {

    public function __construct() {
        add_action('admin_menu', array(\$this, 'add_menu'));
        add_action('admin_init', array(\$this, 'register_settings'));
        add_action('wp_ajax_rolos_test_connection', array(\$this, 'ajax_test_connection'));
        add_action('wp_ajax_rolos_manual_sync', array(\$this, 'ajax_manual_sync'));
    }

    public function add_menu() {
        add_menu_page(
            'ROL\\'OS PMS',
            'ROL\\'OS PMS',
            'manage_options',
            'rolos-settings',
            array(\$this, 'render_settings_page'),
            'dashicons-building',
            30
        );
    }

    public function register_settings() {
        register_setting('rolos_settings', 'rolos_api_url', array('sanitize_callback' => 'esc_url_raw'));
        register_setting('rolos_settings', 'rolos_anon_key_enc', array('sanitize_callback' => array(\$this, 'encrypt_on_save')));
        register_setting('rolos_settings', 'rolos_property_id', array('sanitize_callback' => 'sanitize_text_field'));
        register_setting('rolos_settings', 'rolos_sync_frequency', array('sanitize_callback' => 'sanitize_text_field'));
        register_setting('rolos_settings', 'rolos_webhook_secret', array('sanitize_callback' => 'sanitize_text_field'));
    }

    public function encrypt_on_save(\$value) {
        if (empty(\$value)) return '';
        // If it looks already encrypted, don't re-encrypt
        if (strpos(\$value, '::') !== false && strlen(\$value) > 60) return \$value;
        return Rolos_API_Client::encrypt_key(\$value);
    }

    public function render_settings_page() {
        \$is_wizard = isset(\$_GET['wizard']);
        \$last_sync = get_option('rolos_last_sync', 'Never');
        \$client = new Rolos_API_Client();
        \$is_configured = \$client->is_configured();
        ?>
        <div class="wrap">
            <h1><?php echo \$is_wizard ? '🚀 ROL\\'OS Setup Wizard' : '⚙️ ROL\\'OS PMS Settings'; ?></h1>

            <?php if (\$is_wizard): ?>
            <div class="notice notice-info"><p>
                Welcome! Enter your ROL'OS connection details below. You'll find these in your
                <strong>ROL'OS Dashboard → Website Integrations → API</strong> tab.
            </p></div>
            <?php endif; ?>

            <form method="post" action="options.php">
                <?php settings_fields('rolos_settings'); ?>

                <table class="form-table">
                    <tr>
                        <th>API Endpoint URL</th>
                        <td>
                            <input type="url" name="rolos_api_url" class="regular-text"
                                   value="<?php echo esc_attr(get_option('rolos_api_url', '')); ?>"
                                   placeholder="https://your-project.supabase.co/functions/v1/roomsonline-pms-api" />
                            <p class="description">The ROL'OS PMS API endpoint.</p>
                        </td>
                    </tr>
                    <tr>
                        <th>API Key (Anon Key)</th>
                        <td>
                            <input type="password" name="rolos_anon_key_enc" class="regular-text"
                                   value="<?php echo esc_attr(get_option('rolos_anon_key_enc', '')); ?>"
                                   placeholder="eyJhbGci..." />
                            <p class="description">Your project's publishable anon key. Stored encrypted.</p>
                        </td>
                    </tr>
                    <tr>
                        <th>Property ID</th>
                        <td>
                            <input type="text" name="rolos_property_id" class="regular-text"
                                   value="<?php echo esc_attr(get_option('rolos_property_id', ROLOS_DEFAULT_PROPERTY_ID)); ?>" />
                        </td>
                    </tr>
                    <tr>
                        <th>Webhook Secret</th>
                        <td>
                            <input type="text" name="rolos_webhook_secret" class="regular-text"
                                   value="<?php echo esc_attr(get_option('rolos_webhook_secret', '')); ?>"
                                   placeholder="Auto-generated or paste from ROL'OS dashboard" />
                            <p class="description">Used to verify incoming webhook payloads (HMAC-SHA256).</p>
                        </td>
                    </tr>
                </table>

                <?php submit_button(\$is_wizard ? 'Connect & Start Sync' : 'Save Settings'); ?>
            </form>

            <hr />

            <h2>Connection Status</h2>
            <p>Last sync: <strong><?php echo esc_html(\$last_sync); ?></strong></p>
            <p>
                <button type="button" class="button" id="rolos-test-btn">🔌 Test Connection</button>
                <button type="button" class="button button-primary" id="rolos-sync-btn">🔄 Sync Now</button>
            </p>
            <div id="rolos-status-output" style="margin-top:10px;"></div>

            <script>
            jQuery(function(\$) {
                \$('#rolos-test-btn').on('click', function() {
                    \$('#rolos-status-output').html('<p>Testing connection...</p>');
                    \$.post(ajaxurl, { action: 'rolos_test_connection', _ajax_nonce: '<?php echo wp_create_nonce("rolos_test"); ?>' }, function(resp) {
                        \$('#rolos-status-output').html('<div class="notice notice-' + (resp.success ? 'success' : 'error') + '"><p>' + (resp.data || 'Unknown result') + '</p></div>');
                    });
                });
                \$('#rolos-sync-btn').on('click', function() {
                    \$('#rolos-status-output').html('<p>Running sync...</p>');
                    \$.post(ajaxurl, { action: 'rolos_manual_sync', _ajax_nonce: '<?php echo wp_create_nonce("rolos_sync"); ?>' }, function(resp) {
                        \$('#rolos-status-output').html('<div class="notice notice-' + (resp.success ? 'success' : 'error') + '"><p>' + (resp.data || 'Unknown result') + '</p></div>');
                    });
                });
            });
            </script>
        </div>
        <?php
    }

    public function ajax_test_connection() {
        check_ajax_referer('rolos_test');
        if (!current_user_can('manage_options')) wp_send_json_error('Insufficient permissions');

        \$client = new Rolos_API_Client();
        \$result = \$client->health_check();

        if (is_wp_error(\$result)) {
            wp_send_json_error('Connection failed: ' . \$result->get_error_message());
        } else {
            wp_send_json_success('✅ Connected successfully! API is healthy.');
        }
    }

    public function ajax_manual_sync() {
        check_ajax_referer('rolos_sync');
        if (!current_user_can('manage_options')) wp_send_json_error('Insufficient permissions');

        \$client = new Rolos_API_Client();
        \$engine = new Rolos_Sync_Engine();
        \$engine->run_sync(\$client);

        wp_send_json_success('✅ Sync complete! Check your Properties for updated data.');
    }
}
`;
}

function generateShortcodes(): string {
  return `<?php
/**
 * ROL'OS Shortcodes
 */

if (!defined('ABSPATH')) exit;

class Rolos_Shortcodes {

    public function __construct() {
        add_shortcode('rolos_booking', array(\$this, 'booking_shortcode'));
        add_shortcode('rolos_property_grid', array(\$this, 'property_grid_shortcode'));
        add_shortcode('rolos_availability', array(\$this, 'availability_shortcode'));
        add_shortcode('rolos_portfolio_booking', array(\$this, 'portfolio_booking_shortcode'));
    }

    /**
     * Resolve the embed host, honouring the shortcode 'host' attr and the
     * per-site white-label option. Falls back to the ROL'OS public domain.
     */
    private function resolve_host(\$attr_host) {
        \$attr_host = trim((string) \$attr_host);
        if (\$attr_host !== '') {
            \$parsed = wp_parse_url(\$attr_host);
            if (!empty(\$parsed['host'])) {
                \$scheme = !empty(\$parsed['scheme']) ? \$parsed['scheme'] : 'https';
                return \$scheme . '://' . \$parsed['host'];
            }
        }
        \$opt = trim((string) get_option('rolos_wl_host', ''));
        if (\$opt !== '') {
            return untrailingslashit(\$opt);
        }
        return '${PUBLIC_DOMAIN}';
    }

    private function is_whitelabel(\$attr) {
        \$attr = (string) \$attr;
        if (\$attr === '1' || strtolower(\$attr) === 'true' || strtolower(\$attr) === 'yes') return true;
        // Site-wide toggle
        return (bool) get_option('rolos_wl_enabled', false);
    }

    /**
     * [rolos_booking property="slug" property_id="uuid" color="#e91e63" height="520px"
     *   whitelabel="1" host="https://book.mylodge.com"]
     */
    public function booking_shortcode(\$atts) {
        \$atts = shortcode_atts(array(
            'property' => ROLOS_DEFAULT_SLUG,
            'property_id' => get_option('rolos_property_id', ROLOS_DEFAULT_PROPERTY_ID),
            'color' => ROLOS_DEFAULT_BRAND_COLOR,
            'height' => '520px',
            'whitelabel' => '',
            'host' => '',
        ), \$atts, 'rolos_booking');

        \$base_url = \$this->resolve_host(\$atts['host']);
        \$wl = \$this->is_whitelabel(\$atts['whitelabel']);
        \$query = '?integration=wordpress&property_id=' . rawurlencode(\$atts['property_id'])
            . '&brand_color=' . rawurlencode(\$atts['color'])
            . '&mode=embedded';
        if (\$wl) {
            \$query .= '&wl=1&hide_chrome=1';
        }
        \$src = esc_url(\$base_url . '/embed/property/' . rawurlencode(\$atts['property']) . \$query);

        return '<div class="rolos-booking-widget' . (\$wl ? ' rolos-wl' : '') . '">'
            . '<iframe src="' . \$src . '" '
            . 'style="width:100%;height:' . esc_attr(\$atts['height']) . ';border:none;border-radius:8px;" '
            . 'title="Book Now" loading="lazy" allow="payment"></iframe>'
            . '</div>';
    }

    /**
     * [rolos_portfolio_booking portfolio="slug" portfolio_id="uuid" height="720px"
     *   whitelabel="1" host="https://book.mylodge.com"]
     */
    public function portfolio_booking_shortcode(\$atts) {
        \$atts = shortcode_atts(array(
            'portfolio' => '',
            'portfolio_id' => '',
            'height' => '720px',
            'whitelabel' => '',
            'host' => '',
        ), \$atts, 'rolos_portfolio_booking');

        if (empty(\$atts['portfolio'])) {
            return '<p class="rolos-error">Set the <code>portfolio</code> slug on the [rolos_portfolio_booking] shortcode.</p>';
        }

        \$base_url = \$this->resolve_host(\$atts['host']);
        \$wl = \$this->is_whitelabel(\$atts['whitelabel']);
        \$query_parts = array('integration=wordpress');
        if (!empty(\$atts['portfolio_id'])) {
            \$query_parts[] = 'ref_portfolio=' . rawurlencode(\$atts['portfolio_id']);
        }
        if (\$wl) {
            \$query_parts[] = 'wl=1';
            \$query_parts[] = 'hide_chrome=1';
        }
        \$src = esc_url(\$base_url . '/embed/portfolio/' . rawurlencode(\$atts['portfolio']) . '?' . implode('&', \$query_parts));

        return '<div class="rolos-portfolio-widget' . (\$wl ? ' rolos-wl' : '') . '">'
            . '<iframe src="' . \$src . '" '
            . 'style="width:100%;height:' . esc_attr(\$atts['height']) . ';border:none;border-radius:12px;" '
            . 'title="Book from portfolio" loading="lazy" allow="payment"></iframe>'
            . '</div>';
    }

    /**
     * [rolos_property_grid limit="12" columns="3"]
     */
    public function property_grid_shortcode(\$atts) {
        \$atts = shortcode_atts(array(
            'limit' => 12,
            'columns' => 3,
        ), \$atts, 'rolos_property_grid');

        \$query = new WP_Query(array(
            'post_type' => 'rolos_property',
            'posts_per_page' => intval(\$atts['limit']),
            'post_status' => 'publish',
        ));

        if (!\$query->have_posts()) {
            return '<p class="rolos-no-properties">No properties found. Run a sync from ROL\\'OS Settings.</p>';
        }

        \$cols = intval(\$atts['columns']);
        \$output = '<div class="rolos-property-grid" style="display:grid;grid-template-columns:repeat(' . \$cols . ',1fr);gap:24px;">';

        while (\$query->have_posts()) {
            \$query->the_post();
            \$rate = get_post_meta(get_the_ID(), 'rolos_default_rate', true);
            \$occupancy = get_post_meta(get_the_ID(), 'rolos_max_occupancy', true);
            \$thumb = get_the_post_thumbnail_url(get_the_ID(), 'medium') ?: '';

            \$output .= '<div class="rolos-property-card" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">';
            if (\$thumb) {
                \$output .= '<img src="' . esc_url(\$thumb) . '" alt="' . esc_attr(get_the_title()) . '" style="width:100%;height:200px;object-fit:cover;" />';
            }
            \$output .= '<div style="padding:16px;">';
            \$output .= '<h3 style="margin:0 0 8px;">' . esc_html(get_the_title()) . '</h3>';
            if (\$rate) {
                \$output .= '<p style="margin:0;color:#6b7280;font-size:14px;">From R' . number_format(floatval(\$rate), 0) . '/night · ' . intval(\$occupancy) . ' guests</p>';
            }
            \$output .= '<a href="' . get_permalink() . '" style="display:inline-block;margin-top:12px;padding:8px 16px;background:' . esc_attr(ROLOS_DEFAULT_BRAND_COLOR) . ';color:#fff;border-radius:6px;text-decoration:none;font-size:14px;">View Details</a>';
            \$output .= '</div></div>';
        }
        wp_reset_postdata();

        \$output .= '</div>';
        return \$output;
    }

    /**
     * [rolos_availability property_id="uuid" whitelabel="1" host="https://book.mylodge.com"]
     */
    public function availability_shortcode(\$atts) {
        \$atts = shortcode_atts(array(
            'property_id' => get_option('rolos_property_id', ROLOS_DEFAULT_PROPERTY_ID),
            'whitelabel' => '',
            'host' => '',
        ), \$atts, 'rolos_availability');

        \$id = 'rolos-avail-' . wp_rand(1000, 9999);
        wp_enqueue_script('rolos-availability', ROLOS_CDN_BASE . '/rolos-availability.min.js', array(), ROLOS_VERSION, true);

        \$host = \$this->resolve_host(\$atts['host']);
        \$wl = \$this->is_whitelabel(\$atts['whitelabel']) ? '1' : '0';

        return '<div id="' . esc_attr(\$id) . '" class="rolos-availability-widget'
            . (\$wl === '1' ? ' rolos-wl' : '') . '"'
            . ' data-property-id="' . esc_attr(\$atts['property_id']) . '"'
            . ' data-host="' . esc_attr(\$host) . '"'
            . ' data-wl="' . esc_attr(\$wl) . '"></div>';
    }
}
`;
}

function generateUpdater(): string {
  return `<?php
/**
 * ROL'OS Auto-Updater
 */

if (!defined('ABSPATH')) exit;

class Rolos_Updater {

    public function __construct() {
        add_filter('site_transient_update_plugins', array(\$this, 'check_update'));
        add_filter('plugins_api', array(\$this, 'plugin_info'), 20, 3);
    }

    public function check_update(\$transient) {
        if (empty(\$transient->checked)) return \$transient;

        \$plugin_file = plugin_basename(ROLOS_PLUGIN_DIR . 'rolos-plugin.php');
        \$response = wp_remote_post(ROLOS_UPDATE_URL, array(
            'timeout' => 10,
            'body' => wp_json_encode(array(
                'action' => 'check',
                'property_id' => get_option('rolos_property_id', ROLOS_DEFAULT_PROPERTY_ID),
                'current_version' => ROLOS_VERSION,
            )),
            'headers' => array('Content-Type' => 'application/json'),
        ));

        if (is_wp_error(\$response) || wp_remote_retrieve_response_code(\$response) !== 200) {
            return \$transient;
        }

        \$body = json_decode(wp_remote_retrieve_body(\$response), true);
        if (!empty(\$body['new_version']) && version_compare(ROLOS_VERSION, \$body['new_version'], '<')) {
            \$transient->response[\$plugin_file] = (object) array(
                'slug' => 'rolos',
                'plugin' => \$plugin_file,
                'new_version' => \$body['new_version'],
                'package' => \$body['download_url'],
                'url' => 'https://roomsonline.co.za',
                'tested' => \$body['tested'] ?? '6.7',
                'requires_php' => \$body['requires_php'] ?? '7.4',
            );
        }

        return \$transient;
    }

    public function plugin_info(\$result, \$action, \$args) {
        if (\$action !== 'plugin_information' || !isset(\$args->slug) || \$args->slug !== 'rolos') {
            return \$result;
        }

        \$response = wp_remote_post(ROLOS_UPDATE_URL, array(
            'timeout' => 10,
            'body' => wp_json_encode(array(
                'action' => 'info',
                'property_id' => get_option('rolos_property_id', ROLOS_DEFAULT_PROPERTY_ID),
            )),
            'headers' => array('Content-Type' => 'application/json'),
        ));

        if (is_wp_error(\$response) || wp_remote_retrieve_response_code(\$response) !== 200) {
            return \$result;
        }

        \$body = json_decode(wp_remote_retrieve_body(\$response), true);
        if (empty(\$body)) return \$result;

        return (object) array(
            'name' => 'ROL\\'OS Plugin',
            'slug' => 'rolos',
            'version' => \$body['version'] ?? ROLOS_VERSION,
            'author' => '<a href="https://roomsonline.co.za">RoomsOnline</a>',
            'homepage' => 'https://roomsonline.co.za',
            'requires' => '5.8',
            'tested' => \$body['tested'] ?? '6.7',
            'requires_php' => \$body['requires_php'] ?? '7.4',
            'download_link' => \$body['download_url'] ?? '',
            'sections' => array(
                'description' => 'Full ROL\\'OS PMS integration for WordPress — booking engine, property sync, availability calendar, and operations dashboard.',
                'changelog' => \$body['changelog'] ?? '<p>Bug fixes and improvements.</p>',
            ),
        );
    }
}
`;
}

function generateBlocks(): string {
  return `<?php
/**
 * ROL'OS Gutenberg Blocks + Elementor Widgets (CDN-hosted JS)
 */

if (!defined('ABSPATH')) exit;

class Rolos_Blocks {

    public function __construct() {
        add_action('enqueue_block_editor_assets', array(\$this, 'enqueue_editor_assets'));
        add_action('wp_enqueue_scripts', array(\$this, 'enqueue_frontend_assets'));

        // Elementor integration
        if (defined('ELEMENTOR_VERSION')) {
            add_action('elementor/widgets/register', array(\$this, 'register_elementor_widgets'));
        }
    }

    public function enqueue_editor_assets() {
        wp_enqueue_script(
            'rolos-blocks-editor',
            ROLOS_CDN_BASE . '/rolos-blocks.min.js',
            array('wp-blocks', 'wp-element', 'wp-editor', 'wp-components'),
            ROLOS_VERSION,
            true
        );

        wp_localize_script('rolos-blocks-editor', 'rolosBlocksConfig', array(
            'propertyId' => get_option('rolos_property_id', ROLOS_DEFAULT_PROPERTY_ID),
            'brandColor' => ROLOS_DEFAULT_BRAND_COLOR,
            'publicDomain' => '${PUBLIC_DOMAIN}',
        ));

        wp_enqueue_style(
            'rolos-blocks-editor-style',
            ROLOS_CDN_BASE . '/rolos-blocks.css',
            array(),
            ROLOS_VERSION
        );
    }

    public function enqueue_frontend_assets() {
        if (is_singular('rolos_property') || has_shortcode(get_post()->post_content ?? '', 'rolos_booking')) {
            wp_enqueue_style('rolos-frontend', ROLOS_CDN_BASE . '/rolos-frontend.css', array(), ROLOS_VERSION);
        }
    }

    public function register_elementor_widgets(\$widgets_manager) {
        // Elementor widget registration — loads from CDN JS bundle
        // Widget class is defined inline for simplicity in generated plugin
        require_once ROLOS_PLUGIN_DIR . 'includes/class-rolos-elementor-booking.php';
    }
}
`;
}

function generateElementorWidget(): string {
  return `<?php
/**
 * ROL'OS Elementor Widgets — Booking Widget, Property Card, Availability Grid
 * Registers under a custom "ROL'OS" Elementor category.
 */

if (!defined('ABSPATH')) exit;

// ── Register ROL'OS Elementor Category ──
add_action('elementor/elements/categories_registered', function(\$elements_manager) {
    \$elements_manager->add_category('rolos', array(
        'title' => 'ROL\\'OS',
        'icon'  => 'eicon-globe',
    ));
});

// ════════════════════════════════════════════════════════════════
// 1. ROL'OS Booking Widget
// ════════════════════════════════════════════════════════════════
class Rolos_Elementor_Booking_Widget extends \\Elementor\\Widget_Base {

    public function get_name() { return 'rolos_booking'; }
    public function get_title() { return 'ROL\\'OS Booking'; }
    public function get_icon() { return 'eicon-calendar'; }
    public function get_categories() { return array('rolos'); }
    public function get_keywords() { return array('rolos', 'booking', 'hotel', 'reservation'); }

    protected function register_controls() {
        // ── Content Section ──
        \$this->start_controls_section('content_section', array(
            'label' => 'Booking Settings',
            'tab'   => \\Elementor\\Controls_Manager::TAB_CONTENT,
        ));

        \$this->add_control('property_id', array(
            'label'   => 'Property ID',
            'type'    => \\Elementor\\Controls_Manager::TEXT,
            'default' => get_option('rolos_property_id', ROLOS_DEFAULT_PROPERTY_ID),
            'description' => 'UUID of the ROL\\'OS property',
        ));

        \$this->add_control('layout', array(
            'label'   => 'Layout',
            'type'    => \\Elementor\\Controls_Manager::SELECT,
            'default' => 'standard',
            'options' => array(
                'compact'  => 'Compact (date picker + book button)',
                'standard' => 'Standard (rooms + calendar)',
                'full'     => 'Full (gallery + rooms + calendar)',
            ),
        ));

        \$this->add_control('brand_color', array(
            'label'   => 'Brand Color',
            'type'    => \\Elementor\\Controls_Manager::COLOR,
            'default' => ROLOS_DEFAULT_BRAND_COLOR,
        ));

        \$this->add_control('button_text', array(
            'label'   => 'Button Text',
            'type'    => \\Elementor\\Controls_Manager::TEXT,
            'default' => 'Book Now',
        ));

        \$this->add_control('height', array(
            'label'   => 'Height',
            'type'    => \\Elementor\\Controls_Manager::TEXT,
            'default' => '520px',
        ));

        \$this->add_control('custom_css_class', array(
            'label'   => 'Custom CSS Class',
            'type'    => \\Elementor\\Controls_Manager::TEXT,
            'default' => '',
        ));

        \$this->end_controls_section();
    }

    protected function render() {
        \$s = \$this->get_settings_for_display();
        echo do_shortcode('[rolos_booking_widget property_id="' . esc_attr(\$s['property_id']) . '" height="' . esc_attr(\$s['height']) . '" color="' . esc_attr(\$s['brand_color']) . '" layout="' . esc_attr(\$s['layout']) . '"]');
    }
}

// ════════════════════════════════════════════════════════════════
// 2. ROL'OS Property Card Widget
// ════════════════════════════════════════════════════════════════
class Rolos_Elementor_Property_Card extends \\Elementor\\Widget_Base {

    public function get_name() { return 'rolos_property_card'; }
    public function get_title() { return 'ROL\\'OS Property Card'; }
    public function get_icon() { return 'eicon-image-box'; }
    public function get_categories() { return array('rolos'); }
    public function get_keywords() { return array('rolos', 'property', 'card', 'hotel'); }

    protected function register_controls() {
        \$this->start_controls_section('content_section', array(
            'label' => 'Property Card Settings',
            'tab'   => \\Elementor\\Controls_Manager::TAB_CONTENT,
        ));

        \$this->add_control('property_id', array(
            'label'   => 'Property ID',
            'type'    => \\Elementor\\Controls_Manager::TEXT,
            'default' => get_option('rolos_property_id', ROLOS_DEFAULT_PROPERTY_ID),
        ));

        \$this->add_control('show_price', array(
            'label'   => 'Show Price',
            'type'    => \\Elementor\\Controls_Manager::SWITCHER,
            'default' => 'yes',
        ));

        \$this->add_control('show_availability', array(
            'label'   => 'Show Availability',
            'type'    => \\Elementor\\Controls_Manager::SWITCHER,
            'default' => 'yes',
        ));

        \$this->add_control('card_style', array(
            'label'   => 'Card Style',
            'type'    => \\Elementor\\Controls_Manager::SELECT,
            'default' => 'detailed',
            'options' => array(
                'minimal'  => 'Minimal',
                'detailed' => 'Detailed',
            ),
        ));

        \$this->add_control('button_color', array(
            'label'   => 'Button Color',
            'type'    => \\Elementor\\Controls_Manager::COLOR,
            'default' => ROLOS_DEFAULT_BRAND_COLOR,
        ));

        \$this->end_controls_section();
    }

    protected function render() {
        \$s = \$this->get_settings_for_display();
        echo do_shortcode('[rolos_property_card property_id="' . esc_attr(\$s['property_id']) . '" show_price="' . (\$s['show_price'] === 'yes' ? '1' : '0') . '" show_availability="' . (\$s['show_availability'] === 'yes' ? '1' : '0') . '" style="' . esc_attr(\$s['card_style']) . '"]');
    }
}

// ════════════════════════════════════════════════════════════════
// 3. ROL'OS Availability Grid Widget
// ════════════════════════════════════════════════════════════════
class Rolos_Elementor_Availability_Grid extends \\Elementor\\Widget_Base {

    public function get_name() { return 'rolos_availability_grid'; }
    public function get_title() { return 'ROL\\'OS Availability Grid'; }
    public function get_icon() { return 'eicon-date'; }
    public function get_categories() { return array('rolos'); }
    public function get_keywords() { return array('rolos', 'availability', 'calendar', 'grid'); }

    protected function register_controls() {
        \$this->start_controls_section('content_section', array(
            'label' => 'Availability Grid Settings',
            'tab'   => \\Elementor\\Controls_Manager::TAB_CONTENT,
        ));

        \$this->add_control('property_id', array(
            'label'   => 'Property ID',
            'type'    => \\Elementor\\Controls_Manager::TEXT,
            'default' => get_option('rolos_property_id', ROLOS_DEFAULT_PROPERTY_ID),
        ));

        \$this->add_control('months', array(
            'label'   => 'Months to Display',
            'type'    => \\Elementor\\Controls_Manager::NUMBER,
            'default' => 2,
            'min'     => 1,
            'max'     => 6,
        ));

        \$this->add_control('color_scheme', array(
            'label'   => 'Color Scheme',
            'type'    => \\Elementor\\Controls_Manager::COLOR,
            'default' => ROLOS_DEFAULT_BRAND_COLOR,
        ));

        \$this->end_controls_section();
    }

    protected function render() {
        \$s = \$this->get_settings_for_display();
        echo do_shortcode('[rolos_availability property_id="' . esc_attr(\$s['property_id']) . '" months="' . esc_attr(\$s['months']) . '"]');
    }
}

// ── Register all widgets ──
add_action('elementor/widgets/register', function(\$widgets_manager) {
    \$widgets_manager->register(new Rolos_Elementor_Booking_Widget());
    \$widgets_manager->register(new Rolos_Elementor_Property_Card());
    \$widgets_manager->register(new Rolos_Elementor_Availability_Grid());
});
`;
}

function generateWidgetCss(): string {
  return `/* ROL'OS Widget Styles */
.rolos-booking-widget {
    max-width: 100%;
    margin: 0 auto;
}
.rolos-booking-widget iframe {
    width: 100%;
    border: none;
    border-radius: 8px;
}
.rolos-property-grid {
    display: grid;
    gap: 24px;
}
.rolos-property-card {
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
    transition: box-shadow 0.2s;
}
.rolos-property-card:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
.rolos-no-properties {
    text-align: center;
    padding: 40px;
    color: #6b7280;
}
`;
}

function generateAdminCss(): string {
  return `/* ROL'OS Admin Styles */
.rolos-admin-card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;
}
.rolos-status-ok { color: #059669; font-weight: 600; }
.rolos-status-error { color: #dc2626; font-weight: 600; }
`;
}

function generateAdminDashboard(): string {
  return `<?php
/**
 * ROL'OS Admin Dashboard — WP Admin operations panel
 * Loads CDN-hosted React dashboard for housekeeping, check-in/out, folios, and metrics
 */

if (!defined('ABSPATH')) exit;

class Rolos_Admin_Dashboard {

    public function __construct() {
        add_action('admin_menu', array(\$this, 'add_dashboard_menu'));
    }

    public function add_dashboard_menu() {
        add_submenu_page(
            'rolos-settings',
            'Operations Dashboard',
            '📊 Dashboard',
            'manage_options',
            'rolos-dashboard',
            array(\$this, 'render_dashboard')
        );
    }

    public function render_dashboard() {
        // Enqueue the CDN-hosted admin JS
        wp_enqueue_script(
            'rolos-admin-dashboard',
            ROLOS_CDN_BASE . '/rolos-admin.min.js',
            array('jquery'),
            ROLOS_VERSION,
            true
        );

        wp_enqueue_style(
            'rolos-admin-dashboard-style',
            ROLOS_PLUGIN_URL . 'assets/rolos-admin.css',
            array(),
            ROLOS_VERSION
        );

        // Pass config to JS
        wp_localize_script('rolos-admin-dashboard', 'rolosAdminConfig', array(
            'apiUrl' => get_option('rolos_api_url', ''),
            'anonKey' => Rolos_API_Client::decrypt_key(get_option('rolos_anon_key_enc', '')),
            'propertyId' => get_option('rolos_property_id', ROLOS_DEFAULT_PROPERTY_ID),
            'nonce' => wp_create_nonce('rolos_admin'),
            'ajaxUrl' => admin_url('admin-ajax.php'),
        ));

        ?>
        <div class="wrap">
            <h1>ROL'OS Operations Dashboard</h1>
            <p class="description">Real-time property operations powered by ROL'OS PMS.</p>
            <div id="rolos-admin-root" style="margin-top:20px;"></div>
        </div>
        <?php
    }
}
`;
}



serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const updateUrl = `${supabaseUrl}/functions/v1/wordpress-plugin-update`;
  const apiUrl = `${supabaseUrl}/functions/v1/roomsonline-pms-api`;

  // Handle GET requests for ZIP download
  const url = new URL(req.url);
  const downloadPropertyId = url.searchParams.get("download");

  if (req.method === "GET" && downloadPropertyId) {
    try {
      const { data: config } = await supabase
        .from("integration_configs")
        .select("config")
        .eq("property_id", downloadPropertyId)
        .eq("integration_type", "wordpress")
        .maybeSingle();

      const pluginVersion = (config?.config as Record<string, unknown>)?.plugin_version as string || "2.0.0";

      const { data: property } = await supabase
        .from("properties")
        .select("id, name, slug, brand_primary_color")
        .eq("id", downloadPropertyId)
        .single();

      if (!property) {
        return new Response("Property not found", { status: 404, headers: corsHeaders });
      }

      const zip = new JSZip();
      const folder = zip.folder("rolos-plugin")!;

      // Main plugin file
      folder.file("rolos-plugin.php", generateMainPlugin(property, pluginVersion, updateUrl, apiUrl).trimStart().replace(/^\uFEFF/, ""));

      // Includes
      const includes = folder.folder("includes")!;
      includes.file("class-rolos-api-client.php", generateApiClient(apiUrl).trimStart().replace(/^\uFEFF/, ""));
      includes.file("class-rolos-sync-engine.php", generateSyncEngine().trimStart().replace(/^\uFEFF/, ""));
      includes.file("class-rolos-settings.php", generateSettings().trimStart().replace(/^\uFEFF/, ""));
      includes.file("class-rolos-shortcodes.php", generateShortcodes().trimStart().replace(/^\uFEFF/, ""));
      includes.file("class-rolos-updater.php", generateUpdater().trimStart().replace(/^\uFEFF/, ""));
      includes.file("class-rolos-blocks.php", generateBlocks().trimStart().replace(/^\uFEFF/, ""));
      includes.file("class-rolos-elementor-booking.php", generateElementorWidget().trimStart().replace(/^\uFEFF/, ""));
      includes.file("class-rolos-admin-dashboard.php", generateAdminDashboard().trimStart().replace(/^\uFEFF/, ""));
      // Assets
      const assets = folder.folder("assets")!;
      assets.file("rolos-widget.css", generateWidgetCss());
      assets.file("rolos-admin.css", generateAdminCss());

      // Readme
      folder.file("readme.txt", `=== ROL'OS Plugin ===
Contributors: roomsonline
Tags: booking, hotel, pms, property management
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: ${pluginVersion}
License: GPLv2 or later

Full ROL'OS integration for WordPress — booking engine, property sync, and operations dashboard.

== Description ==

The ROL'OS Plugin connects your WordPress site to the ROL'OS Property Management System. Features include:

* **Booking Widget** — Embed a full booking engine via shortcode or Gutenberg block
* **Property Sync** — Auto-sync room types, rates, and images as WordPress custom posts
* **Availability Calendar** — Real-time availability checking
* **Gutenberg Blocks** — Native block editor support (CDN-hosted)
* **Elementor Widgets** — Drag-and-drop booking widget for Elementor
* **Auto-Updates** — Plugin updates automatically from the ROL'OS dashboard
* **Multi-Property** — Support for multiple properties via property ID parameter

== Installation ==

1. Upload the plugin ZIP via Plugins → Add New → Upload Plugin
2. Activate the plugin
3. Complete the connection wizard (ROL'OS → Settings)
4. Add the \`[rolos_booking]\` shortcode to any page

== Changelog ==

= ${pluginVersion} =
* Multi-file plugin architecture with PHP SDK
* Property sync engine with Custom Post Type
* Gutenberg block support (CDN-hosted)
* Elementor widget support
* Connection wizard with health check
* Webhook secret configuration
* Auto-update system
`);

      const zipBlob = await zip.generateAsync({ type: "uint8array" });

      return new Response(zipBlob, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/zip",
          "Content-Disposition": "attachment; filename=rolos-plugin.zip",
        },
      });
    } catch (zipErr) {
      console.error("ZIP generation error:", zipErr);
      return new Response("Error generating plugin", { status: 500, headers: corsHeaders });
    }
  }

  // Handle POST requests (check, info actions)
  try {
    const body = await req.json();
    const { action, property_id } = body;

    if (!property_id) {
      return new Response(JSON.stringify({ error: "property_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: config } = await supabase
      .from("integration_configs")
      .select("config")
      .eq("property_id", property_id)
      .eq("integration_type", "wordpress")
      .maybeSingle();

    const pluginVersion = (config?.config as Record<string, unknown>)?.plugin_version as string || "2.0.0";
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
        changelog: `<p>Multi-file plugin with PHP SDK, sync engine, Gutenberg blocks, and webhook support.</p>`,
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
        changelog: `<p>Multi-file plugin with PHP SDK, sync engine, Gutenberg blocks, and webhook support.</p>`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("wordpress-plugin-update error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
