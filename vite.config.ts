import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/**
 * Build sequence. The badge used to read a hand-edited constant, so it froze between
 * releases. Each build (and each dev-server start) re-evaluates this config, so the
 * sequence is derived here from wall-clock hours since a fixed epoch and baked into the
 * bundle — it advances on its own with every build, no manual bump required.
 */
const BUILD_SEQ_BASE = 961;
const BUILD_SEQ_EPOCH_MS = Date.UTC(2026, 7, 12, 20, 0, 0); // 2026-08-12T20:00Z == base
const buildSeq =
  BUILD_SEQ_BASE + Math.max(0, Math.floor((Date.now() - BUILD_SEQ_EPOCH_MS) / 3_600_000));

/**
 * Serve the build stamp as a virtual module rather than a `define`: `define` is not applied to
 * bare identifiers in the dev transform, so the preview would keep showing the fallback.
 */
const buildInfoPlugin = () => {
  const id = "virtual:app-build-info";
  const resolved = "\0" + id;
  return {
    name: "rol-build-info",
    resolveId(source: string) {
      return source === id ? resolved : null;
    },
    load(loadedId: string) {
      if (loadedId !== resolved) return null;
      return `export const BUILD_SEQ = ${buildSeq};\nexport const BUILD_TIME = ${JSON.stringify(new Date().toISOString())};\n`;
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), buildInfoPlugin(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-motion": ["framer-motion"],
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-dropdown-menu",
          ],
        },
      },
    },
  },
}));
