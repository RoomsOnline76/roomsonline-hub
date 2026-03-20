/**
 * Vite config for building WordPress CDN assets
 * 
 * Usage: bash scripts/build-wp-assets.sh
 * Output: dist/wp-assets/
 * 
 * Builds each entry separately since IIFE format doesn't support multiple entries.
 */

import { defineConfig } from "vite";
import path from "path";

const entry = process.env.WP_ENTRY || "blocks";

const entries: Record<string, { input: string; name: string }> = {
  blocks: { input: "src/wp-blocks/index.tsx", name: "RolosBlocks" },
  availability: { input: "src/wp-blocks/availability-widget.ts", name: "RolosAvailability" },
  admin: { input: "src/wp-admin/index.ts", name: "RolosAdmin" },
};

const current = entries[entry] || entries.blocks;

export default defineConfig({
  build: {
    outDir: "dist/wp-assets",
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, current.input),
      formats: ["iife"],
      name: current.name,
      fileName: () => `rolos-${entry}.min.js`,
    },
    rollupOptions: {
      external: ["wp", "jQuery"],
      output: {
        globals: { wp: "wp", jQuery: "jQuery" },
      },
    },
    minify: "esbuild",
    sourcemap: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
