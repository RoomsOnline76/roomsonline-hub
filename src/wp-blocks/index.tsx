/**
 * ROL'OS Gutenberg Blocks — Entry point
 * Built via Vite library mode → rolos-blocks.min.js
 * Enqueued by class-rolos-blocks.php from CDN
 */

import { registerPropertyExplorerBlock } from "./blocks/property-explorer";
import { registerBookingWidgetBlock } from "./blocks/booking-widget";
import { registerPropertyCardBlock } from "./blocks/property-card";

// Register all blocks on load
registerPropertyExplorerBlock();
registerBookingWidgetBlock();
registerPropertyCardBlock();
