/**
 * Vite config for building WordPress CDN assets (Gutenberg blocks, availability widget, admin dashboard)
 * 
 * Usage: npx vite build --config vite.wp.config.ts
 * Output: dist/wp-assets/
 * 
 * These files are served from PUBLIC_DOMAIN/wp-assets/ and enqueued by the PHP plugin.
 */

import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  build: {
    outDir: "dist/wp-assets",
    emptyOutDir: true,
    lib: {
      entry: {
        "rolos-blocks": path.resolve(__dirname, "src/wp-blocks/index.tsx"),
        "rolos-availability": path.resolve(__dirname, "src/wp-blocks/availability-widget.ts"),
        "rolos-admin": path.resolve(__dirname, "src/wp-admin/index.ts"),
      },
      formats: ["iife"],
      name: "RolosWP",
    },
    rollupOptions: {
      // WordPress provides these globally — don't bundle them
      external: ["wp", "jQuery"],
      output: {
        globals: {
          wp: "wp",
          jQuery: "jQuery",
        },
        entryFileNames: "[name].min.js",
        // No chunking — each entry is self-contained
        manualChunks: undefined,
      },
    },
    minify: "terser",
    sourcemap: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
