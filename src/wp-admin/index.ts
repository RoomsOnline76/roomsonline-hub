/**
 * ROL'OS WP Admin Dashboard — Entry point
 * Built via Vite library mode → rolos-admin.min.js
 * Rendered into <div id="rolos-admin-root"> in WP admin pages
 */

import { RolosAdminApp } from "./components/AdminApp";

function initAdminDashboard() {
  const root = document.getElementById("rolos-admin-root");
  if (!root) return;

  // Simple render without full React — vanilla DOM for WP admin compatibility
  const app = new RolosAdminApp(root);
  app.init();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAdminDashboard);
} else {
  initAdminDashboard();
}
