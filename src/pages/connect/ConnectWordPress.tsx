import { Link } from "react-router-dom";
import { connectPath } from "@/lib/config";
import { motion } from "framer-motion";
import { ArrowRight, Blocks, Download, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeSnippetBlock } from "@/components/integrations/CodeSnippetBlock";
import { WordPressVisualWalkthrough } from "@/components/integrations/WordPressVisualWalkthrough";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const FEATURES = [
  "Automatic property data sync via cron",
  "Gutenberg blocks for booking widgets and property cards",
  "Elementor widgets — Booking, Property Card, and Availability Grid",
  "WP Admin operations dashboard",
  "Remote update system — always up to date",
  "Encrypted API key storage",
];

const shortcode = `<!-- Booking Widget -->
[rolos_booking_widget property_id="YOUR_UUID" color="#2563EB"]

<!-- Property Card -->
[rolos_property_card property_id="YOUR_UUID"]

<!-- Availability Grid -->
[rolos_availability property_id="YOUR_UUID" months="2"]`;

const gutenbergPhp = `// In your theme or plugin:
// The ROL'OS plugin registers these blocks automatically:
// - rolos/booking-widget
// - rolos/property-explorer  
// - rolos/property-card

// Just search "ROL'OS" in the Gutenberg block inserter!`;

export default function ConnectWordPress() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-primary/5 to-background pt-10 pb-8 sm:pt-16 sm:pb-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <Link to={connectPath("/connect/docs")} className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">
              ← API Reference
            </Link>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Blocks className="h-5 w-5 text-primary" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">WordPress Plugin</h1>
            </div>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Install the ROL'OS plugin on any WordPress site to sync property data, display booking widgets, and manage operations from wp-admin.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        {/* Features */}
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
          variants={fadeUp} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-xl font-semibold mb-4">What's Included</h2>
          <ul className="space-y-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                {f}
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Installation */}
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
          variants={fadeUp} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-xl font-semibold mb-4">Installation</h2>
          <ol className="space-y-4 text-sm">
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">1</span>
              <div>
                <p className="font-medium">Download the plugin</p>
                <p className="text-muted-foreground mt-1">Download <code className="bg-muted px-1 rounded text-xs">rolos-plugin.zip</code> from your ROL'OS admin panel at <strong>Integrations → WordPress Plugin</strong>.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">2</span>
              <div>
                <p className="font-medium">Upload to WordPress</p>
                <p className="text-muted-foreground mt-1">Go to <strong>Plugins → Add New → Upload Plugin</strong> in your WordPress admin. Select the ZIP file and activate.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">3</span>
              <div>
                <p className="font-medium">Configure API credentials</p>
                <p className="text-muted-foreground mt-1">Navigate to <strong>Settings → ROL'OS</strong>. Enter your API URL and API key. The plugin will verify the connection automatically.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">4</span>
              <div>
                <p className="font-medium">Sync your property</p>
                <p className="text-muted-foreground mt-1">Click <strong>Sync Now</strong> to pull room types, rates, and availability. A daily cron job keeps data fresh automatically.</p>
              </div>
            </li>
          </ol>
        </motion.div>

        {/* Elementor Widgets */}
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
          variants={fadeUp} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-xl font-semibold mb-4">Elementor Widgets</h2>
          <p className="text-sm text-muted-foreground mb-4">
            If you use Elementor, ROL'OS registers three native drag-and-drop widgets under a dedicated "ROL'OS" category:
          </p>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <div><strong>Booking Widget</strong> — Full booking engine with layout, brand color, button text, and height controls</div>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <div><strong>Property Card</strong> — Showcase card with price/availability toggles and minimal or detailed styles</div>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <div><strong>Availability Grid</strong> — Multi-month calendar showing real-time availability (1–6 months)</div>
            </li>
          </ul>
          <p className="text-sm text-muted-foreground mt-3">
            Open the Elementor editor → search "ROL'OS" in the widget panel → drag onto your page.
          </p>
        </motion.div>

        {/* Gutenberg blocks */}
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
          variants={fadeUp} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-xl font-semibold mb-4">Gutenberg Blocks</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Search for "ROL'OS" in the Gutenberg block inserter to find booking widgets, property explorers, and property cards.
          </p>
          <CodeSnippetBlock code={gutenbergPhp} language="php" title="Block Registration" />
        </motion.div>

        {/* Shortcodes */}
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
          variants={fadeUp} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-xl font-semibold mb-4">Shortcodes</h2>
          <p className="text-sm text-muted-foreground mb-4">
            For classic editors or page builders, use shortcodes to embed ROL'OS components anywhere.
          </p>
          <CodeSnippetBlock code={shortcode} language="html" title="Available Shortcodes" />
        </motion.div>

        {/* CTA */}
        <div className="pt-6 border-t text-center">
          <h3 className="text-lg font-semibold mb-2">Need Help?</h3>
          <p className="text-sm text-muted-foreground mb-4">Our team can walk you through the setup or build a custom integration.</p>
          <div className="flex items-center justify-center gap-3">
            <Link to={connectPath("/connect/get-started")}><Button className="gap-2">Get Support <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
            <Link to={connectPath("/connect/docs")}><Button variant="outline">API Reference</Button></Link>
          </div>
        </div>
      </div>
    </div>
  );
}
